import { Router, Request, Response } from 'express';
import { agentService, type AgentInvocation } from '../services/agent-service.js';
import {
  requireSession,
  type AuthenticatedRequest,
} from '../middleware/session-auth.js';
import { chatRateLimit } from '../middleware/rate-limit.js';
import { validateContextMiddleware } from '../validation/user-context.js';
import { validateAgentId } from '../validation/agent-id.js';

export const chatRouter = Router();

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  agentId?: string;
  timestamp?: number;
}

interface ChatRequestBody {
  agentId: string;
  message: string;
  history?: ChatMessage[];
  context?: Record<string, unknown>;
}

/**
 * POST /chat
 * Send a chat message to an agent
 *
 * @requires Valid session token (AC-1.3.2.1)
 * @see AC-1.3.2.4 - Uses verified userId from session
 * @see AC-5.6.2.1 - Rate limited to 10 req/min per user
 * @see AC-5.6.3.3 - User context validated before prompt injection (F-10)
 * @see AC-5.6.3.5 - Agent IDs validated against registered agent list (F-12)
 */
chatRouter.post('/', chatRateLimit, requireSession, validateAgentId({ fromBody: true }), validateContextMiddleware(), async (req: Request, res: Response) => {
  try {
    const body = req.body as ChatRequestBody;
    const userId = (req as AuthenticatedRequest).userId;

    if (!body.agentId || !body.message) {
      res.status(400).json({
        error: 'Missing required fields: agentId, message',
      });
      return;
    }

    // Convert chat history to conversation history format
    const conversationHistory = body.history?.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));

    const invocation: AgentInvocation = {
      agentId: body.agentId,
      userId,
      message: body.message,
      context: body.context,
      conversationHistory,
    };

    const response = await agentService.invoke(invocation);

    res.json({
      role: 'assistant',
      content: response.message,
      agentId: response.agentId,
      timestamp: Date.now(),
      metadata: response.metadata,
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /chat/stream
 * Stream a chat response from an agent (Server-Sent Events)
 *
 * @requires Valid session token (AC-1.3.2.1)
 * @see AC-1.3.2.4 - Uses verified userId from session
 * @see AC-5.6.2.1 - Rate limited to 10 req/min per user
 * @see AC-5.6.3.3 - User context validated before prompt injection (F-10)
 * @see AC-5.6.3.5 - Agent IDs validated against registered agent list (F-12)
 */
chatRouter.post('/stream', chatRateLimit, requireSession, validateAgentId({ fromBody: true }), validateContextMiddleware(), async (req: Request, res: Response) => {
  try {
    const body = req.body as ChatRequestBody;
    const userId = (req as AuthenticatedRequest).userId;

    if (!body.agentId || !body.message) {
      res.status(400).json({
        error: 'Missing required fields: agentId, message',
      });
      return;
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const conversationHistory = body.history?.map(msg => ({
      role: msg.role,
      content: msg.content,
    }));

    const invocation: AgentInvocation = {
      agentId: body.agentId,
      userId,
      message: body.message,
      context: body.context,
      conversationHistory,
    };

    // Stream the response
    for await (const chunk of agentService.invokeStream(invocation)) {
      const data = JSON.stringify({
        agentId: chunk.agentId,
        content: chunk.chunk,
        done: chunk.isComplete,
      });

      res.write(`data: ${data}\n\n`);

      if (chunk.isComplete) {
        break;
      }
    }

    res.end();
  } catch (error) {
    console.error('Stream error:', error);
    res.write(`data: ${JSON.stringify({ error: 'Stream error', done: true })}\n\n`);
    res.end();
  }
});
