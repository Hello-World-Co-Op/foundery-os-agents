/**
 * Party Mode Routes
 *
 * Enhanced party mode API with category filtering, moderator support,
 * turn ordering modes, session persistence, and @mention handoff.
 *
 * @see Story FOS-3.4.8: Party Mode Orchestration
 */

import { Router, Request, Response } from 'express';
import { agentService, type AgentInvocation } from '../services/agent-service.js';
import {
  requireSession,
  type AuthenticatedRequest,
} from '../middleware/session-auth.js';
import {
  PartyModeConfig,
  TurnOrderingMode,
  PartyMessage,
  PartyModeAgentResponse,
  StartPartyModeRequest,
  StartPartyModeResponse,
  ContinuePartyModeRequest,
  ContinuePartyModeResponse,
  DEFAULT_PARTY_MODE_CONFIG,
} from '../types/party-mode.js';
import { getAgentDefinition, AgentCategory } from '../agents/registry.js';
import { getAgentsByCategories, getAllAgentsByCategoryGroups } from '../services/party-filter.js';
import {
  createSession,
  getSession,
  getSessionsByUser,
  updateSessionConfig,
  addMessageToSession,
  updateSessionTurn,
  deleteSession,
} from '../services/party-session-store.js';
import { getTurnOrderingStrategy } from '../services/turn-ordering.js';
import {
  hasModerator,
  getModerator,
  generateModeratorIntroPrompt,
  generateModeratorSummaryPrompt,
  shouldModeratorSummarize,
  shouldModeratorIntro,
  getCurrentTurnMessages,
  DEFAULT_MODERATOR_ID,
} from '../services/moderator.js';
import { parseMentions, getHandoffTarget, createMentionMetadata } from '../services/mention-parser.js';

export const partyModeRouter = Router();

/**
 * GET /party-mode/agents
 * List all available agents grouped by category
 *
 * @requires Valid session token
 */
