/**
 * Unit tests for party mode services
 *
 * @module tests/services/party-mode.test
 * @see FOS-3.4.8: Party Mode Orchestration
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';

// Import types
import {
  TurnOrderingMode,
  PartyModeConfig,
  PartySession,
  PartyMessage,
  DEFAULT_PARTY_MODE_CONFIG,
} from '../../src/types/party-mode.js';

// Import services
import {
  createSession,
  getSession,
  getSessionsByUser,
  updateSessionConfig,
  addMessageToSession,
  updateSessionTurn,
  deleteSession,
  clearAllSessions,
  getSessionCount,
  cleanupOldSessions,
} from '../../src/services/party-session-store.js';

import {
  getAgentsByCategories,
  getAllAgentsByCategoryGroups,
  getCategoryDisplayName,
  getCategoryIcon,
  isAgentInCategories,
} from '../../src/services/party-filter.js';

import {
  parseMentions,
  getHandoffTarget,
  createMentionMetadata,
  highlightMentions,
  getAgentSuggestions,
  hasMentions,
} from '../../src/services/mention-parser.js';

import {
  getTurnOrderingStrategy,
  RoundRobinStrategy,
  DynamicStrategy,
  ModeratorDirectedStrategy,
} from '../../src/services/turn-ordering.js';

import {
  hasModerator,
  getModerator,
  generateModeratorIntroPrompt,
  generateModeratorSummaryPrompt,
  shouldModeratorIntro,
  shouldModeratorSummarize,
  DEFAULT_MODERATOR_ID,
} from '../../src/services/moderator.js';

import { AgentCategory } from '../../src/agents/registry.js';

describe('Party Mode Types', () => {
  describe('TurnOrderingMode enum', () => {
    it('should have all three ordering modes', () => {
      expect(TurnOrderingMode.ROUND_ROBIN).toBe('round-robin');
      expect(TurnOrderingMode.DYNAMIC).toBe('dynamic');
      expect(TurnOrderingMode.MODERATOR_DIRECTED).toBe('moderator-directed');
    });
  });

  describe('DEFAULT_PARTY_MODE_CONFIG', () => {
    it('should have aurora-forester as default moderator', () => {
      expect(DEFAULT_PARTY_MODE_CONFIG.moderatorId).toBe('aurora-forester');
    });

    it('should have round-robin as default turn ordering', () => {
      expect(DEFAULT_PARTY_MODE_CONFIG.turnOrdering).toBe(TurnOrderingMode.ROUND_ROBIN);
    });

    it('should have empty category filter by default', () => {
      expect(DEFAULT_PARTY_MODE_CONFIG.categoryFilter).toEqual([]);
    });

    it('should have maxTurns of 5 by default', () => {
      expect(DEFAULT_PARTY_MODE_CONFIG.maxTurns).toBe(5);
    });
  });
});

describe('Party Session Store', () => {
  beforeEach(() => {
    clearAllSessions();
  });

  afterEach(() => {
    clearAllSessions();
  });

  describe('createSession', () => {
    it('should create a session with unique ID', () => {
      const session = createSession('user-1', ['bob', 'aurora-forester'], 'Test topic');
      expect(session.id).toBeDefined();
      expect(session.id.length).toBeGreaterThan(0);
    });

    it('should set userId correctly', () => {
      const session = createSession('user-123', ['bob', 'aurora-forester'], 'Test');
      expect(session.userId).toBe('user-123');
    });

    it('should set topic correctly', () => {
      const session = createSession('user-1', ['bob', 'aurora-forester'], 'My Discussion');
      expect(session.topic).toBe('My Discussion');
    });

    it('should initialize with empty history', () => {
      const session = createSession('user-1', ['bob', 'aurora-forester'], 'Test');
      expect(session.history).toEqual([]);
    });

    it('should set state to active', () => {
      const session = createSession('user-1', ['bob', 'aurora-forester'], 'Test');
      expect(session.state).toBe('active');
    });

    it('should mark aurora-forester as moderator by default', () => {
      const session = createSession('user-1', ['bob', 'aurora-forester'], 'Test');
      const moderator = session.participants.find(p => p.isModerator);
      expect(moderator?.agentId).toBe('aurora-forester');
    });

    it('should apply custom config', () => {
      const session = createSession(
        'user-1',
        ['bob', 'tea'],
        'Test',
        { turnOrdering: TurnOrderingMode.DYNAMIC, moderatorId: null }
      );
      expect(session.config.turnOrdering).toBe(TurnOrderingMode.DYNAMIC);
      expect(session.config.moderatorId).toBeNull();
    });
  });

  describe('getSession', () => {
    it('should return session by ID', () => {
      const created = createSession('user-1', ['bob', 'aurora-forester'], 'Test');
      const retrieved = getSession(created.id);
      expect(retrieved?.id).toBe(created.id);
    });

    it('should return undefined for non-existent session', () => {
      const result = getSession('non-existent-id');
      expect(result).toBeUndefined();
    });
  });

  describe('getSessionsByUser', () => {
    it('should return all sessions for a user', () => {
      createSession('user-1', ['bob', 'aurora-forester'], 'Topic 1');
      createSession('user-1', ['tea', 'aurora-forester'], 'Topic 2');
      createSession('user-2', ['bob', 'aurora-forester'], 'Topic 3');

      const user1Sessions = getSessionsByUser('user-1');
      expect(user1Sessions).toHaveLength(2);
    });

    it('should return empty array for user with no sessions', () => {
      createSession('user-1', ['bob', 'aurora-forester'], 'Topic');
      const sessions = getSessionsByUser('user-2');
      expect(sessions).toEqual([]);
    });
  });

  describe('updateSessionConfig', () => {
    it('should update turn ordering mode', () => {
      const session = createSession('user-1', ['bob', 'aurora-forester'], 'Test');
      updateSessionConfig(session.id, { turnOrdering: TurnOrderingMode.DYNAMIC });
      const updated = getSession(session.id);
      expect(updated?.config.turnOrdering).toBe(TurnOrderingMode.DYNAMIC);
    });

    it('should update moderator and participant flags', () => {
      const session = createSession('user-1', ['bob', 'aurora-forester', 'tea'], 'Test');
      updateSessionConfig(session.id, { moderatorId: 'tea' });
      const updated = getSession(session.id);
      expect(updated?.config.moderatorId).toBe('tea');
      const newModerator = updated?.participants.find(p => p.isModerator);
      expect(newModerator?.agentId).toBe('tea');
    });

    it('should return undefined for non-existent session', () => {
      const result = updateSessionConfig('non-existent', { turnOrdering: TurnOrderingMode.DYNAMIC });
      expect(result).toBeUndefined();
    });
  });

  describe('addMessageToSession', () => {
    it('should add message to history', () => {
      const session = createSession('user-1', ['bob', 'aurora-forester'], 'Test');
      addMessageToSession(session.id, {
        role: 'user',
        content: 'Hello',
        turnNumber: 1,
      });
      const updated = getSession(session.id);
      expect(updated?.history).toHaveLength(1);
      expect(updated?.history[0].content).toBe('Hello');
    });

    it('should generate message ID and timestamp', () => {
      const session = createSession('user-1', ['bob', 'aurora-forester'], 'Test');
      addMessageToSession(session.id, {
        role: 'assistant',
        content: 'Response',
        agentId: 'bob',
        turnNumber: 1,
      });
      const updated = getSession(session.id);
      expect(updated?.history[0].id).toBeDefined();
      expect(updated?.history[0].timestamp).toBeGreaterThan(0);
    });

    it('should increment participant turn count', () => {
      const session = createSession('user-1', ['bob', 'aurora-forester'], 'Test');
      addMessageToSession(session.id, {
        role: 'assistant',
        content: 'Response',
        agentId: 'bob',
        turnNumber: 1,
      });
      const updated = getSession(session.id);
      const bob = updated?.participants.find(p => p.agentId === 'bob');
      expect(bob?.turnCount).toBe(1);
    });
  });

  describe('deleteSession', () => {
    it('should delete session and return true', () => {
      const session = createSession('user-1', ['bob', 'aurora-forester'], 'Test');
      const result = deleteSession(session.id);
      expect(result).toBe(true);
      expect(getSession(session.id)).toBeUndefined();
    });

    it('should return false for non-existent session', () => {
      const result = deleteSession('non-existent');
      expect(result).toBe(false);
    });
  });

  describe('getSessionCount', () => {
    it('should return correct count', () => {
      expect(getSessionCount()).toBe(0);
      createSession('user-1', ['bob', 'aurora-forester'], 'Test 1');
      expect(getSessionCount()).toBe(1);
      createSession('user-1', ['bob', 'aurora-forester'], 'Test 2');
      expect(getSessionCount()).toBe(2);
    });
  });
});

describe('Party Filter Service', () => {
  describe('getAgentsByCategories', () => {
    it('should return all agents when no categories specified', () => {
      const agents = getAgentsByCategories([]);
      expect(agents.length).toBeGreaterThan(0);
    });

    it('should filter by single category', () => {
      const agents = getAgentsByCategories([AgentCategory.CORE]);
      expect(agents.every(a => a.category === AgentCategory.CORE)).toBe(true);
    });

    it('should filter by multiple categories', () => {
      const agents = getAgentsByCategories([AgentCategory.CORE, AgentCategory.CREATIVE]);
      expect(agents.every(a =>
        a.category === AgentCategory.CORE || a.category === AgentCategory.CREATIVE
      )).toBe(true);
    });
  });

  describe('getAllAgentsByCategoryGroups', () => {
    it('should return grouped agents with total count', () => {
      const result = getAllAgentsByCategoryGroups();
      expect(result.categories).toBeDefined();
      expect(result.totalAgents).toBeGreaterThan(0);
    });

    it('should have category groups with agents', () => {
      const result = getAllAgentsByCategoryGroups();
      for (const group of result.categories) {
        expect(group.category).toBeDefined();
        expect(group.agents.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getCategoryDisplayName', () => {
    it('should return human-readable names', () => {
      expect(getCategoryDisplayName(AgentCategory.CORE)).toBe('Core Team');
      expect(getCategoryDisplayName(AgentCategory.CREATIVE)).toBe('Creative Intelligence');
      expect(getCategoryDisplayName(AgentCategory.GAMEDEV)).toBe('Game Development');
    });
  });

  describe('getCategoryIcon', () => {
    it('should return icons for each category', () => {
      expect(getCategoryIcon(AgentCategory.CORE)).toBe('🏢');
      expect(getCategoryIcon(AgentCategory.GAMEDEV)).toBe('🎮');
      expect(getCategoryIcon(AgentCategory.CREATIVE)).toBe('✨');
    });
  });
});

describe('Mention Parser', () => {
  describe('parseMentions', () => {
    it('should find valid @mentions', () => {
      const result = parseMentions('Hey @bob what do you think?');
      expect(result.validMentions).toContain('bob');
      expect(result.hasMentions).toBe(true);
    });

    it('should return empty for no mentions', () => {
      const result = parseMentions('No mentions here');
      expect(result.validMentions).toEqual([]);
      expect(result.hasMentions).toBe(false);
    });

    it('should find multiple mentions', () => {
      const result = parseMentions('@bob and @tea should discuss this');
      expect(result.validMentions).toContain('bob');
      expect(result.validMentions).toContain('tea');
    });

    it('should identify invalid mentions', () => {
      const result = parseMentions('@nonexistent-agent-xyz says hello');
      expect(result.invalidMentions).toContain('nonexistent-agent-xyz');
    });

    it('should set primaryMention to first valid mention', () => {
      const result = parseMentions('@aurora-forester and @bob');
      expect(result.primaryMention).toBe('aurora-forester');
    });
  });

  describe('getHandoffTarget', () => {
    it('should return mentioned agent if participant', () => {
      const target = getHandoffTarget(
        '@bob what do you think?',
        ['bob', 'tea', 'aurora-forester'],
        'tea'
      );
      expect(target).toBe('bob');
    });

    it('should return default if mention not a participant', () => {
      const target = getHandoffTarget(
        '@nonexistent says hi',
        ['bob', 'tea'],
        'tea'
      );
      expect(target).toBe('tea');
    });

    it('should return default if no mentions', () => {
      const target = getHandoffTarget(
        'No mentions',
        ['bob', 'tea'],
        'bob'
      );
      expect(target).toBe('bob');
    });
  });

  describe('createMentionMetadata', () => {
    it('should return metadata with mentions', () => {
      const metadata = createMentionMetadata('@bob and @tea');
      expect(metadata?.mentions).toContain('bob');
      expect(metadata?.mentions).toContain('tea');
    });

    it('should return undefined for no mentions', () => {
      const metadata = createMentionMetadata('No mentions');
      expect(metadata).toBeUndefined();
    });
  });

  describe('highlightMentions', () => {
    it('should wrap mentions in bold', () => {
      const result = highlightMentions('Hey @bob');
      expect(result).toBe('Hey **@bob**');
    });
  });

  describe('hasMentions', () => {
    it('should return true for text with mentions', () => {
      expect(hasMentions('@bob')).toBe(true);
    });

    it('should return false for text without mentions', () => {
      expect(hasMentions('No mentions')).toBe(false);
    });
  });
});

describe('Turn Ordering Strategies', () => {
  const createMockSession = (moderatorId: string | null = 'aurora-forester'): PartySession => ({
    id: 'test-session',
    userId: 'user-1',
    config: {
      categoryFilter: [],
      turnOrdering: TurnOrderingMode.ROUND_ROBIN,
      moderatorId,
      maxTurns: 5,
    },
    topic: 'Test topic',
    participants: [
      { agentId: 'bob', name: 'Bob', category: AgentCategory.CORE, icon: '💻', isModerator: false, turnCount: 0 },
      { agentId: 'tea', name: 'Tea', category: AgentCategory.CORE, icon: '🧪', isModerator: false, turnCount: 0 },
      { agentId: 'aurora-forester', name: 'Aurora', category: AgentCategory.CORE, icon: '🌲', isModerator: moderatorId === 'aurora-forester', turnCount: 0 },
    ],
    history: [],
    currentTurn: 0,
    currentSpeakerIndex: 0,
    state: 'active',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  describe('getTurnOrderingStrategy', () => {
    it('should return RoundRobinStrategy for ROUND_ROBIN', () => {
      const strategy = getTurnOrderingStrategy(TurnOrderingMode.ROUND_ROBIN);
      expect(strategy).toBeInstanceOf(RoundRobinStrategy);
    });

    it('should return DynamicStrategy for DYNAMIC', () => {
      const strategy = getTurnOrderingStrategy(TurnOrderingMode.DYNAMIC);
      expect(strategy).toBeInstanceOf(DynamicStrategy);
    });

    it('should return ModeratorDirectedStrategy for MODERATOR_DIRECTED', () => {
      const strategy = getTurnOrderingStrategy(TurnOrderingMode.MODERATOR_DIRECTED);
      expect(strategy).toBeInstanceOf(ModeratorDirectedStrategy);
    });
  });

  describe('RoundRobinStrategy', () => {
    it('should return non-moderator participants in order', () => {
      const strategy = new RoundRobinStrategy();
      const session = createMockSession();
      const speakers = strategy.getSpeakersForRound(session);
      expect(speakers).toContain('bob');
      expect(speakers).toContain('tea');
      expect(speakers).not.toContain('aurora-forester'); // moderator excluded
    });
  });

  describe('DynamicStrategy', () => {
    it('should prioritize @mentioned agent', () => {
      const strategy = new DynamicStrategy();
      const session = createMockSession();
      const nextSpeaker = strategy.getNextSpeaker(session, '@tea please explain');
      expect(nextSpeaker).toBe('tea');
    });

    it('should use least-spoken agent when no context', () => {
      const strategy = new DynamicStrategy();
      const session = createMockSession();
      session.participants[0].turnCount = 5; // bob spoken 5 times
      session.participants[1].turnCount = 0; // tea spoken 0 times
      const nextSpeaker = strategy.getNextSpeaker(session);
      expect(nextSpeaker).toBe('tea');
    });
  });

  describe('ModeratorDirectedStrategy', () => {
    it('should use mentioned agent from moderator message', () => {
      const strategy = new ModeratorDirectedStrategy();
      const session = createMockSession();
      const nextSpeaker = strategy.getNextSpeaker(session, '@bob please share your thoughts');
      expect(nextSpeaker).toBe('bob');
    });

    it('should fall back to round-robin if no direction', () => {
      const strategy = new ModeratorDirectedStrategy();
      const session = createMockSession();
      const nextSpeaker = strategy.getNextSpeaker(session, 'Continue the discussion');
      expect(['bob', 'tea']).toContain(nextSpeaker);
    });
  });
});

describe('Moderator Service', () => {
  const createMockSession = (moderatorId: string | null): PartySession => ({
    id: 'test-session',
    userId: 'user-1',
    config: {
      categoryFilter: [],
      turnOrdering: TurnOrderingMode.ROUND_ROBIN,
      moderatorId,
      maxTurns: 5,
    },
    topic: 'Test discussion',
    participants: [
      { agentId: 'bob', name: 'Bob', category: AgentCategory.CORE, icon: '💻', isModerator: false, turnCount: 0 },
      { agentId: 'aurora-forester', name: 'Aurora', category: AgentCategory.CORE, icon: '🌲', isModerator: moderatorId === 'aurora-forester', turnCount: 0 },
    ],
    history: [],
    currentTurn: 0,
    currentSpeakerIndex: 0,
    state: 'active',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  });

  describe('DEFAULT_MODERATOR_ID', () => {
    it('should be aurora-forester', () => {
      expect(DEFAULT_MODERATOR_ID).toBe('aurora-forester');
    });
  });

  describe('hasModerator', () => {
    it('should return true when moderator configured and is participant', () => {
      const session = createMockSession('aurora-forester');
      expect(hasModerator(session)).toBe(true);
    });

    it('should return false when no moderator configured', () => {
      const session = createMockSession(null);
      expect(hasModerator(session)).toBe(false);
    });
  });

  describe('getModerator', () => {
    it('should return moderator participant', () => {
      const session = createMockSession('aurora-forester');
      const moderator = getModerator(session);
      expect(moderator?.agentId).toBe('aurora-forester');
    });

    it('should return undefined when no moderator', () => {
      const session = createMockSession(null);
      expect(getModerator(session)).toBeUndefined();
    });
  });

  describe('generateModeratorIntroPrompt', () => {
    it('should include topic', () => {
      const session = createMockSession('aurora-forester');
      const prompt = generateModeratorIntroPrompt(session);
      expect(prompt).toContain('Test discussion');
    });

    it('should mention participants', () => {
      const session = createMockSession('aurora-forester');
      const prompt = generateModeratorIntroPrompt(session);
      expect(prompt).toContain('Bob');
    });
  });

  describe('shouldModeratorIntro', () => {
    it('should return true when history is empty', () => {
      const session = createMockSession('aurora-forester');
      expect(shouldModeratorIntro(session)).toBe(true);
    });

    it('should return false when moderator has spoken', () => {
      const session = createMockSession('aurora-forester');
      session.history.push({
        id: '1',
        role: 'assistant',
        content: 'Hello',
        agentId: 'aurora-forester',
        timestamp: Date.now(),
        turnNumber: 1,
      });
      expect(shouldModeratorIntro(session)).toBe(false);
    });

    it('should return false when no moderator', () => {
      const session = createMockSession(null);
      expect(shouldModeratorIntro(session)).toBe(false);
    });
  });
});
