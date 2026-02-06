/**
 * Request ID Middleware
 *
 * Generates a unique request ID for each incoming request and adds it to
 * the request context and response headers. This enables request tracing
 * without exposing user IDs in logs.
 *
 * @module middleware/request-id
 * @see FOS-5.6.3 AC-5.6.3.1 - Auth logs use opaque request IDs, not user IDs
 * @see F-8 (security-audit-backend-auth.md) - Verbose auth logging finding
 */

import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * Extended request type with request ID
 */
export interface RequestWithId extends Request {
  requestId: string;
}

/**
 * Response header name for request ID
 */
export const REQUEST_ID_HEADER = 'X-Request-ID';

/**
 * Request ID middleware
 *
 * Generates a UUID v4 for each request and:
 * 1. Attaches it to req.requestId for use in logs
 * 2. Sets the X-Request-ID response header for client correlation
 * 3. Accepts incoming X-Request-ID header for distributed tracing
 *
 * Usage:
 * ```typescript
 * app.use(requestId);
 * ```
 */
export function requestId(req: Request, res: Response, next: NextFunction): void {
  // Accept incoming request ID for distributed tracing, or generate new one
  const incomingId = req.headers['x-request-id'];
  const id = typeof incomingId === 'string' && incomingId.length > 0 && incomingId.length <= 64
    ? incomingId
    : randomUUID();

  // Attach to request for use in handlers and other middleware
  (req as RequestWithId).requestId = id;

  // Set response header for client correlation
  res.setHeader(REQUEST_ID_HEADER, id);

  next();
}

/**
 * Get request ID from request object
 *
 * Safe accessor that returns 'unknown' if request ID is not set.
 * Use this in logs instead of user IDs.
 *
 * @param req - Express request object
 * @returns The request ID or 'unknown'
 */
export function getRequestId(req: Request): string {
  return (req as RequestWithId).requestId || 'unknown';
}

/**
 * Create a log-safe context object
 *
 * Converts request context to a safe-to-log format that uses request IDs
 * instead of user IDs or other PII.
 *
 * @param req - Express request object
 * @returns Log-safe context object
 */
export function getLogContext(req: Request): Record<string, string> {
  const requestId = getRequestId(req);
  return {
    requestId,
    method: req.method,
    path: req.path,
  };
}
