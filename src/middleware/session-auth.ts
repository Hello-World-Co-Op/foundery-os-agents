/**
 * Session Authentication Middleware
 *
 * Validates session tokens with the auth-service canister before allowing
 * access to protected endpoints. Follows the oracle-bridge authentication
 * pattern for consistency.
 *
 * @module middleware/session-auth
 * @see AC-1.3.2.1 - Token validation with auth-service
 * @see AC-1.3.2.2 - Return 401 for invalid tokens
 * @see AC-1.3.2.4 - Use verified user_id from session
 * @see AC-1.3.2.5 - Follow oracle-bridge pattern
 */

import { Request, Response, NextFunction } from 'express';
import {
  validateAccessToken,
  isAuthServiceConfigured,
  AuthServiceError,
  type SessionInfo,
} from '../ic/auth-client.js';
import { getRequestId, getLogContext } from './request-id.js';

/**
 * Error codes for auth failures (AC-1.3.2.2)
 */
export const AuthErrorCode = {
  MISSING_TOKEN: 'MISSING_TOKEN',
  INVALID_TOKEN: 'INVALID_TOKEN',
  MALFORMED_TOKEN: 'MALFORMED_TOKEN',
  EXPIRED_TOKEN: 'EXPIRED_TOKEN',
  AUTH_SERVICE_ERROR: 'AUTH_SERVICE_ERROR',
  AUTH_NOT_CONFIGURED: 'AUTH_NOT_CONFIGURED',
} as const;

export type AuthErrorCode = (typeof AuthErrorCode)[keyof typeof AuthErrorCode];

/**
 * Error response format (AC-1.3.2.2)
 */
export interface AuthErrorResponse {
  error: 'Unauthorized' | 'Forbidden' | 'Service Unavailable' | 'Bad Request';
  code: AuthErrorCode;
  message: string;
}

/**
 * Token validation constants (FOS-5.6.3 AC-5.6.3.2)
 * @see F-9 (security-audit-backend-auth.md) - Insufficient bearer token validation
 */
const TOKEN_MAX_LENGTH = 500;
// Valid token characters: alphanumeric + base64 padding/delimiters
const TOKEN_VALID_CHARS = /^[a-zA-Z0-9+/=_-]+$/;

/**
 * Extended Request type with authenticated user info (AC-1.3.2.4)
 */
export interface AuthenticatedRequest extends Request {
  userId: string;
  sessionInfo?: SessionInfo;
}

/**
 * Require a valid session token to proceed (AC-1.3.2.1, AC-1.3.2.2, AC-1.3.2.4)
 *
 * Extracts the Bearer token from Authorization header, validates it with
 * auth-service, and attaches the verified user_id to the request.
 *
 * Usage:
 * ```typescript
 * router.post('/protected', requireSession, async (req: AuthenticatedRequest, res) => {
 *   console.log('User:', req.userId);
 * });
 * ```
 */
