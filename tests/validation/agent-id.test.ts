/**
 * Unit tests for agent ID validation
 *
 * @module tests/validation/agent-id.test
 * @see FOS-5.6.3 AC-5.6.3.5 - Agent IDs validated against registered agent list
 * @see F-12 (security-audit-backend-auth.md) - No agent ID validation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { validateAgentId, getValidAgentIds } from '../../src/validation/agent-id.js';

describe('agent-id validation', () => {
  let mockReq: Partial<Request>;
  let mockRes: {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
  let mockNext: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockReq = {
      body: {},
      params: {},
    };
    mockRes = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
    };
    mockNext = vi.fn();
  });

  describe('validateAgentId middleware', () => {
    describe('fromBody extraction', () => {
      it('should call next when agent ID is valid', () => {
        mockReq.body = { agentId: 'bob' }; // bob is a registered agent
        const middleware = validateAgentId({ fromBody: true });

        middleware(mockReq as Request, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
        expect(mockRes.status).not.toHaveBeenCalled();
      });

      it('should return 404 when agent ID is not registered', () => {
        mockReq.body = { agentId: 'unknown-agent' };
        const middleware = validateAgentId({ fromBody: true });

        middleware(mockReq as Request, mockRes as Response, mockNext);

        expect(mockNext).not.toHaveBeenCalled();
        expect(mockRes.status).toHaveBeenCalledWith(404);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: 'Not Found',
          code: 'AGENT_NOT_FOUND',
          message: "Agent 'unknown-agent' is not registered",
          hint: 'Use GET /api/agents/list to see available agents',
        });
      });

      it('should call next when no agentId in body (let other validation handle it)', () => {
        mockReq.body = { message: 'hello' };
        const middleware = validateAgentId({ fromBody: true });

        middleware(mockReq as Request, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
      });
    });

    describe('fromParams extraction', () => {
      it('should validate agent ID from params when configured', () => {
        mockReq.params = { agentId: 'aurora-forester' };
        const middleware = validateAgentId({ fromParams: true, fromBody: false });

        middleware(mockReq as Request, mockRes as Response, mockNext);

        expect(mockNext).toHaveBeenCalled();
      });

      it('should return 404 for invalid agent ID in params', () => {
        mockReq.params = { agentId: 'fake-agent' };
        const middleware = validateAgentId({ fromParams: true, fromBody: false });

        middleware(mockReq as Request, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(404);
      });
    });

    describe('agent ID format validation', () => {
      it('should return 400 for non-string agent ID', () => {
        mockReq.body = { agentId: 123 };
        const middleware = validateAgentId({ fromBody: true });

        middleware(mockReq as Request, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: 'Bad Request',
          code: 'INVALID_AGENT_ID_FORMAT',
          message: 'Agent ID must be a string of 100 characters or less',
        });
      });

      it('should return 400 for agent ID exceeding 100 characters', () => {
        mockReq.body = { agentId: 'a'.repeat(101) };
        const middleware = validateAgentId({ fromBody: true });

        middleware(mockReq as Request, mockRes as Response, mockNext);

        expect(mockRes.status).toHaveBeenCalledWith(400);
        expect(mockRes.json).toHaveBeenCalledWith({
          error: 'Bad Request',
          code: 'INVALID_AGENT_ID_FORMAT',
          message: 'Agent ID must be a string of 100 characters or less',
        });
      });
    });

    describe('known agent IDs', () => {
      const knownAgents = [
        'bob',
        'aurora-forester',
        'winston',
        'john',
        'amelia',
        'marcus',
        'elena',
        'sophie',
        'tea',
        'mary',
        'spark',
        'nova',
        'iris',
        'atlas',
        'fable',
        'victor',
        'luna',
        'rex',
        'diego',
        'bmad-master',
        'bmad-builder',
        'dr-cadence',
        'jack-valltrades',
      ];

      for (const agentId of knownAgents) {
        it(`should accept registered agent: ${agentId}`, () => {
          mockReq.body = { agentId };
          const middleware = validateAgentId({ fromBody: true });

          middleware(mockReq as Request, mockRes as Response, mockNext);

          expect(mockNext).toHaveBeenCalled();
        });
      }
    });
  });

  describe('getValidAgentIds', () => {
    it('should return array of agent IDs', () => {
      const ids = getValidAgentIds();

      expect(Array.isArray(ids)).toBe(true);
      expect(ids.length).toBeGreaterThan(0);
    });

    it('should include known agents', () => {
      const ids = getValidAgentIds();

      expect(ids).toContain('bob');
      expect(ids).toContain('aurora-forester');
      expect(ids).toContain('bmad-master');
    });
  });
});
