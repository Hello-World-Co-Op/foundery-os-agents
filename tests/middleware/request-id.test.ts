/**
 * Unit tests for request-id middleware
 *
 * @module tests/middleware/request-id.test
 * @see FOS-5.6.3 AC-5.6.3.1 - Auth logs use opaque request IDs, not user IDs
 * @see F-8 (security-audit-backend-auth.md) - Verbose auth logging finding
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import {
  requestId,
  getRequestId,
  getLogContext,
  REQUEST_ID_HEADER,
  type RequestWithId,
} from '../../src/middleware/request-id.js';

describe('request-id middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let setHeaderMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    setHeaderMock = vi.fn();

    mockReq = {
      headers: {},
      method: 'GET',
      path: '/api/test',
    };

    mockRes = {
      setHeader: setHeaderMock,
    };

    mockNext = vi.fn();
  });

  describe('requestId middleware', () => {
    it('should generate a UUID request ID when none provided', () => {
      requestId(mockReq as Request, mockRes as Response, mockNext);

      const reqWithId = mockReq as RequestWithId;
      expect(reqWithId.requestId).toBeDefined();
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      expect(reqWithId.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(mockNext).toHaveBeenCalled();
    });

    it('should set X-Request-ID response header', () => {
      requestId(mockReq as Request, mockRes as Response, mockNext);

      expect(setHeaderMock).toHaveBeenCalledWith(
        REQUEST_ID_HEADER,
        expect.any(String)
      );
    });

    it('should accept incoming X-Request-ID header for distributed tracing', () => {
      const incomingId = 'trace-id-from-gateway-12345';
      mockReq.headers = { 'x-request-id': incomingId };

      requestId(mockReq as Request, mockRes as Response, mockNext);

      const reqWithId = mockReq as RequestWithId;
      expect(reqWithId.requestId).toBe(incomingId);
      expect(setHeaderMock).toHaveBeenCalledWith(REQUEST_ID_HEADER, incomingId);
    });

    it('should generate new ID if incoming X-Request-ID is empty', () => {
      mockReq.headers = { 'x-request-id': '' };

      requestId(mockReq as Request, mockRes as Response, mockNext);

      const reqWithId = mockReq as RequestWithId;
      expect(reqWithId.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should generate new ID if incoming X-Request-ID is too long (>64 chars)', () => {
      const longId = 'a'.repeat(65);
      mockReq.headers = { 'x-request-id': longId };

      requestId(mockReq as Request, mockRes as Response, mockNext);

      const reqWithId = mockReq as RequestWithId;
      expect(reqWithId.requestId).not.toBe(longId);
      expect(reqWithId.requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should call next middleware', () => {
      requestId(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
    });
  });

  describe('getRequestId helper', () => {
    it('should return request ID from request object', () => {
      (mockReq as RequestWithId).requestId = 'test-request-id';

      const result = getRequestId(mockReq as Request);

      expect(result).toBe('test-request-id');
    });

    it('should return "unknown" if request ID is not set', () => {
      const result = getRequestId(mockReq as Request);

      expect(result).toBe('unknown');
    });
  });

  describe('getLogContext helper', () => {
    it('should return log-safe context with request ID', () => {
      (mockReq as RequestWithId).requestId = 'log-context-id';
      mockReq.method = 'POST';
      mockReq.path = '/api/chat';

      const context = getLogContext(mockReq as Request);

      expect(context).toEqual({
        requestId: 'log-context-id',
        method: 'POST',
        path: '/api/chat',
      });
    });

    it('should NOT include any user identifiers (F-8 security requirement)', () => {
      (mockReq as RequestWithId).requestId = 'secure-id';
      // Even if request has user data, log context should not include it
      (mockReq as unknown as { userId: string }).userId = 'user-123';
      (mockReq as unknown as { ip: string }).ip = '192.168.1.1';

      const context = getLogContext(mockReq as Request);

      expect(context).not.toHaveProperty('userId');
      expect(context).not.toHaveProperty('ip');
      expect(context).not.toHaveProperty('user');
    });
  });

  describe('REQUEST_ID_HEADER constant', () => {
    it('should be X-Request-ID', () => {
      expect(REQUEST_ID_HEADER).toBe('X-Request-ID');
    });
  });
});