export async function requireSession(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const startTime = Date.now();

  // FOS-5.6.1 (F-3): Explicit auth bypass requires DEV_SKIP_AUTH=true
  // This is safer than using NODE_ENV which may be set by other tools
  if (process.env.DEV_SKIP_AUTH === 'true') {
    console.warn('[session-auth] DEV_SKIP_AUTH=true - bypassing authentication (development only)');
    (req as AuthenticatedRequest).userId = 'dev-user';
    next();
    return;
  }

  // Check if auth service is configured
  if (!isAuthServiceConfigured()) {
    // Auth service not configured is a configuration error
    sendAuthError(res, 503, 'Service Unavailable', AuthErrorCode.AUTH_NOT_CONFIGURED, 'Authentication service not configured');
    return;
  }

  // Extract Authorization header (Task 2.2)
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    sendAuthError(res, 401, 'Unauthorized', AuthErrorCode.MISSING_TOKEN, 'Authorization header required');
    return;
  }

  if (!authHeader.startsWith('Bearer ')) {
    sendAuthError(res, 401, 'Unauthorized', AuthErrorCode.MISSING_TOKEN, 'Authorization header must use Bearer scheme');
    return;
  }

  const token = authHeader.slice(7); // Remove "Bearer " prefix

  if (!token) {
    sendAuthError(res, 401, 'Unauthorized', AuthErrorCode.MISSING_TOKEN, 'Bearer token is empty');
    return;
  }

  // FOS-5.6.3 (F-9): Validate token format before sending to auth service
  // Return 400 Bad Request for malformed tokens (not 401)
  const tokenValidation = validateTokenFormat(token);
  if (!tokenValidation.valid) {
    sendAuthError(res, 400, 'Bad Request', AuthErrorCode.MALFORMED_TOKEN, tokenValidation.message);
    return;
  }

  try {
    // Validate token with auth-service (Task 2.3)
    const userId = await validateAccessToken(token);

    if (!userId) {
      // Token is invalid or expired (Task 2.5)
      sendAuthError(res, 401, 'Unauthorized', AuthErrorCode.INVALID_TOKEN, 'Invalid or expired session token');
      return;
    }

    // Attach verified user info to request (Task 2.4)
    (req as AuthenticatedRequest).userId = userId;

    // Log timing for debugging (Task 2.6)
    // FOS-5.6.3 (F-8): Use request ID instead of user ID in logs
    const duration = Date.now() - startTime;
    if (duration > 100) {
      console.debug(`[${getRequestId(req)}] Auth validation took ${duration}ms`);
    }

    next();
  } catch (error) {
    // Handle auth service errors
    // FOS-5.6.3 (F-8): Use request ID instead of exposing error details with user context
    const logCtx = getLogContext(req);
    console.error(`[${logCtx.requestId}] Session validation error:`, error instanceof Error ? error.message : 'Unknown error');

    if (error instanceof AuthServiceError) {
      sendAuthError(res, 503, 'Service Unavailable', AuthErrorCode.AUTH_SERVICE_ERROR, 'Unable to validate session. Please try again.');
      return;
    }

    // Unknown error - still treat as auth service issue
    sendAuthError(res, 503, 'Service Unavailable', AuthErrorCode.AUTH_SERVICE_ERROR, 'Authentication failed');
  }
}

/**
 * Optional session middleware - authenticates if token present, continues if not
 *
 * Use this for endpoints that work for both authenticated and anonymous users,
 * but provide additional features when authenticated.
 */
export async function optionalSession(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;

  // No token provided - continue as anonymous
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    (req as AuthenticatedRequest).userId = 'anonymous';
    next();
    return;
  }

  // Token provided - validate it
  await requireSession(req, res, next);
}

/**
 * Validate token format before sending to auth service (FOS-5.6.3 AC-5.6.3.2)
 *
 * Validates:
 * - Length: must be ≤500 characters
 * - Character set: alphanumeric + base64 chars only
 *
 * @param token - The bearer token to validate
 * @returns Validation result with valid flag and optional error message
 * @see F-9 (security-audit-backend-auth.md) - Insufficient bearer token validation
 */
function validateTokenFormat(token: string): { valid: boolean; message: string } {
  // Check length (prevent DoS via extremely long tokens)
  if (token.length > TOKEN_MAX_LENGTH) {
    return {
      valid: false,
      message: `Token exceeds maximum length of ${TOKEN_MAX_LENGTH} characters`,
    };
  }

  // Check character set (prevent injection attacks)
  if (!TOKEN_VALID_CHARS.test(token)) {
    return {
      valid: false,
      message: 'Token contains invalid characters',
    };
  }

  return { valid: true, message: '' };
}

/**
 * Send an auth error response (AC-1.3.2.2)
 *
 * @param res - Express response object
 * @param status - HTTP status code (401, 403, 503)
 * @param error - Error type
 * @param code - Machine-readable error code
 * @param message - Human-readable message
 */
function sendAuthError(
  res: Response,
  status: number,
  error: AuthErrorResponse['error'],
  code: AuthErrorCode,
  message: string
): void {
  // Set WWW-Authenticate header per RFC 6750 (for 401 responses)
  if (status === 401) {
    res.setHeader('WWW-Authenticate', 'Bearer realm="foundery-os-agents"');
  }

  const response: AuthErrorResponse = {
    error,
    code,
    message,
  };

  res.status(status).json(response);
}

// Re-export types for use in routes
export type { SessionInfo };
