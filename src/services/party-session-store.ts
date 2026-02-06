/**
 * Party Session Store
 *
 * In-memory storage for party mode sessions with CRUD operations.
 * Can be migrated to Redis or other persistent storage later.
 *
 * @see Story FOS-3.4.8: Party Mode Orchestration
 */

import type {
  PartySession,
  PartyModeConfig,
  PartyParticipant,
  PartyMessage,
  PartySessionState,
} from '../types/party-mode.js';
import { DEFAULT_PARTY_MODE_CONFIG } from '../types/party-mode.js';
import { getAgentDefinition, AgentCategory } from '../agents/registry.js';
import { randomUUID } from 'crypto';

/**
 * In-memory session storage
 */
const sessionStore = new Map<string, PartySession>();

/**
 * Create a new party session
 *
 * @param userId - User who owns the session
 * @param agentIds - Agent IDs to include as participants
 * @param topic - Discussion topic
 * @param config - Optional configuration overrides
 * @param context - Optional additional context
 * @returns The created session
 */
export function createSession(
  userId: string,
  agentIds: string[],
  topic: string,
  config?: Partial<PartyModeConfig>,
  context?: Record<string, unknown>
): PartySession {
  const sessionId = randomUUID();
  const now = Date.now();

  // Build participants list
  const participants: PartyParticipant[] = [];
  const moderatorId = config?.moderatorId ?? DEFAULT_PARTY_MODE_CONFIG.moderatorId;

  for (const agentId of agentIds) {
    const agentDef = getAgentDefinition(agentId);
    if (agentDef) {
      participants.push({
        agentId,
        name: agentDef.name,
        category: agentDef.category,
        icon: agentDef.icon,
        isModerator: agentId === moderatorId,
        turnCount: 0,
      });
    }
  }

  // Merge config with defaults
  const sessionConfig: PartyModeConfig = {
    ...DEFAULT_PARTY_MODE_CONFIG,
    ...config,
  };

  const session: PartySession = {
    id: sessionId,
    userId,
    config: sessionConfig,
    topic,
    participants,
    history: [],
    currentTurn: 0,
    currentSpeakerIndex: 0,
    state: 'active',
    createdAt: now,
    updatedAt: now,
    context,
  };

  sessionStore.set(sessionId, session);
  return session;
}

/**
 * Get a session by ID
 *
 * @param sessionId - Session ID to retrieve
 * @returns The session or undefined if not found
 */
export function getSession(sessionId: string): PartySession | undefined {
  return sessionStore.get(sessionId);
}

/**
 * Get all sessions for a user
 *
 * @param userId - User ID to filter by
 * @returns Array of sessions belonging to the user
 */
export function getSessionsByUser(userId: string): PartySession[] {
  const sessions: PartySession[] = [];
  for (const session of sessionStore.values()) {
    if (session.userId === userId) {
      sessions.push(session);
    }
  }
  return sessions;
}

/**
 * Update a session's configuration
 *
 * @param sessionId - Session ID to update
 * @param config - Configuration updates
 * @returns Updated session or undefined if not found
 */
export function updateSessionConfig(
  sessionId: string,
  config: Partial<PartyModeConfig>
): PartySession | undefined {
  const session = sessionStore.get(sessionId);
  if (!session) {
    return undefined;
  }

  session.config = { ...session.config, ...config };
  session.updatedAt = Date.now();

  // Update moderator status if moderatorId changed
  if (config.moderatorId !== undefined) {
    for (const participant of session.participants) {
      participant.isModerator = participant.agentId === config.moderatorId;
    }
  }

  sessionStore.set(sessionId, session);
  return session;
}

/**
 * Add a message to a session's history
 *
 * @param sessionId - Session ID
 * @param message - Message to add
 * @returns Updated session or undefined if not found
 */
export function addMessageToSession(
  sessionId: string,
  message: Omit<PartyMessage, 'id' | 'timestamp'>
): PartySession | undefined {
  const session = sessionStore.get(sessionId);
  if (!session) {
    return undefined;
  }

  const fullMessage: PartyMessage = {
    ...message,
    id: randomUUID(),
    timestamp: Date.now(),
  };

  session.history.push(fullMessage);
  session.updatedAt = Date.now();

  // Update participant turn count if it's an agent message
  if (message.agentId) {
    const participant = session.participants.find(p => p.agentId === message.agentId);
    if (participant) {
      participant.turnCount++;
    }
  }

  sessionStore.set(sessionId, session);
  return session;
}

/**
 * Update session state
 *
 * @param sessionId - Session ID
 * @param state - New session state
 * @returns Updated session or undefined if not found
 */
export function updateSessionState(
  sessionId: string,
  state: PartySessionState
): PartySession | undefined {
  const session = sessionStore.get(sessionId);
  if (!session) {
    return undefined;
  }

  session.state = state;
  session.updatedAt = Date.now();
  sessionStore.set(sessionId, session);
  return session;
}

/**
 * Update current turn and speaker index
 *
 * @param sessionId - Session ID
 * @param turn - New turn number
 * @param speakerIndex - New speaker index
 * @returns Updated session or undefined if not found
 */
export function updateSessionTurn(
  sessionId: string,
  turn: number,
  speakerIndex: number
): PartySession | undefined {
  const session = sessionStore.get(sessionId);
  if (!session) {
    return undefined;
  }

  session.currentTurn = turn;
  session.currentSpeakerIndex = speakerIndex;
  session.updatedAt = Date.now();
  sessionStore.set(sessionId, session);
  return session;
}

/**
 * Delete a session
 *
 * @param sessionId - Session ID to delete
 * @returns True if deleted, false if not found
 */
export function deleteSession(sessionId: string): boolean {
  return sessionStore.delete(sessionId);
}

/**
 * Clear all sessions (for testing)
 */
export function clearAllSessions(): void {
  sessionStore.clear();
}

/**
 * Get total number of sessions (for monitoring)
 */
export function getSessionCount(): number {
  return sessionStore.size;
}

/**
 * Clean up old sessions (sessions older than maxAge milliseconds)
 *
 * @param maxAge - Maximum age in milliseconds (default: 24 hours)
 * @returns Number of sessions deleted
 */
export function cleanupOldSessions(maxAge: number = 24 * 60 * 60 * 1000): number {
  const now = Date.now();
  let deletedCount = 0;

  for (const [sessionId, session] of sessionStore.entries()) {
    if (now - session.updatedAt > maxAge) {
      sessionStore.delete(sessionId);
      deletedCount++;
    }
  }

  return deletedCount;
}
