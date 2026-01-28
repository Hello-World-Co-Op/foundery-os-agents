/**
 * Auth Service Client for validating session tokens via IC canister calls
 *
 * Follows the oracle-bridge authentication pattern for consistency (AC-1.3.2.5)
 *
 * @module ic/auth-client
 * @see AC-1.3.2.1 - Token validation with auth-service
 * @see AC-1.3.2.4 - Use verified user_id instead of untrusted header
 */

import { HttpAgent, Actor, type ActorSubclass } from '@dfinity/agent';
import { Principal } from '@dfinity/principal';
import { config } from '../config/index.js';
import {
  idlFactory,
  type AuthServiceInterface,
  type ValidateAccessTokenResult,
  type ValidateSessionResult,
  type SessionInfo,
} from './declarations/auth-service.js';

// Cached agent and actor instances for connection pooling (Task 1.5)
let agent: HttpAgent | null = null;
let authActor: ActorSubclass<AuthServiceInterface> | null = null;

/**
 * Get or create the auth service actor with connection pooling
 *
 * @returns The auth service actor instance
 * @throws Error if canister ID is not configured
 */
function getAuthActor(): ActorSubclass<AuthServiceInterface> {
  if (authActor) {
    return authActor;
  }

  const canisterId = config.ic.authServiceCanisterId;

  if (!canisterId) {
    throw new Error(
      'AUTH_SERVICE_CANISTER_ID not configured. Set this environment variable to enable session validation.'
    );
  }

  agent = new HttpAgent({
    host: config.ic.host,
  });

  // Disable certificate verification in local development
  // This is required when connecting to a local replica
  if (config.server.nodeEnv === 'development') {
    agent.fetchRootKey().catch((err) => {
      console.warn('Failed to fetch root key (expected in local dev):', err);
    });
  }

  authActor = Actor.createActor<AuthServiceInterface>(idlFactory, {
    agent,
    canisterId: Principal.fromText(canisterId),
  });

  return authActor;
}

/**
 * Reset the cached actor (useful for testing)
 */
export function resetAuthActor(): void {
  agent = null;
  authActor = null;
}

/**
 * Validate an access token and return the user_id if valid
 *
 * This is a fast query-only call that returns just the user ID.
 * Use validateSession() if you need full session details.
 *
 * @param token - The access token from Authorization header
 * @returns The user_id if valid, null if invalid
 * @see AC-1.3.2.1 - Verify token with auth-service
 */
export async function validateAccessToken(
  token: string
): Promise<string | null> {
  try {
    const actor = getAuthActor();
    const result: ValidateAccessTokenResult = await actor.validate_access_token(token);

    if ('Ok' in result) {
      return result.Ok;
    }

    // Token is invalid - log the error type for debugging
    console.debug(`Token validation failed: ${result.Err}`);
    return null;
  } catch (error) {
    console.error('Auth service call failed:', error);
    throw new AuthServiceError(
      'Unable to validate session with auth service',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Validate a session and return full session info if valid
 *
 * This provides more details including device trust level and anomaly detection.
 *
 * @param token - The access token from Authorization header
 * @param ipHash - Optional hash of the client IP for anomaly detection
 * @returns SessionInfo if valid, null if invalid
 * @see AC-1.3.2.4 - Get verified user info from session
 */
export async function validateSession(
  token: string,
  ipHash?: string
): Promise<SessionInfo | null> {
  try {
    const actor = getAuthActor();
    const ipHashOpt: [] | [string] = ipHash ? [ipHash] : [];
    const result: ValidateSessionResult = await actor.validate_session(
      token,
      ipHashOpt
    );

    if ('Ok' in result) {
      return result.Ok;
    }

    // Session is invalid
    console.debug(`Session validation failed: ${result.Err}`);
    return null;
  } catch (error) {
    console.error('Auth service call failed:', error);
    throw new AuthServiceError(
      'Unable to validate session with auth service',
      error instanceof Error ? error : undefined
    );
  }
}

/**
 * Check if the auth service canister is configured
 *
 * @returns true if AUTH_SERVICE_CANISTER_ID is set
 */
export function isAuthServiceConfigured(): boolean {
  return Boolean(config.ic.authServiceCanisterId);
}

/**
 * Custom error class for auth service failures
 */
export class AuthServiceError extends Error {
  public readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message);
    this.name = 'AuthServiceError';
    this.cause = cause;
  }
}

// Re-export types for use in middleware
export type { SessionInfo, ValidateAccessTokenResult, ValidateSessionResult };
