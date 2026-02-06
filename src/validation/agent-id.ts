/**
 * Agent ID Validation Middleware
 *
 * Validates that requested agent IDs exist in the agent registry
 * before processing requests.
 *
 * @module validation/agent-id
 * @see FOS-5.6.3 AC-5.6.3.5 - Agent IDs validated against registered agent list
 * @see F-12 (security-audit-backend-auth.md) - No agent ID validation
 */

import type { Request, Response, NextFunction } from 'express';
import { isAgentRegistered, getAllAgentIds } from '../agents/registry.js';

/**
 * Middleware to validate agent ID exists in registry
 *
 * Checks the agentId in request body or params and returns 404
 * if the agent is not registered.
 *
 * @param options.fromBody - Extract agentId from req.body (default: true)
 * @param options.fromParams - Extract agentId from req.params (default: false)
 * @param options.paramName - Name of the param to use (default: 'agentId')
 */
export function validateAgentId(options: {
  fromBody?: boolean;
  fromParams?: boolean;
  paramName?: string;
} = {}): (req: Request, res: Response, next: NextFunction) => void {
  const { fromBody = true, fromParams = false, paramName = 'agentId' } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    let agentId: string | undefined;

    // Extract agentId from body or params
    if (fromBody && req.body?.[paramName]) {
      agentId = req.body[paramName];
    } else if (fromParams && req.params?.[paramName]) {
      agentId = req.params[paramName];
    }

    // If no agentId found, let other validation handle it
    if (!agentId) {
      next();
      return;
    }

    // Validate agent ID format (basic sanitization)
    if (typeof agentId !== 'string' || agentId.length > 100) {
      res.status(400).json({
        error: 'Bad Request',
        code: 'INVALID_AGENT_ID_FORMAT',
        message: 'Agent ID must be a string of 100 characters or less',
      });
      return;
    }

    // Check if agent is registered
    if (!isAgentRegistered(agentId)) {
      res.status(404).json({
        error: 'Not Found',
        code: 'AGENT_NOT_FOUND',
        message: `Agent '${agentId}' is not registered`,
        hint: 'Use GET /api/agents/list to see available agents',
      });
      return;
    }

    next();
  };
}

/**
 * Get list of valid agent IDs
 *
 * Useful for error messages and documentation.
 */
export function getValidAgentIds(): string[] {
  return getAllAgentIds();
}