partyModeRouter.get('/agents', requireSession, async (_req: Request, res: Response) => {
  try {
    const agentsByCategory = getAllAgentsByCategoryGroups();
    res.json(agentsByCategory);
  } catch (error) {
    console.error('List agents error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /party-mode/start
 * Start a party mode conversation with multiple agents
 *
 * @requires Valid session token
 */
partyModeRouter.post('/start', requireSession, async (req: Request, res: Response) => {
  try {
    const body = req.body as StartPartyModeRequest;
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

    // Merge configuration with defaults
    const config: PartyModeConfig = {
      ...DEFAULT_PARTY_MODE_CONFIG,
      ...body.config,
    };

    // Create session
    const session = createSession(
      userId,
      body.agentIds,
      body.topic,
      config,
      body.context
    );

    const responses: PartyModeAgentResponse[] = [];
    const turnStrategy = getTurnOrderingStrategy(config.turnOrdering);

    // Build initial context for party mode
    const partyContext = {
      ...body.context,
      partyMode: true,
      participants: body.agentIds,
      topic: body.topic,
      sessionId: session.id,
      turnOrdering: config.turnOrdering,
      moderatorId: config.moderatorId,
    };

    // Build conversation history
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
          role: msg.role as 'user' | 'assistant',
          content: msg.agentId
            ? `[${msg.agentId}]: ${msg.content}`
            : msg.content,
        })),
      ];
    }

    // If moderator exists and should intro, get moderator response first
    if (hasModerator(session) && shouldModeratorIntro(session)) {
      const moderator = getModerator(session);
      if (moderator) {
        const moderatorIntroPrompt = generateModeratorIntroPrompt(session);

        const moderatorInvocation: AgentInvocation = {
          agentId: moderator.agentId,
          userId,
          message: moderatorIntroPrompt,
          context: { ...partyContext, isModerator: true },
          conversationHistory,
        };

        const moderatorResponse = await agentService.invoke(moderatorInvocation);
        const moderatorDef = getAgentDefinition(moderator.agentId);

        const moderatorPartyResponse: PartyModeAgentResponse = {
          agentId: moderator.agentId,
          name: moderatorDef?.name || moderator.name,
          icon: moderatorDef?.icon || moderator.icon,
          message: moderatorResponse.message,
          turnNumber: 1,
          metadata: { isModeratorIntro: true },
        };

        responses.push(moderatorPartyResponse);

        // Add to history
        conversationHistory.push({
          role: 'assistant',
          content: `[${moderator.agentId}] (Moderator): ${moderatorResponse.message}`,
        });

        // Save to session
        addMessageToSession(session.id, {
          role: 'assistant',
          content: moderatorResponse.message,
          agentId: moderator.agentId,
          turnNumber: 1,
          metadata: { isModeratorIntro: true },
        });
      }
    }

    // Get speaker order for this round
    const speakerOrder = turnStrategy.getSpeakersForRound(session);

    // Run through initial turn
    for (let i = 0; i < speakerOrder.length; i++) {
      const agentId = speakerOrder[i];
      const agentDef = getAgentDefinition(agentId);

      const invocation: AgentInvocation = {
        agentId,
        userId,
        message: !body.history?.length
          ? `Please share your initial thoughts on: ${body.topic}`
          : 'Please respond to the conversation, building on what has been said.',
        context: partyContext,
        conversationHistory,
      };

      const response = await agentService.invoke(invocation);
      const mentionMetadata = createMentionMetadata(response.message);

      const partyResponse: PartyModeAgentResponse = {
        agentId,
        name: agentDef?.name || agentId,
        icon: agentDef?.icon || '🤖',
        message: response.message,
        turnNumber: 1,
        metadata: mentionMetadata,
      };

      responses.push(partyResponse);

      // Add to conversation history
      conversationHistory.push({
        role: 'assistant',
        content: `[${agentId}]: ${response.message}`,
      });

      // Save to session
      addMessageToSession(session.id, {
        role: 'assistant',
        content: response.message,
        agentId,
        turnNumber: 1,
        metadata: mentionMetadata,
      });
    }

    // Update session turn
    updateSessionTurn(session.id, 1, 0);

    // If moderator exists and all participants spoke, add summary
    const updatedSession = getSession(session.id);
    if (updatedSession && hasModerator(updatedSession) && shouldModeratorSummarize(updatedSession)) {
      const moderator = getModerator(updatedSession);
      if (moderator) {
        const turnMessages = getCurrentTurnMessages(updatedSession);
        const summaryPrompt = generateModeratorSummaryPrompt(updatedSession, turnMessages);

        const summaryInvocation: AgentInvocation = {
          agentId: moderator.agentId,
          userId,
          message: summaryPrompt,
          context: { ...partyContext, isModerator: true },
          conversationHistory,
        };

        const summaryResponse = await agentService.invoke(summaryInvocation);
        const moderatorDef = getAgentDefinition(moderator.agentId);

        const summaryPartyResponse: PartyModeAgentResponse = {
          agentId: moderator.agentId,
          name: moderatorDef?.name || moderator.name,
          icon: moderatorDef?.icon || moderator.icon,
          message: summaryResponse.message,
          turnNumber: 1,
          metadata: { isModeratorSummary: true },
        };

        responses.push(summaryPartyResponse);

        addMessageToSession(session.id, {
          role: 'assistant',
          content: summaryResponse.message,
          agentId: moderator.agentId,
          turnNumber: 1,
          metadata: { isModeratorSummary: true },
        });
      }
    }

    const result: StartPartyModeResponse = {
      sessionId: session.id,
      topic: body.topic,
      participants: session.participants,
      responses,
      totalTurns: 1,
      config,
    };

    res.json(result);
  } catch (error) {
    console.error('Party mode start error:', error);
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
 * @requires Valid session token
 */
partyModeRouter.post('/continue', requireSession, async (req: Request, res: Response) => {
  try {
    const body = req.body as ContinuePartyModeRequest;
    const userId = (req as AuthenticatedRequest).userId;

    // Get session if sessionId provided
    let session = body.sessionId ? getSession(body.sessionId) : undefined;

    // Validate we have enough info to continue
    if (!session && (!body.agentIds || body.agentIds.length < 2)) {
      res.status(400).json({
        error: 'Party mode requires sessionId or at least 2 agentIds',
      });
      return;
    }

    // If no session, create an ad-hoc one
    if (!session) {
      session = createSession(
        userId,
        body.agentIds!,
        body.topic || 'Continued discussion',
        undefined,
        body.context
      );
    }

    const responses: PartyModeAgentResponse[] = [];
    const turnStrategy = getTurnOrderingStrategy(session.config.turnOrdering);

    // Build conversation history from session or request
    let conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    if (session.history.length > 0) {
      conversationHistory = session.history.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.agentId
          ? `[${msg.agentId}]: ${msg.content}`
          : msg.content,
      }));
    } else if (body.history) {
      conversationHistory = body.history.map(msg => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.agentId
          ? `[${msg.agentId}]: ${msg.content}`
          : msg.content,
      }));
    }

    // Add user's new message if provided
    if (body.userMessage) {
      conversationHistory.push({
        role: 'user',
        content: body.userMessage,
      });

      // Save user message to session
      addMessageToSession(session.id, {
        role: 'user',
        content: body.userMessage,
        turnNumber: session.currentTurn + 1,
      });
    }

    const partyContext = {
      ...body.context,
      partyMode: true,
      participants: session.participants.map(p => p.agentId),
      topic: session.topic,
      sessionId: session.id,
      turnOrdering: session.config.turnOrdering,
      moderatorId: session.config.moderatorId,
    };

    // Check for @mention handoff in user message
    let speakerOrder: string[];
    if (body.userMessage) {
      const parseResult = parseMentions(body.userMessage);
      if (parseResult.hasMentions && parseResult.primaryMention) {
        // Mentioned agent speaks first, then others
        const participantIds = session.participants
          .filter(p => !p.isModerator)
          .map(p => p.agentId);

        const handoffTarget = getHandoffTarget(
          body.userMessage,
          participantIds,
          turnStrategy.getNextSpeaker(session, body.userMessage)
        );

        // Put handoff target first, then others
        speakerOrder = [
          handoffTarget,
          ...participantIds.filter(id => id !== handoffTarget),
        ];
      } else {
        speakerOrder = turnStrategy.getSpeakersForRound(session, body.userMessage);
      }
    } else {
      speakerOrder = turnStrategy.getSpeakersForRound(session);
    }

    const newTurn = session.currentTurn + 1;

    // Each agent responds
    for (const agentId of speakerOrder) {
      const agentDef = getAgentDefinition(agentId);

      const invocation: AgentInvocation = {
        agentId,
        userId,
        message: 'Please respond to the conversation.',
        context: partyContext,
        conversationHistory,
      };

      const response = await agentService.invoke(invocation);
      const mentionMetadata = createMentionMetadata(response.message);

      const partyResponse: PartyModeAgentResponse = {
        agentId,
        name: agentDef?.name || agentId,
        icon: agentDef?.icon || '🤖',
        message: response.message,
        turnNumber: newTurn,
        metadata: mentionMetadata,
      };

      responses.push(partyResponse);

      conversationHistory.push({
        role: 'assistant',
        content: `[${agentId}]: ${response.message}`,
      });

      addMessageToSession(session.id, {
        role: 'assistant',
        content: response.message,
        agentId,
        turnNumber: newTurn,
        metadata: mentionMetadata,
      });
    }

    // Update turn
    updateSessionTurn(session.id, newTurn, 0);

    // If moderator should summarize, add summary
    const updatedSession = getSession(session.id);
    if (updatedSession && hasModerator(updatedSession) && shouldModeratorSummarize(updatedSession)) {
      const moderator = getModerator(updatedSession);
      if (moderator) {
        const turnMessages = getCurrentTurnMessages(updatedSession);
        const summaryPrompt = generateModeratorSummaryPrompt(updatedSession, turnMessages);

        const summaryInvocation: AgentInvocation = {
          agentId: moderator.agentId,
          userId,
          message: summaryPrompt,
          context: { ...partyContext, isModerator: true },
          conversationHistory,
        };

        const summaryResponse = await agentService.invoke(summaryInvocation);
        const moderatorDef = getAgentDefinition(moderator.agentId);

        responses.push({
          agentId: moderator.agentId,
          name: moderatorDef?.name || moderator.name,
          icon: moderatorDef?.icon || moderator.icon,
          message: summaryResponse.message,
          turnNumber: newTurn,
          metadata: { isModeratorSummary: true },
        });

        addMessageToSession(updatedSession.id, {
          role: 'assistant',
          content: summaryResponse.message,
          agentId: moderator.agentId,
          turnNumber: newTurn,
          metadata: { isModeratorSummary: true },
        });
      }
    }

    // Get full updated history
    const finalSession = getSession(session.id);
    const result: ContinuePartyModeResponse = {
      sessionId: session.id,
      responses,
      history: finalSession?.history || [],
    };

    res.json(result);
  } catch (error) {
    console.error('Party mode continue error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /party-mode/session/:sessionId
 * Retrieve a saved session
 *
 * @requires Valid session token
 */
partyModeRouter.get('/session/:sessionId', requireSession, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = (req as AuthenticatedRequest).userId;

    const session = getSession(sessionId);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    // Verify ownership
    if (session.userId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    res.json(session);
  } catch (error) {
    console.error('Get session error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /party-mode/sessions
 * List all sessions for the current user
 *
 * @requires Valid session token
 */
partyModeRouter.get('/sessions', requireSession, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const sessions = getSessionsByUser(userId);

    // Return summary of sessions
    const summaries = sessions.map(s => ({
      id: s.id,
      topic: s.topic,
      participantCount: s.participants.length,
      messageCount: s.history.length,
      state: s.state,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    }));

    res.json({ sessions: summaries });
  } catch (error) {
    console.error('List sessions error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /party-mode/session/:sessionId/save
 * Save/update a session (updates the updatedAt timestamp)
 *
 * @requires Valid session token
 */
partyModeRouter.post('/session/:sessionId/save', requireSession, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = (req as AuthenticatedRequest).userId;

    const session = getSession(sessionId);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (session.userId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    // Touch the session to update timestamp
    updateSessionTurn(sessionId, session.currentTurn, session.currentSpeakerIndex);

    res.json({ success: true, sessionId });
  } catch (error) {
    console.error('Save session error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PATCH /party-mode/session/:sessionId/config
 * Update session configuration
 *
 * @requires Valid session token
 */
partyModeRouter.patch('/session/:sessionId/config', requireSession, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = (req as AuthenticatedRequest).userId;
    const { config } = req.body as { config: Partial<PartyModeConfig> };

    const session = getSession(sessionId);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (session.userId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const updatedSession = updateSessionConfig(sessionId, config);
    res.json(updatedSession);
  } catch (error) {
    console.error('Update config error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /party-mode/session/:sessionId
 * Delete a session
 *
 * @requires Valid session token
 */
partyModeRouter.delete('/session/:sessionId', requireSession, async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = (req as AuthenticatedRequest).userId;

    const session = getSession(sessionId);

    if (!session) {
      res.status(404).json({ error: 'Session not found' });
      return;
    }

    if (session.userId !== userId) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    deleteSession(sessionId);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete session error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
