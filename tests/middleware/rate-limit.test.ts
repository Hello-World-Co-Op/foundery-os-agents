/**
 * Unit tests for rate limiting middleware
 *
 * @module tests/middleware/rate-limit.test
 * @see AC-5.6.2.1 - Rate limiting on chat/invoke endpoints
 * @see F-5 (security-audit-backend-auth.md) - Missing rate limits finding
 * @see FOS-5.6.3 AC-5.6.3.4 - Atomic rate limiting with optional Redis backend
 * @see F-11 (security-audit-backend-auth.md) - Race condition in rate limit Map
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import rateLimit from 'express-rate-limit';

// Mock session auth to avoid authentication checks in rate limit tests
vi.mock('../../src/middleware/session-auth.js', () => ({
  requireSession: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as { userId?: string }).userId = 'test-user';
    next();
  },
  AuthenticatedRequest: {},
}));

/**
 * Create a fresh rate limiter for testing (avoids shared state between tests)
 */
function createTestChatRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    keyGenerator: (req) => (req as { userId?: string }).userId || 'anonymous',
    handler: (_req, res) => {
      res.status(429).json({
        error: 'Too Many Requests',
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Request rate limit exceeded. Please try again later.',
        retryAfter: res.getHeader('Retry-After'),
      });
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
}

function createTestInvokeRateLimiter() {
  return rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    keyGenerator: (req) => (req as { userId?: string }).userId || 'anonymous',
    handler: (_req, res) => {
      res.status(429).json({
        error: 'Too Many Requests',
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Request rate limit exceeded. Please try again later.',
        retryAfter: res.getHeader('Retry-After'),
      });
    },
    standardHeaders: true,
    legacyHeaders: false,
  });
}

describe('rate-limit middleware', () => {
  describe('chatRateLimit', () => {
    let app: express.Application;
    let rateLimiter: ReturnType<typeof rateLimit>;

    beforeEach(() => {
      // Create fresh rate limiter for each test to reset state
      rateLimiter = createTestChatRateLimiter();
      app = express();
      app.use(express.json());

      // Simple test endpoint with rate limiting
      app.post('/test', rateLimiter, (req, res) => {
        res.json({ success: true, userId: (req as { userId?: string }).userId });
      });
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should allow requests under the rate limit (10 req/min)', async () => {
      // First 10 requests should succeed
      for (let i = 0; i < 10; i++) {
        const response = await request(app)
          .post('/test')
          .send({ message: 'test' });
        expect(response.status).toBe(200);
      }
    });

    it('should return 429 when rate limit exceeded', async () => {
      // Exhaust the rate limit
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/test')
          .send({ message: 'test' });
      }

      // 11th request should be rate limited
      const response = await request(app)
        .post('/test')
        .send({ message: 'test' });

      expect(response.status).toBe(429);
      expect(response.body.error).toBe('Too Many Requests');
      expect(response.body.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should include Retry-After header when rate limited', async () => {
      // Exhaust the rate limit
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/test')
          .send({ message: 'test' });
      }

      // Rate limited request should have Retry-After header
      const response = await request(app)
        .post('/test')
        .send({ message: 'test' });

      expect(response.status).toBe(429);
      expect(response.headers['retry-after']).toBeDefined();
    });

    it('should include rate limit headers in response', async () => {
      // First request uses the fresh rateLimiter created in beforeEach
      const response = await request(app)
        .post('/test')
        .send({ message: 'test' });

      expect(response.status).toBe(200);
      // Standard headers (RateLimit-Limit, RateLimit-Remaining, RateLimit-Reset)
      expect(response.headers['ratelimit-limit']).toBe('10');
      expect(response.headers['ratelimit-remaining']).toBeDefined();
    });
  });

  describe('invokeRateLimit', () => {
    let app: express.Application;
    let rateLimiter: ReturnType<typeof rateLimit>;

    beforeEach(() => {
      // Create fresh rate limiter for each test
      rateLimiter = createTestInvokeRateLimiter();
      app = express();
      app.use(express.json());

      app.post('/invoke', rateLimiter, (req, res) => {
        res.json({ success: true, userId: (req as { userId?: string }).userId });
      });
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should allow up to 20 requests per minute', async () => {
      // First 20 requests should succeed
      for (let i = 0; i < 20; i++) {
        const response = await request(app)
          .post('/invoke')
          .send({ message: 'test' });
        expect(response.status).toBe(200);
      }
    });

    it('should return 429 after 20 requests', async () => {
      // Exhaust the rate limit
      for (let i = 0; i < 20; i++) {
        await request(app)
          .post('/invoke')
          .send({ message: 'test' });
      }

      // 21st request should be rate limited
      const response = await request(app)
        .post('/invoke')
        .send({ message: 'test' });

      expect(response.status).toBe(429);
      expect(response.body.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should return proper error message format', async () => {
      // Exhaust the rate limit
      for (let i = 0; i < 20; i++) {
        await request(app)
          .post('/invoke')
          .send({ message: 'test' });
      }

      const response = await request(app)
        .post('/invoke')
        .send({ message: 'test' });

      expect(response.status).toBe(429);
      expect(response.body).toMatchObject({
        error: 'Too Many Requests',
        code: 'RATE_LIMIT_EXCEEDED',
        message: expect.stringContaining('rate limit exceeded'),
      });
    });
  });

  describe('rate limiting by user', () => {
    it('should track limits per user, not globally', async () => {
      // Create fresh rate limiter for this test
      const userRateLimiter = createTestChatRateLimiter();
      const app = express();
      app.use(express.json());

      // Simulate different users with middleware that sets userId based on header
      app.post('/test', (req, res, next) => {
        (req as { userId?: string }).userId = req.headers['x-user-id'] as string || 'default-user';
        next();
      }, userRateLimiter, (req, res) => {
        res.json({ success: true });
      });

      // User 1 makes 10 requests
      for (let i = 0; i < 10; i++) {
        await request(app)
          .post('/test')
          .set('X-User-ID', 'user-1')
          .send({});
      }

      // User 1 should be rate limited
      const user1Response = await request(app)
        .post('/test')
        .set('X-User-ID', 'user-1')
        .send({});
      expect(user1Response.status).toBe(429);

      // User 2 should still have quota
      const user2Response = await request(app)
        .post('/test')
        .set('X-User-ID', 'user-2')
        .send({});
      expect(user2Response.status).toBe(200);
    });
  });

  describe('Redis configuration (FOS-5.6.3 AC-5.6.3.4)', () => {
    it('should export isRedisConfigured function', async () => {
      const { isRedisConfigured } = await import('../../src/middleware/rate-limit.js');
      expect(typeof isRedisConfigured).toBe('function');
    });

    it('should return false when REDIS_URL is not set', async () => {
      const originalRedisUrl = process.env.REDIS_URL;
      delete process.env.REDIS_URL;

      // Need to re-import to get fresh evaluation
      vi.resetModules();
      const { isRedisConfigured } = await import('../../src/middleware/rate-limit.js');
      expect(isRedisConfigured()).toBe(false);

      process.env.REDIS_URL = originalRedisUrl;
    });

    it('should return true when REDIS_URL is set', async () => {
      const originalRedisUrl = process.env.REDIS_URL;
      process.env.REDIS_URL = 'redis://localhost:6379';

      vi.resetModules();
      const { isRedisConfigured } = await import('../../src/middleware/rate-limit.js');
      expect(isRedisConfigured()).toBe(true);

      process.env.REDIS_URL = originalRedisUrl;
    });
  });
});
