/**
 * Route Configuration - Authentication Requirements
 *
 * Defines which endpoints require authentication and which are public.
 * This follows the oracle-bridge pattern (AC-1.3.2.5).
 *
 * NOTE: This file serves as documentation of which endpoints require auth.
 * The actual middleware is applied directly in each route file (invoke.ts,
 * chat.ts, party-mode.ts) using the requireSession middleware from
 * src/middleware/session-auth.ts.
 *
 * @module routes/route-config
 * @see AC-1.3.2.3 - Clear public vs protected endpoint classification
 * @see src/middleware/session-auth.ts - requireSession middleware
 */

/**
 * Public endpoints that do not require authentication.
 *
 * These endpoints are accessible without a valid session token:
 * - Health check for monitoring/load balancers
 * - Agent list for discovery
 * - Agent details for capability exploration
 */
export const PUBLIC_ENDPOINTS = {
  HEALTH: 'GET /health',
  AGENTS_LIST: 'GET /api/agents/list',
  AGENTS_DETAIL: 'GET /api/agents/:agentId',
} as const;

/**
 * Protected endpoints that require a valid session token.
 *
 * These endpoints consume resources (LLM API calls) and must be
 * authenticated to:
 * - Prevent abuse and rate limit per user
 * - Associate conversation history with users
 * - Enable billing and usage tracking
 */
export const PROTECTED_ENDPOINTS = {
  AGENTS_INVOKE: 'POST /api/agents/invoke',
  CHAT: 'POST /api/chat',
  CHAT_STREAM: 'POST /api/chat/stream',
  PARTY_MODE_START: 'POST /api/party-mode/start',
  PARTY_MODE_CONTINUE: 'POST /api/party-mode/continue',
} as const;

/**
 * Route paths that require authentication (used for middleware application)
 */
export const PROTECTED_ROUTE_PATTERNS = [
  '/api/agents/invoke',
  '/api/chat',
  '/api/chat/stream',
  '/api/party-mode/start',
  '/api/party-mode/continue',
] as const;

/**
 * Route paths that are publicly accessible
 */
export const PUBLIC_ROUTE_PATTERNS = [
  '/health',
  '/api/agents/list',
  '/api/agents/:agentId',
] as const;
