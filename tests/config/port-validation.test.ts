/**
 * Tests for port configuration validation
 *
 * @module tests/config/port-validation.test
 * @see FOS-5.6.4 AC-5.6.4.1 - Warn if using default port in production (F-13)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('Port configuration validation', () => {
  let originalEnv: NodeJS.ProcessEnv;
  let consoleWarnSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };
    // Spy on console.warn
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    // Restore console.warn
    consoleWarnSpy.mockRestore();
  });

  describe('production environment', () => {
    it('should warn when using default port 3001 in production', async () => {
      // Set up production environment without PORT
      delete process.env.PORT;
      process.env.NODE_ENV = 'production';
      process.env.CORS_ORIGINS = 'https://example.com'; // Required in production

      // Clear module cache using query string cache-busting technique
      // This forces a fresh module import with the updated environment variables
      // Required because ESM modules are cached by URL, not by resolved path
      const configPath = new URL('../../src/config/index.js', import.meta.url).href;
      const uniqueConfigPath = `${configPath}?port-warning-test-${Date.now()}`;
      const { validateConfig, config } = await import(uniqueConfigPath);

      // Call validateConfig to trigger warnings
      validateConfig();

      // Verify warning was logged
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[SECURITY] Warning: Using default port 3001 in production')
      );
      expect(config.server.port).toBe(3001);
    });

    it('should not warn when PORT is explicitly set in production', async () => {
      // Set up production environment with custom PORT
      process.env.PORT = '8080';
      process.env.NODE_ENV = 'production';
      process.env.CORS_ORIGINS = 'https://example.com';

      const configPath = new URL('../../src/config/index.js', import.meta.url).href;
      const uniqueConfigPath = `${configPath}?port-custom-test-${Date.now()}`;
      const { validateConfig, config } = await import(uniqueConfigPath);

      // Clear previous calls
      consoleWarnSpy.mockClear();

      validateConfig();

      // Verify no port warning was logged (may still have API key warning)
      const portWarningCalled = consoleWarnSpy.mock.calls.some(
        (call) => call[0]?.includes?.('[SECURITY] Warning: Using default port')
      );
      expect(portWarningCalled).toBe(false);
      expect(config.server.port).toBe(8080);
    });
  });

  describe('development environment', () => {
    it('should not warn about default port in development', async () => {
      // Set up development environment without PORT
      delete process.env.PORT;
      process.env.NODE_ENV = 'development';
      delete process.env.CORS_ORIGINS; // Use default in dev

      const configPath = new URL('../../src/config/index.js', import.meta.url).href;
      const uniqueConfigPath = `${configPath}?dev-port-test-${Date.now()}`;
      const { validateConfig, config } = await import(uniqueConfigPath);

      // Clear previous calls
      consoleWarnSpy.mockClear();

      validateConfig();

      // Verify no port security warning was logged
      const portWarningCalled = consoleWarnSpy.mock.calls.some(
        (call) => call[0]?.includes?.('[SECURITY] Warning: Using default port')
      );
      expect(portWarningCalled).toBe(false);
      expect(config.server.port).toBe(3001);
    });
  });
});
