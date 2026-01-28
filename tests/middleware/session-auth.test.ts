/**
 * Unit tests for session-auth middleware
 *
 * @module tests/middleware/session-auth.test
 * @see AC-1.3.2.1 - Token validation with auth-service
 * @see AC-1.3.2.2 - Return 401 for invalid tokens
 * @see AC-1.3.2.4 - Use verified user_id from session
 * @see AC-1.3.2.6 - Comprehensive test coverage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';

// Mock the auth-client module
const mockValidateAccessToken = vi.fn();
const mockIsAuthServiceConfigured = vi.fn();

vi.mock('../../src/ic/auth-client.js', () => ({
  validateAccessToken: (...args: unknown[]) => mockValidateAccessToken(...args),
  isAuthServiceConfigured: () => mockIsAuthServiceConfigured(),
  AuthServiceError: class AuthServiceError extends Error {
    name = 'AuthServiceError';
  },
}));

import {
  requireSession,
  optionalSession,
  AuthErrorCode,
  type AuthenticatedRequest,
} from '../../src/middleware/session-auth.js';

describe('session-auth middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: ReturnType<typeof vi.fn>;
  let statusMock: ReturnType<typeof vi.fn>;
  let setHeaderMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mocks
    jsonMock = vi.fn();
    setHeaderMock = vi.fn();
    statusMock = vi.fn().mockReturnThis();

    mockReq = {
      headers: {},
    };

    mockRes = {
      status: statusMock,
      json: jsonMock,
      setHeader: setHeaderMock,
    };

    mockNext = vi.fn();

    // Default: auth service is configured
    mockIsAuthServiceConfigured.mockReturnValue(true);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('requireSession', () => {
    describe('successful authentication', () => {
      it('should call next and attach userId for valid token (AC-1.3.2.1, AC-1.3.2.4)', async () => {
        mockReq.headers = { authorization: 'Bearer valid-token-123' };
        mockValidateAccessToken.mockResolvedValue('user-abc');

        await requireSession(mockReq as Request, mockRes as Response, mockNext);

        expect(mockValidateAccessToken).toHaveBeenCalledWith('valid-token-123');
        expect((mockReq as AuthenticatedRequest).userId).toBe('user-abc');
        expect(mockNext).toHaveBeenCalled();
        expect(statusMock).not.toHaveBeenCalled();
      });
    });

    describe('missing token (AC-1.3.2.2)', () => {
      it('should return 401 when no Authorization header', async () => {
        mockReq.headers = {};

        await requireSession(mockReq as Request, mockRes as Response, mockNext);

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(jsonMock).toHaveBeenCalledWith({
          error: 'Unauthorized',
          code: AuthErrorCode.MISSING_TOKEN,
          message: 'Authorization header required',
        });
        expect(setHeaderMock).toHaveBeenCalledWith('WWW-Authenticate', 'Bearer realm="foundery-os-agents"');
        expect(mockNext).not.toHaveBeenCalled();
      });

      it('should return 401 when Authorization header does not use Bearer scheme', async () => {
        mockReq.headers = { authorization: 'Basic dXNlcjpwYXNz' };

        await requireSession(mockReq as Request, mockRes as Response, mockNext);

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(jsonMock).toHaveBeenCalledWith({
          error: 'Unauthorized',
          code: AuthErrorCode.MISSING_TOKEN,
          message: 'Authorization header must use Bearer scheme',
        });
        expect(mockNext).not.toHaveBeenCalled();
      });

      it('should return 401 when Bearer token is empty', async () => {
        mockReq.headers = { authorization: 'Bearer ' };

        await requireSession(mockReq as Request, mockRes as Response, mockNext);

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(jsonMock).toHaveBeenCalledWith({
          error: 'Unauthorized',
          code: AuthErrorCode.MISSING_TOKEN,
          message: 'Bearer token is empty',
        });
        expect(mockNext).not.toHaveBeenCalled();
      });
    });

    describe('invalid token (AC-1.3.2.2)', () => {
      it('should return 401 when token validation fails', async () => {
        mockReq.headers = { authorization: 'Bearer invalid-token' };
        mockValidateAccessToken.mockResolvedValue(null);

        await requireSession(mockReq as Request, mockRes as Response, mockNext);

        expect(statusMock).toHaveBeenCalledWith(401);
        expect(jsonMock).toHaveBeenCalledWith({
          error: 'Unauthorized',
          code: AuthErrorCode.INVALID_TOKEN,
          message: 'Invalid or expired session token',
        });
        expect(mockNext).not.toHaveBeenCalled();
      });
    });

    describe('auth service errors', () => {
      it('should return 503 when auth service call throws AuthServiceError', async () => {
        mockReq.headers = { authorization: 'Bearer some-token' };

        // Import the mocked AuthServiceError
        const { AuthServiceError } = await import('../../src/ic/auth-client.js');
        mockValidateAccessToken.mockRejectedValue(new AuthServiceError('Service unavailable'));

        await requireSession(mockReq as Request, mockRes as Response, mockNext);

        expect(statusMock).toHaveBeenCalledWith(503);
        expect(jsonMock).toHaveBeenCalledWith({
          error: 'Service Unavailable',
          code: AuthErrorCode.AUTH_SERVICE_ERROR,
          message: 'Unable to validate session. Please try again.',
        });
        expect(mockNext).not.toHaveBeenCalled();
      });

      it('should NOT set WWW-Authenticate header on 503 responses', async () => {
        mockReq.headers = { authorization: 'Bearer some-token' };

        const { AuthServiceError } = await import('../../src/ic/auth-client.js');
        mockValidateAccessToken.mockRejectedValue(new AuthServiceError('Service unavailable'));

        await requireSession(mockReq as Request, mockRes as Response, mockNext);

        expect(statusMock).toHaveBeenCalledWith(503);
        // WWW-Authenticate should only be set for 401 responses per RFC 6750
        expect(setHeaderMock).not.toHaveBeenCalled();
      });
    });

    describe('auth service not configured', () => {
      it('should allow anonymous access in development when not configured', async () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'development';

        mockIsAuthServiceConfigured.mockReturnValue(false);
        mockReq.headers = { authorization: 'Bearer some-token' };

        await requireSession(mockReq as Request, mockRes as Response, mockNext);

        expect((mockReq as AuthenticatedRequest).userId).toBe('anonymous-dev');
        expect(mockNext).toHaveBeenCalled();

        process.env.NODE_ENV = originalEnv;
      });

      it('should return 503 in production when not configured', async () => {
        const originalEnv = process.env.NODE_ENV;
        process.env.NODE_ENV = 'production';

        mockIsAuthServiceConfigured.mockReturnValue(false);
        mockReq.headers = { authorization: 'Bearer some-token' };

        await requireSession(mockReq as Request, mockRes as Response, mockNext);

        expect(statusMock).toHaveBeenCalledWith(503);
        expect(jsonMock).toHaveBeenCalledWith({
          error: 'Service Unavailable',
          code: AuthErrorCode.AUTH_NOT_CONFIGURED,
          message: 'Authentication service not configured',
        });
        expect(mockNext).not.toHaveBeenCalled();

        process.env.NODE_ENV = originalEnv;
      });
    });
  });

  describe('optionalSession', () => {
    it('should set anonymous userId when no token provided', async () => {
      mockReq.headers = {};

      await optionalSession(mockReq as Request, mockRes as Response, mockNext);

      expect((mockReq as AuthenticatedRequest).userId).toBe('anonymous');
      expect(mockNext).toHaveBeenCalled();
      expect(mockValidateAccessToken).not.toHaveBeenCalled();
    });

    it('should set anonymous userId when Authorization header is not Bearer', async () => {
      mockReq.headers = { authorization: 'Basic dXNlcjpwYXNz' };

      await optionalSession(mockReq as Request, mockRes as Response, mockNext);

      expect((mockReq as AuthenticatedRequest).userId).toBe('anonymous');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should validate token when Bearer token provided', async () => {
      mockReq.headers = { authorization: 'Bearer valid-token' };
      mockValidateAccessToken.mockResolvedValue('user-xyz');

      await optionalSession(mockReq as Request, mockRes as Response, mockNext);

      expect(mockValidateAccessToken).toHaveBeenCalledWith('valid-token');
      expect((mockReq as AuthenticatedRequest).userId).toBe('user-xyz');
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 401 when Bearer token is invalid', async () => {
      mockReq.headers = { authorization: 'Bearer invalid-token' };
      mockValidateAccessToken.mockResolvedValue(null);

      await optionalSession(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('WWW-Authenticate header', () => {
    it('should set WWW-Authenticate header on 401 responses', async () => {
      mockReq.headers = {};

      await requireSession(mockReq as Request, mockRes as Response, mockNext);

      expect(setHeaderMock).toHaveBeenCalledWith(
        'WWW-Authenticate',
        'Bearer realm="foundery-os-agents"'
      );
    });
  });
});
