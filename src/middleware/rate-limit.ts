/**
 * Rate limiting middleware for resource-intensive endpoints
 *
 * @module middleware/rate-limit
 * @see FOS-5.6.2 AC-5.6.2.1 - Rate limiting on chat/invoke endpoints
 * @see F-5 (security-audit-backend-auth.md) - Missing rate limits finding
 */

import rateLimit from 'express-rate-limit';
import type { Request, Response } from 'express';
import type { AuthenticatedRequest } from './session-auth.js';

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
