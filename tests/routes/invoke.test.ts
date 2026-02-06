/**
 * Unit tests for invoke routes
 *
 * @module tests/routes/invoke.test
 * @see AC-1.3.2.1 - Token validation required for protected endpoints
 * @see AC-1.3.2.2 - Return 401 for invalid tokens
 * @see AC-1.3.2.3 - Public vs protected endpoint classification
 * @see AC-1.3.2.6 - Comprehensive test coverage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import { invokeRouter } from '../../src/routes/invoke.js';

// Mock the agent service
const mockInvoke = vi.fn();
const mockListAgents = vi.fn();
const mockGetPersona = vi.fn();

vi.mock('../../src/services/agent-service.js', () => ({
  agentService: {
    invoke: (...args: unknown[]) => mockInvoke(...args),
    listAgents: () => mockListAgents(),
    getPersona: (id: string) => mockGetPersona(id),
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

// Mock the agent registry to accept any agent ID in route tests
// (agent ID validation is tested separately in agent-id.test.ts)
vi.mock('../../src/agents/registry.js', () => ({
  isAgentRegistered: () => true,
  getAllAgentIds: () => ['bob', 'test', 'test-agent'],
}));

describe('invoke routes', () => {
  let app: express.Application;

  beforeEach(() => {
    vi.clearAllMocks();

    app = express();
    app.use(express.json());
    app.use('/api/agents', invokeRouter);

    // Default: auth service is configured
    mockIsAuthServiceConfigured.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/agents/list (public)', () => {
    it('should return agent list without authentication (AC-1.3.2.3)', async () => {
      mockListAgents.mockResolvedValue([
        { id: 'agent-1', name: 'Test Agent' },
      ]);

      const response = await request(app)
        .get('/api/agents/list')
        .expect(200);

      expect(response.body.agents).toHaveLength(1);
      expect(mockValidateAccessToken).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/agents/:agentId (public)', () => {
    it('should return agent details without authentication (AC-1.3.2.3)', async () => {
      mockGetPersona.mockResolvedValue({
        id: 'agent-1',
        name: 'Test Agent',
        role: 'assistant',
        description: 'A test agent',
        capabilities: ['chat'],
        tags: ['test'],
      });

      const response = await request(app)
        .get('/api/agents/agent-1')
        .expect(200);

      expect(response.body.id).toBe('agent-1');
      expect(mockValidateAccessToken).not.toHaveBeenCalled();
    });

    it('should return 404 for non-existent agent', async () => {
      mockGetPersona.mockResolvedValue(null);

      await request(app)
        .get('/api/agents/unknown-agent')
        .expect(404);
    });
  });

  describe('POST /api/agents/invoke (protected)', () => {
    // Note: 401 authentication tests are in session-auth.test.ts
    it('should return 401 without auth', async () => {
      await request(app)
        .post('/api/agents/invoke')
        .send({ agentId: 'test', message: 'hello' })
        .expect(401);
    });

    it('should invoke agent with valid token (AC-1.3.2.1, AC-1.3.2.4)', async () => {
      mockValidateAccessToken.mockResolvedValue('user-123');
      mockInvoke.mockResolvedValue({
        agentId: 'test-agent',
        message: 'Hello there!',
        metadata: {},
      });

      const response = await request(app)
        .post('/api/agents/invoke')
        .set('Authorization', 'Bearer valid-token')
        .send({ agentId: 'test-agent', message: 'hello' })
        .expect(200);

      expect(response.body.message).toBe('Hello there!');
      expect(mockInvoke).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'test-agent',
          userId: 'user-123', // Verified from session, not header
          message: 'hello',
        })
      );
    });

    it('should return 400 for missing required fields', async () => {
      mockValidateAccessToken.mockResolvedValue('user-123');

      await request(app)
        .post('/api/agents/invoke')
        .set('Authorization', 'Bearer valid-token')
        .send({}) // Missing agentId and message
        .expect(400);
    });
  });
});
