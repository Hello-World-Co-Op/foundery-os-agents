import { Router, Request, Response } from 'express';
import { agentService, type AgentInvocation } from '../services/agent-service.js';
import {
  requireSession,
  type AuthenticatedRequest,
} from '../middleware/session-auth.js';

export const partyModeRouter = Router();

interface PartyModeMessage {
  role: 'user' | 'assistant';
  content: string;
  agentId?: string;
}

interface PartyModeRequestBody {
  agentIds: string[];
  topic: string;
  history?: PartyModeMessage[];
  context?: Record<string, unknown>;
  maxTurns?: number;
}

interface PartyModeResponse {
  agentId: string;
  message: string;
  turnNumber: number;
}

/**
 * POST /party-mode/start
 * Start a party mode conversation with multiple agents
 *
 * @requires Valid session token (AC-1.3.2.1)
 * @see AC-1.3.2.4 - Uses verified userId from session
 */
partyModeRouter.post('/start', requireSession, async (req: Request, res: Response) => {
  try {
    const body = req.body as PartyModeRequestBody;
    const userId = (req as AuthenticatedRequest).userId;

    if (!body.agentIds || body.agentIds.length < 2) {
      res.status(400).json({
        error: 'Party mode requires at least 2 agents',
      });
      return;
    }

    if (!body.topic) {
      res.status(400).json({
        error: 'Missing required field: topic',
      });
      return;
    }

    const maxTurns = body.maxTurns || 5;
    const responses: PartyModeResponse[] = [];

    // Build initial context for party mode
    const partyContext = {
      ...body.context,
      partyMode: true,
      participants: body.agentIds,
      topic: body.topic,
    };

    // Each agent takes a turn
    let conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [
      {
        role: 'user',
        content: `Topic for discussion: ${body.topic}\n\nYou are participating in a group discussion with other AI agents: ${body.agentIds.join(', ')}. Share your perspective on this topic, building on what others have said.`,
      },
    ];

    // Add any previous history
    if (body.history) {
      conversationHistory = [
        ...conversationHistory,
        ...body.history.map(msg => ({
          role: msg.role,
          content: msg.agentId
            ? `[${msg.agentId}]: ${msg.content}`
            : msg.content,
        })),
      ];
    }

    // Run through turns
    for (let turn = 0; turn < maxTurns; turn++) {
      // Each agent gets a chance to speak
      for (const agentId of body.agentIds) {
        const invocation: AgentInvocation = {
          agentId,
          userId,
          message: turn === 0 && !body.history?.length
            ? `Please share your initial thoughts on: ${body.topic}`
            : 'Please respond to the conversation, building on what has been said.',
          context: partyContext,
          conversationHistory,
        };

        const response = await agentService.invoke(invocation);

        const partyResponse: PartyModeResponse = {
          agentId,
          message: response.message,
          turnNumber: turn + 1,
        };

        responses.push(partyResponse);

        // Add to conversation history for next agent
        conversationHistory.push({
          role: 'assistant',
          content: `[${agentId}]: ${response.message}`,
        });
      }
    }

    res.json({
      topic: body.topic,
      participants: body.agentIds,
      responses,
      totalTurns: maxTurns,
    });
  } catch (error) {
    console.error('Party mode error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /party-mode/continue
 * Continue an existing party mode conversation
 *
 * @requires Valid session token (AC-1.3.2.1)
 * @see AC-1.3.2.4 - Uses verified userId from session
 */
partyModeRouter.post('/continue', requireSession, async (req: Request, res: Response) => {
  try {
    const body = req.body as PartyModeRequestBody & { userMessage?: string };
    const userId = (req as AuthenticatedRequest).userId;

    if (!body.agentIds || body.agentIds.length < 2) {
      res.status(400).json({
        error: 'Party mode requires at least 2 agents',
      });
      return;
    }

    const responses: PartyModeResponse[] = [];

    let conversationHistory = body.history?.map(msg => ({
      role: msg.role,
      content: msg.agentId
        ? `[${msg.agentId}]: ${msg.content}`
        : msg.content,
    })) || [];

    // Add user's new message if provided
    if (body.userMessage) {
      conversationHistory.push({
        role: 'user',
        content: body.userMessage,
      });
    }

    const partyContext = {
      ...body.context,
      partyMode: true,
      participants: body.agentIds,
      topic: body.topic,
    };

    // Each agent responds to the user's message
    for (const agentId of body.agentIds) {
      const invocation: AgentInvocation = {
        agentId,
        userId,
        message: 'Please respond to the conversation.',
        context: partyContext,
        conversationHistory,
      };

      const response = await agentService.invoke(invocation);

      responses.push({
        agentId,
        message: response.message,
        turnNumber: 1,
      });

      conversationHistory.push({
        role: 'assistant',
        content: `[${agentId}]: ${response.message}`,
      });
    }

    res.json({
      responses,
    });
  } catch (error) {
    console.error('Party mode continue error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
