/**
 * Tests for security headers middleware (helmet.js)
 *
 * @module tests/middleware/security-headers.test
 * @see AC-5.6.2.3 - HSTS header and helmet.js middleware
 * @see F-7 (security-audit-backend-auth.md) - No HTTPS/TLS enforcement
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/index.js';

describe('security headers', () => {
  it('should include Strict-Transport-Security (HSTS) header', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.headers['strict-transport-security']).toBeDefined();
    expect(response.headers['strict-transport-security']).toContain('max-age=31536000');
    expect(response.headers['strict-transport-security']).toContain('includeSubDomains');
    expect(response.headers['strict-transport-security']).toContain('preload');
  });

  it('should include X-Content-Type-Options header', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.headers['x-content-type-options']).toBe('nosniff');
  });

  it('should include X-Frame-Options header', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.headers['x-frame-options']).toBe('DENY');
  });

  it('should include X-XSS-Protection header', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    // helmet.js sets X-XSS-Protection to 0 by default (as modern browsers handle XSS)
    // but xssFilter option enables it
    expect(response.headers['x-xss-protection']).toBeDefined();
  });

  it('should NOT include X-Powered-By header', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    expect(response.headers['x-powered-by']).toBeUndefined();
  });

  it('should include Content-Security-Policy header', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);

    // helmet.js adds a default CSP
    expect(response.headers['content-security-policy']).toBeDefined();
  });
});
