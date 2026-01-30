/**
 * Party Mode Types
 *
 * Types for enhanced party mode orchestration with category filtering,
 * moderator support, turn ordering, and session persistence.
 *
 * @see Story FOS-3.4.8: Party Mode Orchestration
 */

import { AgentCategory } from '../agents/registry.js';

/**
 * Turn ordering modes for party conversations
 */
export enum TurnOrderingMode {
  /** Sequential cycling through all agents */
  ROUND_ROBIN = 'round-robin',
  /** Agents interject based on relevance */
  DYNAMIC = 'dynamic',
  /** Moderator chooses next speaker */
  MODERATOR_DIRECTED = 'moderator-directed',
}

/**
 * Configuration for a party mode session
 */
export interface PartyModeConfig {
  /** Filter agents by categories (empty = all categories) */
  categoryFilter: AgentCategory[];
  /** How turns are ordered in conversation */
  turnOrdering: TurnOrderingMode;
  /** ID of the moderator agent (null = no moderator) */
  moderatorId: string | null;
  /** Maximum turns per conversation round */
  maxTurns: number;
}

/**
 * Default party mode configuration
 */
export const DEFAULT_PARTY_MODE_CONFIG: PartyModeConfig = {
  categoryFilter: [],
  turnOrdering: TurnOrderingMode.ROUND_ROBIN,
  moderatorId: 'aurora-forester', // Aurora as default moderator
  maxTurns: 5,
};

/**
 * State of a party mode participant
 */
export interface PartyParticipant {
  /** Agent ID */
  agentId: string;
  /** Display name */
  name: string;
  /** Agent category */
  category: AgentCategory;
  /** Agent icon */
  icon: string;
  /** Whether this participant is the moderator */
  isModerator: boolean;
  /** Number of times this agent has spoken */
  turnCount: number;
}

/**
 * A message in the party conversation
 */
export interface PartyMessage {
  /** Unique message ID */
  id: string;
  /** Role in conversation */
  role: 'user' | 'assistant' | 'system';
  /** Message content */
  content: string;
  /** Agent ID if from an agent */
  agentId?: string;
  /** Timestamp */
  timestamp: number;
  /** Turn number in the conversation */
  turnNumber: number;
  /** Metadata (e.g., @mentions detected) */
  metadata?: PartyMessageMetadata;
}

/**
 * Metadata attached to party messages
 */
export interface PartyMessageMetadata {
  /** Agent IDs mentioned with @ */
  mentions?: string[];
  /** Whether this is a moderator summary */
  isModeratorSummary?: boolean;
  /** Whether this is a moderator intro */
  isModeratorIntro?: boolean;
  /** Relevance score for dynamic ordering */
  relevanceScore?: number;
}

/**
 * Complete state of a party mode session
 */
export interface PartySession {
  /** Unique session ID */
  id: string;
  /** User who owns this session */
  userId: string;
  /** Session configuration */
  config: PartyModeConfig;
  /** Discussion topic */
  topic: string;
  /** All participants in the session */
  participants: PartyParticipant[];
  /** Conversation history */
  history: PartyMessage[];
  /** Current turn number */
  currentTurn: number;
  /** Index of current speaker (for round-robin) */
  currentSpeakerIndex: number;
  /** Session state */
  state: PartySessionState;
  /** When session was created */
  createdAt: number;
  /** When session was last updated */
  updatedAt: number;
  /** Additional context for the conversation */
  context?: Record<string, unknown>;
}

/**
 * Possible states of a party session
 */
export type PartySessionState = 'active' | 'paused' | 'completed';

/**
 * Request body for starting a party mode session
 */
export interface StartPartyModeRequest {
  /** Agent IDs to include */
  agentIds: string[];
  /** Topic for discussion */
  topic: string;
  /** Optional configuration overrides */
  config?: Partial<PartyModeConfig>;
  /** Previous history to continue from */
  history?: PartyMessage[];
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Response from starting a party mode session
 */
export interface StartPartyModeResponse {
  /** Session ID for persistence */
  sessionId: string;
  /** Topic being discussed */
  topic: string;
  /** All participants */
  participants: PartyParticipant[];
  /** Initial responses from agents */
  responses: PartyModeAgentResponse[];
  /** Total turns completed */
  totalTurns: number;
  /** Applied configuration */
  config: PartyModeConfig;
}

/**
 * Request body for continuing a party conversation
 */
export interface ContinuePartyModeRequest {
  /** Session ID to continue */
  sessionId?: string;
  /** Agent IDs (required if no sessionId) */
  agentIds?: string[];
  /** Topic (required if no sessionId) */
  topic?: string;
  /** User's message */
  userMessage?: string;
  /** Conversation history (if not using session) */
  history?: PartyMessage[];
  /** Additional context */
  context?: Record<string, unknown>;
}

/**
 * Response from an individual agent in party mode
 */
export interface PartyModeAgentResponse {
  /** Agent ID */
  agentId: string;
  /** Agent name */
  name: string;
  /** Agent icon */
  icon: string;
  /** Response message */
  message: string;
  /** Turn number */
  turnNumber: number;
  /** Message metadata */
  metadata?: PartyMessageMetadata;
}

/**
 * Response from continuing a party conversation
 */
export interface ContinuePartyModeResponse {
  /** Session ID */
  sessionId?: string;
  /** Agent responses */
  responses: PartyModeAgentResponse[];
  /** Updated history */
  history: PartyMessage[];
}

/**
 * Request to update session configuration
 */
export interface UpdatePartyConfigRequest {
  /** New configuration values */
  config: Partial<PartyModeConfig>;
}

/**
 * Response from listing available agents
 */
export interface ListPartyAgentsResponse {
  /** Agents grouped by category */
  categories: {
    category: AgentCategory;
    agents: {
      id: string;
      name: string;
      icon: string;
      description: string;
      capabilities: string[];
    }[];
  }[];
  /** Total agent count */
  totalAgents: number;
}
