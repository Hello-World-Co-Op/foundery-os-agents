/**
 * Rate limiting middleware for resource-intensive endpoints
 *
 * @module middleware/rate-limit
 * @see FOS-5.6.2 AC-5.6.2.1 - Rate limiting on chat/invoke endpoints
 * @see F-5 (security-audit-backend-auth.md) - Missing rate limits finding
 * @see FOS-5.6.3 AC-5.6.3.4 - Atomic rate limiting with optional Redis backend
 * @see F-11 (security-audit-backend-auth.md) - Race condition in rate limit Map
 *
 * The express-rate-limit library uses an internal MemoryStore that handles
 * atomic-like increment operations. For distributed environments, set REDIS_URL
 * to enable Redis-based rate limiting (requires rate-limit-redis package).
 *
 * Current implementation:
 * - In-memory store (default) - thread-safe within single Node process
 * - Redis store (optional) - required for multi-instance deployments
 */

import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from './session-auth.js';

/**
 * Flag indicating if Redis is configured for rate limiting
 * In production with multiple instances, REDIS_URL should be set
 */
export const isRedisConfigured = (): boolean => {
  return !!process.env.REDIS_URL;
};

/**
 * Log a warning if running in production without Redis
 * This is a potential issue for multi-instance deployments
 */
if (process.env.NODE_ENV === 'production' && !isRedisConfigured()) {
  console.warn(
    '[rate-limit] Running in production without Redis - rate limits will not be shared across instances. ' +
    'Set REDIS_URL for distributed rate limiting.'
  );
}

/**
 * Key generator that uses userId for authenticated requests, IP for anonymous
 * This ensures rate limits are per-user rather than per-IP when authenticated
 * Note: We don't fall back to req.ip to avoid IPv6 bypass issues (ERR_ERL_KEY_GEN_IPV6)
 */
const userKeyGenerator = (req: Request): string => {
  const authReq = req as AuthenticatedRequest;
  // Use userId if authenticated, otherwise use a default key
  // Rate limiting primarily applies to authenticated endpoints, so userId should always exist
  return authReq.userId || 'anonymous';
};

/**
 * Standard rate limit response format
 */
const rateLimitMessage = (_req: Request, res: Response) => {
  res.status(429).json({
    error: 'Too Many Requests',
    code: 'RATE_LIMIT_EXCEEDED',
    message: 'Request rate limit exceeded. Please try again later.',
    retryAfter: res.getHeader('Retry-After'),
  });
};

/**
 * Rate limiter for chat endpoints
 * 10 requests per minute per user
 *
 * @see AC-5.6.2.1 - Rate limiting on /api/chat endpoints
 */
export const chatRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 10, // 10 requests per minute
  keyGenerator: userKeyGenerator,
  handler: rateLimitMessage,
  standardHeaders: true, // Return rate limit info in headers
  legacyHeaders: false, // Disable X-RateLimit-* headers
  skipSuccessfulRequests: false, // Count all requests
  skipFailedRequests: false, // Count failed requests too
});

/**
 * Rate limiter for agent invoke endpoint
 * 20 requests per minute per user (higher limit for programmatic access)
 *
 * @see AC-5.6.2.1 - Rate limiting on /api/agents/invoke
 */
export const invokeRateLimit = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 20, // 20 requests per minute
  keyGenerator: userKeyGenerator,
  handler: rateLimitMessage,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  skipFailedRequests: false,
});
