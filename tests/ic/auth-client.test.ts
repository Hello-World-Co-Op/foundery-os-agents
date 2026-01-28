/**
 * Unit tests for auth-client module
 *
 * @module tests/ic/auth-client.test
 * @see AC-1.3.2.1 - Token validation with auth-service
 * @see AC-1.3.2.6 - Comprehensive test coverage
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the @dfinity/agent module before importing auth-client
const mockFetchRootKey = vi.fn().mockResolvedValue(undefined);
const mockCreateActor = vi.fn();

vi.mock('@dfinity/agent', () => {
  return {
    HttpAgent: class MockHttpAgent {
      fetchRootKey = mockFetchRootKey;
    },
    Actor: {
      createActor: (...args: unknown[]) => mockCreateActor(...args),
    },
  };
});

// Mock @dfinity/principal
vi.mock('@dfinity/principal', () => {
  return {
    Principal: {
      fromText: vi.fn().mockReturnValue({ toText: () => 'test-canister-id' }),
    },
  };
});

// Mock the config
vi.mock('../../src/config/index.js', () => ({
  config: {
    ic: {
      host: 'http://localhost:4943',
      authServiceCanisterId: 'test-canister-id',
    },
    server: {
      nodeEnv: 'development',
    },
  },
}));

import {
  validateAccessToken,
  validateSession,
  resetAuthActor,
  isAuthServiceConfigured,
  AuthServiceError,
} from '../../src/ic/auth-client.js';

describe('auth-client', () => {
  const mockActor = {
    validate_access_token: vi.fn(),
    validate_session: vi.fn(),
    health: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetAuthActor();
    mockCreateActor.mockReturnValue(mockActor);
  });

  afterEach(() => {
    resetAuthActor();
  });

  describe('validateAccessToken', () => {
    it('should return user_id for valid token', async () => {
      mockActor.validate_access_token.mockResolvedValue({ Ok: 'user-123' });

      const result = await validateAccessToken('valid-token');

      expect(result).toBe('user-123');
      expect(mockActor.validate_access_token).toHaveBeenCalledWith('valid-token');
    });

    it('should return null for invalid token', async () => {
      mockActor.validate_access_token.mockResolvedValue({ Err: 'Token expired' });

      const result = await validateAccessToken('invalid-token');

      expect(result).toBeNull();
    });

    it('should throw AuthServiceError when canister call fails', async () => {
      mockActor.validate_access_token.mockRejectedValue(new Error('Network error'));

      await expect(validateAccessToken('some-token')).rejects.toThrow(AuthServiceError);
    });

    it('should cache the actor between calls', async () => {
      mockActor.validate_access_token.mockResolvedValue({ Ok: 'user-123' });

      await validateAccessToken('token1');
      await validateAccessToken('token2');

      // Actor.createActor should only be called once due to caching
      expect(mockCreateActor).toHaveBeenCalledTimes(1);
    });
  });

  describe('validateSession', () => {
    const mockSessionInfo = {
      user_id: 'user-123',
      user_principal: [],
      auth_method: { EmailPassword: null },
      device_fingerprint: 'device-fp',
      device_trust_level: { Trusted: null },
      ip_anomaly_detected: false,
      session_age_seconds: BigInt(3600),
    };

    it('should return session info for valid token', async () => {
      mockActor.validate_session.mockResolvedValue({ Ok: mockSessionInfo });

      const result = await validateSession('valid-token');

      expect(result).toEqual(mockSessionInfo);
      expect(mockActor.validate_session).toHaveBeenCalledWith('valid-token', []);
    });

    it('should pass IP hash when provided', async () => {
      mockActor.validate_session.mockResolvedValue({ Ok: mockSessionInfo });

      await validateSession('valid-token', 'ip-hash-123');

      expect(mockActor.validate_session).toHaveBeenCalledWith('valid-token', ['ip-hash-123']);
    });

    it('should return null for invalid session', async () => {
      mockActor.validate_session.mockResolvedValue({ Err: 'Session not found' });

      const result = await validateSession('invalid-token');

      expect(result).toBeNull();
    });

    it('should throw AuthServiceError when canister call fails', async () => {
      mockActor.validate_session.mockRejectedValue(new Error('Network error'));

      await expect(validateSession('some-token')).rejects.toThrow(AuthServiceError);
    });
  });

  describe('isAuthServiceConfigured', () => {
    it('should return true when canister ID is set', () => {
      expect(isAuthServiceConfigured()).toBe(true);
    });
  });

  describe('resetAuthActor', () => {
    it('should clear cached actor', async () => {
      mockActor.validate_access_token.mockResolvedValue({ Ok: 'user-123' });

      // First call creates the actor
      await validateAccessToken('token1');
      expect(mockCreateActor).toHaveBeenCalledTimes(1);

      // Reset the cache
      resetAuthActor();

      // Second call should create a new actor
      await validateAccessToken('token2');
      expect(mockCreateActor).toHaveBeenCalledTimes(2);
    });
  });

  describe('AuthServiceError', () => {
    it('should have correct name and message', () => {
      const error = new AuthServiceError('Test error');

      expect(error.name).toBe('AuthServiceError');
      expect(error.message).toBe('Test error');
    });

    it('should capture the cause', () => {
      const cause = new Error('Original error');
      const error = new AuthServiceError('Wrapped error', cause);

      expect(error.cause).toBe(cause);
    });
  });
});

describe('auth-client without config', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should throw error when canister ID is not configured', async () => {
    // Re-mock config with empty canister ID
    vi.doMock('../../src/config/index.js', () => ({
      config: {
        ic: {
          host: 'http://localhost:4943',
          authServiceCanisterId: '', // Empty
        },
        server: {
          nodeEnv: 'development',
        },
      },
    }));

    // Re-import to get the new mock
    const { validateAccessToken: validateWithNoConfig, resetAuthActor: reset, AuthServiceError: AuthError } =
      await import('../../src/ic/auth-client.js');

    reset();

    // The error is wrapped in AuthServiceError, with the original as cause
    await expect(validateWithNoConfig('any-token')).rejects.toThrow(AuthError);
  });
});
