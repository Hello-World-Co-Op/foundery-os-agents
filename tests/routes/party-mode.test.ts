/**
 * Unit tests for party-mode routes
 *
 * @module tests/routes/party-mode.test
 * @see AC-1.3.2.1 - Token validation required for protected endpoints
 * @see AC-1.3.2.2 - Return 401 for invalid tokens
 * @see AC-1.3.2.4 - Use verified userId from session
 * @see AC-1.3.2.6 - Comprehensive test coverage
 * @see FOS-3.4.8 - Party Mode Orchestration enhancements
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

// Mock the registry functions
vi.mock('../../src/agents/registry.js', () => ({
  AgentCategory: {
    CORE: 'core',
    PERSONAL: 'personal',
    CREATIVE: 'creative',
    GAMEDEV: 'gamedev',
    BMAD: 'bmad',
    SPECIALIZED: 'specialized',
  },
  getAgentDefinition: (agentId: string) => {
    if (agentId === 'agent-1' || agentId === 'agent-2') {
      return {
        id: agentId,
        name: agentId === 'agent-1' ? 'Agent One' : 'Agent Two',
        category: 'core',
        personaFile: `core/${agentId}.md`,
        description: `Test agent ${agentId}`,
        icon: agentId === 'agent-1' ? '🤖' : '🦾',
        capabilities: ['test'],
      };
    }
    if (agentId === 'aurora-forester') {
      return {
        id: 'aurora-forester',
        name: 'Aurora Forester',
        category: 'core',
        personaFile: 'core/aurora-forester.md',
        description: 'Primary Assistant',
        icon: '🌲',
        capabilities: ['team-orchestration'],
      };
    }
    return undefined;
  },
  getAllAgents: () => [],
  getAgentsByCategory: () => [],
  isAgentRegistered: (id: string) => ['agent-1', 'agent-2', 'aurora-forester'].includes(id),
  getAllAgentIds: () => ['agent-1', 'agent-2', 'aurora-forester'],
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
          config: {
            moderatorId: null, // Disable moderator for simpler test
            maxTurns: 1,
          },
        })
        .expect(200);

      expect(response.body.topic).toBe('Test topic');
      // participants is now an array of PartyParticipant objects
      expect(response.body.participants).toHaveLength(2);
      expect(response.body.participants[0].agentId).toBe('agent-1');
      expect(response.body.participants[1].agentId).toBe('agent-2');
      // Should have sessionId now
      expect(response.body.sessionId).toBeDefined();
      // Should have config
      expect(response.body.config).toBeDefined();
      // With 2 agents and no moderator, should have 2 invocations
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
        })
        .expect(200);

      expect(response.body.responses).toBeDefined();
      expect(response.body.sessionId).toBeDefined();
      expect(mockInvoke).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-continue',
        })
      );
    });
  });

  describe('GET /api/party-mode/agents (protected)', () => {
    it('should return 401 without auth', async () => {
      await request(app)
        .get('/api/party-mode/agents')
        .expect(401);
    });

    it('should return agents grouped by category with valid token', async () => {
      mockValidateAccessToken.mockResolvedValue('user-list');

      const response = await request(app)
        .get('/api/party-mode/agents')
        .set('Authorization', 'Bearer valid-token')
        .expect(200);

      expect(response.body.categories).toBeDefined();
      expect(response.body.totalAgents).toBeDefined();
    });
  });

  // Note: WWW-Authenticate header and structured error response tests are in session-auth.test.ts
});
