/**
 * Tests for CORS configuration validation
 *
 * @module tests/config/cors-validation.test
 * @see AC-5.6.2.2 - CORS_ORIGINS required in production
 * @see F-6 (security-audit-backend-auth.md) - CORS configuration vulnerability
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('CORS configuration validation', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    // Clear module cache to re-evaluate config
    Object.keys(require.cache).forEach(key => {
      if (key.includes('config')) {
        delete require.cache[key];
      }
    });
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('production environment', () => {
    it('should throw error when CORS_ORIGINS is not set in production', async () => {
      // Set up production environment without CORS_ORIGINS
      delete process.env.CORS_ORIGINS;
      process.env.NODE_ENV = 'production';

      // Dynamic import to get fresh config module
      await expect(async () => {
        // Clear the module from Vitest's cache
        const configPath = new URL('../../src/config/index.js', import.meta.url).href;

        // Force reimport by adding a unique query parameter
        const uniqueConfigPath = `${configPath}?production-test-${Date.now()}`;
        await import(uniqueConfigPath);
      }).rejects.toThrow('CORS_ORIGINS environment variable is required in production');
    });
  });

  describe('origin URL validation', () => {
    it('should throw error for invalid origin URL', async () => {
      process.env.CORS_ORIGINS = 'not-a-valid-url';
      process.env.NODE_ENV = 'development';

      await expect(async () => {
        const configPath = new URL('../../src/config/index.js', import.meta.url).href;
        const uniqueConfigPath = `${configPath}?invalid-url-test-${Date.now()}`;
        await import(uniqueConfigPath);
      }).rejects.toThrow('Invalid CORS origin URL');
    });

    it('should accept valid origin URLs', async () => {
      process.env.CORS_ORIGINS = 'https://example.com,https://app.example.com';
      process.env.NODE_ENV = 'development';

      const configPath = new URL('../../src/config/index.js', import.meta.url).href;
      const uniqueConfigPath = `${configPath}?valid-url-test-${Date.now()}`;
      const { config } = await import(uniqueConfigPath);

      expect(config.cors.origins).toEqual(['https://example.com', 'https://app.example.com']);
    });
  });

  describe('development environment', () => {
    it('should use localhost default in development without CORS_ORIGINS', async () => {
      delete process.env.CORS_ORIGINS;
      process.env.NODE_ENV = 'development';

      const configPath = new URL('../../src/config/index.js', import.meta.url).href;
      const uniqueConfigPath = `${configPath}?dev-default-test-${Date.now()}`;
      const { config } = await import(uniqueConfigPath);

      expect(config.cors.origins).toEqual(['http://localhost:5173']);
    });
  });
});
