import { Router, Request, Response } from 'express';
import { agentService, type AgentInvocation } from '../services/agent-service.js';

export const invokeRouter = Router();

interface InvokeRequestBody {
  agentId: string;
  message: string;
  context?: Record<string, unknown>;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

/**
 * POST /agents/invoke
 * Invoke an agent with a message and get a response
 */
invokeRouter.post('/invoke', async (req: Request, res: Response) => {
  try {
    const body = req.body as InvokeRequestBody;
    const userId = req.headers['x-user-id'] as string || 'anonymous';

    if (!body.agentId || !body.message) {
      res.status(400).json({
        error: 'Missing required fields: agentId, message',
      });
      return;
    }

    const invocation: AgentInvocation = {
      agentId: body.agentId,
      userId,
      message: body.message,
      context: body.context,
      conversationHistory: body.conversationHistory,
    };

    const response = await agentService.invoke(invocation);

    res.json(response);
  } catch (error) {
    console.error('Invoke error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /agents/list
 * List available agents
 */
invokeRouter.get('/list', async (_req: Request, res: Response) => {
  try {
    const agents = await agentService.listAgents();
    res.json({ agents });
  } catch (error) {
    console.error('List agents error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /agents/:agentId
 * Get agent details
 */
invokeRouter.get('/:agentId', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const persona = await agentService.getPersona(agentId);

    if (!persona) {
      res.status(404).json({ error: `Agent not found: ${agentId}` });
      return;
    }

    res.json({
      id: persona.id,
      name: persona.name,
      role: persona.role,
      description: persona.description,
      capabilities: persona.capabilities,
      tags: persona.tags,
    });
  } catch (error) {
    console.error('Get agent error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
