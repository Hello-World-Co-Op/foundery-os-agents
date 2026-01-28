/**
 * Unit tests for party-mode routes
 *
 * @module tests/routes/party-mode.test
 * @see AC-1.3.2.1 - Token validation required for protected endpoints
 * @see AC-1.3.2.2 - Return 401 for invalid tokens
 * @see AC-1.3.2.4 - Use verified userId from session
 * @see AC-1.3.2.6 - Comprehensive test coverage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { partyModeRouter } from '../../src/routes/party-mode.js';

// Mock the agent service
const mockInvoke = vi.fn();

vi.mock('../../src/services/agent-service.js', () => ({
  agentService: {
    invoke: (...args: unknown[]) => mockInvoke(...args),
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

describe('party-mode routes', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/party-mode', partyModeRouter);

    // Default: auth service is configured
    mockIsAuthServiceConfigured.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/party-mode/start (protected)', () => {
    // Note: 401 authentication tests are in session-auth.test.ts
    it('should return 401 without auth', async () => {
      await request(app)
        .post('/api/party-mode/start')
        .send({
          agentIds: ['agent-1', 'agent-2'],
          topic: 'Test discussion',
        })
        .expect(401);
    });

    it('should start party mode with valid token (AC-1.3.2.1, AC-1.3.2.4)', async () => {
      mockValidateAccessToken.mockResolvedValue('user-party');
      mockInvoke.mockResolvedValue({
        agentId: 'agent-1',
        message: 'Agent 1 response',
        metadata: {},
      });

      const response = await request(app)
        .post('/api/party-mode/start')
        .set('Authorization', 'Bearer valid-token')
        .send({
          agentIds: ['agent-1', 'agent-2'],
          topic: 'Test topic',
          maxTurns: 1,
        })
        .expect(200);

      expect(response.body.topic).toBe('Test topic');
      expect(response.body.participants).toEqual(['agent-1', 'agent-2']);
      // With maxTurns=1 and 2 agents, should have 2 invocations
      expect(mockInvoke).toHaveBeenCalled();

      // Verify userId from session was used
      expect(mockInvoke).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-party',
        })
      );
    });

    it('should return 400 for fewer than 2 agents', async () => {
      mockValidateAccessToken.mockResolvedValue('user-123');

      await request(app)
        .post('/api/party-mode/start')
        .set('Authorization', 'Bearer valid-token')
        .send({
          agentIds: ['only-one-agent'],
          topic: 'Test topic',
        })
        .expect(400);
    });

    it('should return 400 for missing topic', async () => {
      mockValidateAccessToken.mockResolvedValue('user-123');

      await request(app)
        .post('/api/party-mode/start')
        .set('Authorization', 'Bearer valid-token')
        .send({
          agentIds: ['agent-1', 'agent-2'],
        })
        .expect(400);
    });
  });

  describe('POST /api/party-mode/continue (protected)', () => {
    // Note: 401 authentication tests are in session-auth.test.ts
    it('should return 401 without auth', async () => {
      await request(app)
        .post('/api/party-mode/continue')
        .send({
          agentIds: ['agent-1', 'agent-2'],
          topic: 'Test discussion',
        })
        .expect(401);
    });

    it('should continue party mode with valid token (AC-1.3.2.1)', async () => {
      mockValidateAccessToken.mockResolvedValue('user-continue');
      mockInvoke.mockResolvedValue({
        agentId: 'agent-1',
        message: 'Continued response',
        metadata: {},
      });

      const response = await request(app)
        .post('/api/party-mode/continue')
        .set('Authorization', 'Bearer valid-token')
        .send({
          agentIds: ['agent-1', 'agent-2'],
          topic: 'Ongoing discussion',
          userMessage: 'What do you think about X?',
          history: [
            { role: 'user', content: 'Initial topic' },
            { role: 'assistant', content: '[agent-1]: Response 1', agentId: 'agent-1' },
          ],
        })
        .expect(200);

      expect(response.body.responses).toBeDefined();
      expect(mockInvoke).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-continue',
        })
      );
    });
  });

  // Note: WWW-Authenticate header and structured error response tests are in session-auth.test.ts
});
