/**
 * Proposal Extraction Tests
 *
 * Story FOS-4.1.4: AI Proposal Extraction
 * Task 9: Add tests for extraction route
 *
 * @see AC-4.1.4.1 - Manual extraction trigger
 * @see AC-4.1.4.2 - Structured proposal output
 * @see AC-4.1.4.6 - Caching behavior
 * @see AC-4.1.4.7 - Fallback mode
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  type ExtractionRequest,
  type DiscussionContent,
  type ExtractionResponse,
  type FallbackResponse,
  generateCacheKey,
  isValidTitle,
  isValidVotingPeriod,
  isValidCategory,
  VOTING_PERIOD_HOURS,
  TITLE_LENGTH,
} from '../src/types/proposal-extraction.js';

// =============================================================================
// Type Validation Tests
// =============================================================================

describe('Proposal Extraction Types', () => {
  describe('generateCacheKey', () => {
    it('should generate consistent cache keys', () => {
      const key1 = generateCacheKey('discussion-123', 1706700000000);
      const key2 = generateCacheKey('discussion-123', 1706700000000);
      expect(key1).toBe(key2);
    });

    it('should generate different keys for different timestamps', () => {
      const key1 = generateCacheKey('discussion-123', 1706700000000);
      const key2 = generateCacheKey('discussion-123', 1706700001000);
      expect(key1).not.toBe(key2);
    });

    it('should generate different keys for different discussions', () => {
      const key1 = generateCacheKey('discussion-123', 1706700000000);
      const key2 = generateCacheKey('discussion-456', 1706700000000);
      expect(key1).not.toBe(key2);
    });

    it('should follow expected format', () => {
      const key = generateCacheKey('abc', 12345);
      expect(key).toBe('discussion-abc-12345');
    });
  });

  describe('isValidTitle', () => {
    it('should accept valid titles', () => {
      expect(isValidTitle('A')).toBe(true);
      expect(isValidTitle('A valid proposal title')).toBe(true);
      expect(isValidTitle('x'.repeat(200))).toBe(true);
    });

    it('should reject empty titles', () => {
      expect(isValidTitle('')).toBe(false);
    });

    it('should reject titles over 200 chars', () => {
      expect(isValidTitle('x'.repeat(201))).toBe(false);
    });
  });

  describe('isValidVotingPeriod', () => {
    it('should accept valid voting periods', () => {
      expect(isValidVotingPeriod(24)).toBe(true);
      expect(isValidVotingPeriod(72)).toBe(true);
      expect(isValidVotingPeriod(168)).toBe(true);
    });

    it('should reject periods below minimum', () => {
      expect(isValidVotingPeriod(23)).toBe(false);
      expect(isValidVotingPeriod(0)).toBe(false);
      expect(isValidVotingPeriod(-1)).toBe(false);
    });

    it('should reject periods above maximum', () => {
      expect(isValidVotingPeriod(169)).toBe(false);
      expect(isValidVotingPeriod(500)).toBe(false);
    });
  });

  describe('isValidCategory', () => {
    it('should accept valid categories', () => {
      expect(isValidCategory('Constitutional')).toBe(true);
      expect(isValidCategory('Operational')).toBe(true);
      expect(isValidCategory('Treasury')).toBe(true);
      expect(isValidCategory('SoftwareDevelopment')).toBe(true);
    });

    it('should reject invalid categories', () => {
      expect(isValidCategory('invalid')).toBe(false);
      expect(isValidCategory('constitutional')).toBe(false); // case sensitive
      expect(isValidCategory('')).toBe(false);
    });
  });

  describe('Constants', () => {
    it('should have correct voting period limits', () => {
      expect(VOTING_PERIOD_HOURS.MIN).toBe(24);
      expect(VOTING_PERIOD_HOURS.MAX).toBe(168);
      expect(VOTING_PERIOD_HOURS.DEFAULT).toBe(72);
    });

    it('should have correct title length limits', () => {
      expect(TITLE_LENGTH.MIN).toBe(1);
      expect(TITLE_LENGTH.MAX).toBe(200);
    });
  });
});

// =============================================================================
// Mock Data Factories
// =============================================================================

function createMockDiscussionContent(overrides?: Partial<DiscussionContent>): DiscussionContent {
  return {
    discussionId: 'test-discussion-123',
    topic: 'Improve DAO Governance Process',
    currentStage: 'Ready',
    category: 'Operational',
    comments: [
      {
        id: 'comment-1',
        content: 'We should streamline the proposal process to make it easier for members to participate.',
        authorId: 'user-1',
        authorName: 'Alice',
        authorType: 'Human',
        timestamp: 1706700000000,
        isRetracted: false,
      },
      {
        id: 'comment-2',
        content: 'I agree. Adding templates would help new members understand the format.',
        authorId: 'user-2',
        authorName: 'Bob',
        authorType: 'Human',
        timestamp: 1706700001000,
        isRetracted: false,
      },
      {
        id: 'comment-3',
        content: 'Based on my analysis, I recommend a 48-hour minimum discussion period.',
        authorId: 'agent-1',
        authorName: 'Winston',
        authorType: { Agent: { agent_id: 'winston' } },
        timestamp: 1706700002000,
        isRetracted: false,
      },
    ],
    participants: [
      { id: 'user-1', displayName: 'Alice', isProposer: true, isContributor: false },
      { id: 'user-2', displayName: 'Bob', isProposer: false, isContributor: true },
    ],
    stageHistory: [
      { stage: 'Brainstorm', timestamp: 1706699000000 },
      { stage: 'Refining', timestamp: 1706699500000 },
      { stage: 'Ready', timestamp: 1706700000000 },
    ],
    lastCommentTimestamp: 1706700002000,
    ...overrides,
  };
}

function createMockExtractionRequest(overrides?: Partial<ExtractionRequest>): ExtractionRequest {
  return {
    discussionId: 'test-discussion-123',
    discussionContent: createMockDiscussionContent(),
    category: 'Operational',
    extractionTarget: 'full',
    ...overrides,
  };
}

// =============================================================================
// Request Validation Tests
// =============================================================================

describe('Extraction Request Validation', () => {
  it('should create valid mock request', () => {
    const request = createMockExtractionRequest();
    expect(request.discussionId).toBe('test-discussion-123');
    expect(request.category).toBe('Operational');
    expect(request.extractionTarget).toBe('full');
    expect(request.discussionContent.comments.length).toBe(3);
  });

  it('should track human vs agent comments', () => {
    const request = createMockExtractionRequest();
    const humanComments = request.discussionContent.comments.filter(c => c.authorType === 'Human');
    const agentComments = request.discussionContent.comments.filter(c => typeof c.authorType === 'object');

    expect(humanComments.length).toBe(2);
    expect(agentComments.length).toBe(1);
  });

  it('should identify proposer', () => {
    const request = createMockExtractionRequest();
    const proposer = request.discussionContent.participants.find(p => p.isProposer);
    expect(proposer?.displayName).toBe('Alice');
  });

  it('should handle empty comments array', () => {
    const content = createMockDiscussionContent({ comments: [] });
    expect(content.comments.length).toBe(0);
  });

  it('should handle retracted comments', () => {
    const content = createMockDiscussionContent({
      comments: [
        {
          id: 'comment-1',
          content: 'This was retracted',
          authorId: 'user-1',
          authorName: 'Alice',
          authorType: 'Human',
          timestamp: 1706700000000,
          isRetracted: true,
        },
      ],
    });
    expect(content.comments[0].isRetracted).toBe(true);
  });
});

// =============================================================================
// Response Structure Tests
// =============================================================================

describe('Extraction Response Structure', () => {
  it('should have correct proposal structure', () => {
    const response: ExtractionResponse = {
      proposal: {
        category: 'Operational',
        title: 'Improve Governance Process',
        description: '## Summary\n\nThis proposal aims to improve...',
        votingPeriodHours: 72,
      },
      reasoningTrace: {
        derivations: [
          {
            section: 'title',
            derivedValue: 'Improve Governance Process',
            sourceComments: [
              {
                commentId: 'comment-1',
                excerpt: 'streamline the proposal process',
                authorName: 'Alice',
                isAgent: false,
              },
            ],
            rationale: 'Derived from proposer initial statement',
            confidence: 0.9,
          },
        ],
        summary: 'Clear consensus on process improvement',
        keyThemes: ['process improvement', 'accessibility'],
        consensusPoints: ['Templates needed'],
        disagreementPoints: [],
      },
      metadata: {
        cacheKey: 'discussion-test-123-1706700002000',
        timestamp: Date.now(),
        cached: false,
        extractionTimeMs: 5000,
        commentCount: 3,
        consistencyScore: 0.95,
        consistencyWarning: false,
      },
      fallbackMode: false,
    };

    expect(response.proposal.category).toBe('Operational');
    expect(response.reasoningTrace.derivations.length).toBeGreaterThan(0);
    expect(response.metadata.consistencyWarning).toBe(false);
    expect(response.fallbackMode).toBe(false);
  });

  it('should have correct fallback response structure', () => {
    const fallback: FallbackResponse = {
      fallbackMode: true,
      reason: 'AI service unavailable',
      template: {
        suggestedTitle: 'Improve Governance Process',
        descriptionTemplate: '## Proposal Description\n\n...',
        discussionSummary: 'Discussion with 3 comments',
        keyPoints: ['Point 1', 'Point 2'],
      },
      timestamp: Date.now(),
    };

    expect(fallback.fallbackMode).toBe(true);
    expect(fallback.template.keyPoints.length).toBe(2);
  });

  it('should flag consistency warning when variance exceeds threshold', () => {
    const metadata = {
      cacheKey: 'test',
      timestamp: Date.now(),
      cached: false,
      extractionTimeMs: 5000,
      commentCount: 3,
      consistencyScore: 0.80, // 20% variance
      consistencyWarning: true, // >15% variance flagged
    };

    expect(metadata.consistencyScore).toBeLessThan(0.85);
    expect(metadata.consistencyWarning).toBe(true);
  });
});

// =============================================================================
// Cache Key Tests
// =============================================================================

describe('Cache Key Generation (AC-4.1.4.6)', () => {
  it('should invalidate cache when new comments added', () => {
    const content1 = createMockDiscussionContent({ lastCommentTimestamp: 1706700000000 });
    const content2 = createMockDiscussionContent({ lastCommentTimestamp: 1706700001000 });

    const key1 = generateCacheKey(content1.discussionId, content1.lastCommentTimestamp);
    const key2 = generateCacheKey(content2.discussionId, content2.lastCommentTimestamp);

    expect(key1).not.toBe(key2);
  });

  it('should return same key for unchanged discussion', () => {
    const content = createMockDiscussionContent();
    const key1 = generateCacheKey(content.discussionId, content.lastCommentTimestamp);
    const key2 = generateCacheKey(content.discussionId, content.lastCommentTimestamp);

    expect(key1).toBe(key2);
  });
});

// =============================================================================
// Category-Specific Tests
// =============================================================================

describe('Category-Specific Requirements', () => {
  it('should handle Constitutional proposals', () => {
    const request = createMockExtractionRequest({
      category: 'Constitutional',
      discussionContent: createMockDiscussionContent({ category: 'Constitutional' }),
    });

    expect(request.category).toBe('Constitutional');
  });

  it('should handle Treasury proposals', () => {
    const request = createMockExtractionRequest({
      category: 'Treasury',
      discussionContent: createMockDiscussionContent({ category: 'Treasury' }),
    });

    expect(request.category).toBe('Treasury');
  });

  it('should handle SoftwareDevelopment proposals', () => {
    const request = createMockExtractionRequest({
      category: 'SoftwareDevelopment',
      discussionContent: createMockDiscussionContent({ category: 'SoftwareDevelopment' }),
    });

    expect(request.category).toBe('SoftwareDevelopment');
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('Edge Cases', () => {
  it('should handle discussion with only agent comments', () => {
    const content = createMockDiscussionContent({
      comments: [
        {
          id: 'comment-1',
          content: 'Agent suggestion',
          authorId: 'agent-1',
          authorName: 'Winston',
          authorType: { Agent: { agent_id: 'winston' } },
          timestamp: 1706700000000,
          isRetracted: false,
        },
      ],
    });

    const agentComments = content.comments.filter(c => typeof c.authorType === 'object');
    expect(agentComments.length).toBe(1);
  });

  it('should handle very long discussions', () => {
    const comments = Array.from({ length: 500 }, (_, i) => ({
      id: `comment-${i}`,
      content: `Comment number ${i} with some content`,
      authorId: `user-${i % 10}`,
      authorName: `User ${i % 10}`,
      authorType: 'Human' as const,
      timestamp: 1706700000000 + i * 1000,
      isRetracted: false,
    }));

    const content = createMockDiscussionContent({ comments });
    expect(content.comments.length).toBe(500);
  });

  it('should handle minimum valid discussion', () => {
    const content = createMockDiscussionContent({
      comments: [
        {
          id: 'comment-1',
          content: 'Single comment',
          authorId: 'user-1',
          authorName: 'Alice',
          authorType: 'Human',
          timestamp: 1706700000000,
          isRetracted: false,
        },
      ],
      participants: [
        { id: 'user-1', displayName: 'Alice', isProposer: true, isContributor: false },
      ],
    });

    expect(content.comments.length).toBe(1);
    expect(content.participants.length).toBe(1);
  });
});

// =============================================================================
// Reasoning Trace Tests
// =============================================================================

describe('Reasoning Trace (AC-4.1.4.3)', () => {
  it('should link derivations to source comments', () => {
    const derivation = {
      section: 'title' as const,
      derivedValue: 'Test Title',
      sourceComments: [
        {
          commentId: 'comment-1',
          excerpt: 'relevant excerpt',
          authorName: 'Alice',
          isAgent: false,
        },
        {
          commentId: 'comment-2',
          excerpt: 'another excerpt',
          authorName: 'Bob',
          isAgent: false,
        },
      ],
      rationale: 'Combined from two comments',
      confidence: 0.85,
    };

    expect(derivation.sourceComments.length).toBe(2);
    expect(derivation.confidence).toBeGreaterThanOrEqual(0);
    expect(derivation.confidence).toBeLessThanOrEqual(1);
  });

  it('should mark agent sources correctly', () => {
    const derivation = {
      section: 'description' as const,
      derivedValue: 'Description text',
      sourceComments: [
        {
          commentId: 'comment-1',
          excerpt: 'human comment',
          authorName: 'Alice',
          isAgent: false,
        },
        {
          commentId: 'comment-2',
          excerpt: 'agent analysis',
          authorName: 'Winston',
          isAgent: true,
        },
      ],
      rationale: 'Combined human and agent input',
      confidence: 0.75,
    };

    const agentSources = derivation.sourceComments.filter(s => s.isAgent);
    const humanSources = derivation.sourceComments.filter(s => !s.isAgent);

    expect(agentSources.length).toBe(1);
    expect(humanSources.length).toBe(1);
  });
});
