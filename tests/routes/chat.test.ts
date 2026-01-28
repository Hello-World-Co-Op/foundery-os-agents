/**
 * Unit tests for chat routes
 *
 * @module tests/routes/chat.test
 * @see AC-1.3.2.1 - Token validation required for protected endpoints
 * @see AC-1.3.2.2 - Return 401 for invalid tokens
 * @see AC-1.3.2.4 - Use verified userId from session
 * @see AC-1.3.2.6 - Comprehensive test coverage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { chatRouter } from '../../src/routes/chat.js';

// Mock the agent service
const mockInvoke = vi.fn();
const mockInvokeStream = vi.fn();

vi.mock('../../src/services/agent-service.js', () => ({
  agentService: {
    invoke: (...args: unknown[]) => mockInvoke(...args),
    invokeStream: (...args: unknown[]) => mockInvokeStream(...args),
  },
}));

// Mock the auth middleware
const mockValidateAccessToken = vi.fn();
const mockIsAuthServiceConfigured = vi.fn();

vi.mock('../../src/ic/auth-client.js', () => ({
  validateAccessToken: (...args: unknown[]) => mockValidateAccessToken(...args),
  isAuthServiceConfigured: () => mockIsAuthServiceConfigured(),
  AuthServiceError: class AuthServiceError extends Error {
    name = 'AuthServiceError';
  },
}));

describe('chat routes', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/chat', chatRouter);

    // Default: auth service is configured
    mockIsAuthServiceConfigured.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/chat (protected)', () => {
    it('should return 401 without Authorization header (AC-1.3.2.2)', async () => {
      const response = await request(app)
        .post('/api/chat')
        .send({ agentId: 'test', message: 'hello' })
        .expect(401);

      expect(response.body.code).toBe('MISSING_TOKEN');
      expect(mockInvoke).not.toHaveBeenCalled();
    });

    it('should return 401 with invalid token (AC-1.3.2.2)', async () => {
      mockValidateAccessToken.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/chat')
        .set('Authorization', 'Bearer invalid-token')
        .send({ agentId: 'test', message: 'hello' })
        .expect(401);

      expect(response.body.code).toBe('INVALID_TOKEN');
    });

    it('should process chat with valid token (AC-1.3.2.1, AC-1.3.2.4)', async () => {
      mockValidateAccessToken.mockResolvedValue('user-456');
      mockInvoke.mockResolvedValue({
        agentId: 'chat-agent',
        message: 'Response message',
        metadata: { tokens: 50 },
      });

      const response = await request(app)
        .post('/api/chat')
        .set('Authorization', 'Bearer valid-token')
        .send({
          agentId: 'chat-agent',
          message: 'Test message',
          history: [{ role: 'user', content: 'Previous message' }],
        })
        .expect(200);

      expect(response.body.role).toBe('assistant');
      expect(response.body.content).toBe('Response message');
      expect(mockInvoke).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-456', // From validated session
        })
      );
    });

    it('should return 400 for missing required fields', async () => {
      mockValidateAccessToken.mockResolvedValue('user-123');

      await request(app)
        .post('/api/chat')
        .set('Authorization', 'Bearer valid-token')
        .send({ message: 'missing agentId' })
        .expect(400);
    });
  });

  describe('POST /api/chat/stream (protected)', () => {
    it('should return 401 without Authorization header (AC-1.3.2.2)', async () => {
      const response = await request(app)
        .post('/api/chat/stream')
        .send({ agentId: 'test', message: 'hello' })
        .expect(401);

      expect(response.body.code).toBe('MISSING_TOKEN');
    });

    it('should return 401 with invalid token (AC-1.3.2.2)', async () => {
      mockValidateAccessToken.mockResolvedValue(null);

      const response = await request(app)
        .post('/api/chat/stream')
        .set('Authorization', 'Bearer bad-token')
        .send({ agentId: 'test', message: 'hello' })
        .expect(401);

      expect(response.body.code).toBe('INVALID_TOKEN');
    });

    it('should stream with valid token (AC-1.3.2.1)', async () => {
      mockValidateAccessToken.mockResolvedValue('user-789');

      // Mock async generator for stream
      async function* mockStream() {
        yield { agentId: 'test', chunk: 'Hello', isComplete: false };
        yield { agentId: 'test', chunk: ' World', isComplete: true };
      }
      mockInvokeStream.mockReturnValue(mockStream());

      const response = await request(app)
        .post('/api/chat/stream')
        .set('Authorization', 'Bearer valid-token')
        .send({ agentId: 'test', message: 'hello' });

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/event-stream');
    });
  });
});
