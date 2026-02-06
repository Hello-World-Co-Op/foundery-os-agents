/**
 * Tests for request body size limits
 *
 * @module tests/middleware/request-size.test
 * @see FOS-5.6.4 AC-5.6.4.3 - Request body size limited to 10MB (F-15)
 */

import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { app } from '../../src/index.js';

describe('request size limits', () => {
  it('should accept requests under 10MB', async () => {
    // Create a small payload (under limit)
    const smallPayload = { data: 'x'.repeat(1000) };

    const response = await request(app)
      .post('/api/agents/invoke')
      .send(smallPayload)
      .set('Content-Type', 'application/json');

    // Should not get 413 (may get 401 or 400 for missing auth/invalid payload)
    expect(response.status).not.toBe(413);
  });

  it('should reject requests over 10MB with 413 status', async () => {
    // Create a payload larger than 10MB
    // 11MB of data (11 * 1024 * 1024 characters)
    const largePayload = { data: 'x'.repeat(11 * 1024 * 1024) };

    const response = await request(app)
      .post('/api/agents/invoke')
      .send(largePayload)
      .set('Content-Type', 'application/json');

    expect(response.status).toBe(413);
  });

  it('should accept requests exactly at 10MB limit', async () => {
    // Create a payload of approximately 10MB
    // The JSON overhead means we need slightly less than 10MB of data
    const tenMBPayload = { data: 'x'.repeat(9.5 * 1024 * 1024) };

    const response = await request(app)
      .post('/api/agents/invoke')
      .send(tenMBPayload)
      .set('Content-Type', 'application/json');

    // Should not get 413 (may get other errors, but not payload too large)
    expect(response.status).not.toBe(413);
  });
});
