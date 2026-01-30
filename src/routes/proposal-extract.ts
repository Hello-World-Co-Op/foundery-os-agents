/**
 * Proposal Extraction Route
 *
 * Story FOS-4.1.4: AI Proposal Extraction
 * Task 1: Create `/api/proposal-extract` route
 *
 * @see AC-4.1.4.1 - Manual extraction trigger
 * @see AC-4.1.4.2 - Structured proposal output
 * @see AC-4.1.4.5 - Progress indicator via SSE
 * @see AC-4.1.4.6 - Caching with invalidation
 * @see AC-4.1.4.7 - Fallback mode
 */

import { Router, Request, Response } from 'express';
import { agentService, type AgentInvocation } from '../services/agent-service.js';
import {
  requireSession,
  type AuthenticatedRequest,
} from '../middleware/session-auth.js';
import {
  type ExtractionRequest,
  type ExtractionResponse,
  type FallbackResponse,
  type ExtractionProgressEvent,
  type ExtractedProposal,
  type ReasoningTrace,
  type ManualDraftTemplate,
  type ExtractionMetadata,
  type DiscussionContent,
  type ProposalCategory,
  generateCacheKey,
  isValidCategory,
  isValidTitle,
  isValidVotingPeriod,
  VOTING_PERIOD_HOURS,
} from '../types/proposal-extraction.js';

export const proposalExtractRouter = Router();

// =============================================================================
// Cache Implementation (AC-4.1.4.6)
// =============================================================================

interface CacheEntry {
  response: ExtractionResponse;
  timestamp: number;
  cacheKey: string;
}

/** In-memory cache with 15-minute TTL */
const extractionCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

/**
 * Get cached extraction if valid
 */
function getCachedExtraction(cacheKey: string): ExtractionResponse | null {
  const entry = extractionCache.get(cacheKey);
  if (!entry) return null;

  const age = Date.now() - entry.timestamp;
  if (age > CACHE_TTL_MS) {
    extractionCache.delete(cacheKey);
    return null;
  }

  return {
    ...entry.response,
    metadata: {
      ...entry.response.metadata,
      cached: true,
    },
  };
}

/**
 * Store extraction in cache
 */
function cacheExtraction(cacheKey: string, response: ExtractionResponse): void {
  extractionCache.set(cacheKey, {
    response,
    timestamp: Date.now(),
    cacheKey,
  });
}

/**
 * Clear expired cache entries (called periodically)
 */
function cleanupCache(): void {
  const now = Date.now();
  for (const [key, entry] of extractionCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      extractionCache.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupCache, 5 * 60 * 1000);

// =============================================================================
// Timeout Configuration (AC-4.1.4.5)
// =============================================================================

/** Maximum extraction time before timeout (60 seconds per AC) */
const EXTRACTION_TIMEOUT_MS = 60 * 1000;

/** Maximum time for a single AI invocation (15 seconds) */
const SINGLE_INVOCATION_TIMEOUT_MS = 15 * 1000;

/**
 * Promise with timeout wrapper
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

// =============================================================================
// Rate Limiting (Security)
// =============================================================================

/** Rate limit: max extractions per discussion per time window */
const RATE_LIMIT_MAX_EXTRACTIONS = 3;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

/** In-memory rate limit tracking: userId:discussionId -> entry */
const rateLimitMap = new Map<string, RateLimitEntry>();

/**
 * Check and update rate limit for extraction
 * @returns true if within limits, false if rate limited
 */
function checkRateLimit(userId: string, discussionId: string): boolean {
  const key = `${userId}:${discussionId}`;
  const now = Date.now();
  const entry = rateLimitMap.get(key);

  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    // New window
    rateLimitMap.set(key, { count: 1, windowStart: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX_EXTRACTIONS) {
    return false;
  }

  entry.count++;
  return true;
}

/**
 * Clean up expired rate limit entries (called periodically)
 */
function cleanupRateLimits(): void {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap.entries()) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
      rateLimitMap.delete(key);
    }
  }
}

// Run rate limit cleanup every 5 minutes
setInterval(cleanupRateLimits, 5 * 60 * 1000);

// =============================================================================
// Request Validation
// =============================================================================

/**
 * Validate extraction request body
 */
function validateRequest(body: unknown): { valid: true; request: ExtractionRequest } | { valid: false; error: string } {
  if (!body || typeof body !== 'object') {
    return { valid: false, error: 'Request body is required' };
  }

  const req = body as Partial<ExtractionRequest>;

  if (!req.discussionId || typeof req.discussionId !== 'string') {
    return { valid: false, error: 'discussionId is required' };
  }

  if (!req.discussionContent || typeof req.discussionContent !== 'object') {
    return { valid: false, error: 'discussionContent is required' };
  }

  if (!req.category || !isValidCategory(req.category)) {
    return { valid: false, error: 'Invalid category. Must be Constitutional, Operational, Treasury, or SoftwareDevelopment' };
  }

  if (!req.extractionTarget || !['full', 'title', 'description', 'summary'].includes(req.extractionTarget)) {
    return { valid: false, error: 'Invalid extractionTarget. Must be full, title, description, or summary' };
  }

  const content = req.discussionContent as Partial<DiscussionContent>;
  if (!content.comments || !Array.isArray(content.comments)) {
    return { valid: false, error: 'discussionContent.comments is required' };
  }

  if (content.comments.length === 0) {
    return { valid: false, error: 'Discussion has no comments. Cannot extract proposal from empty discussion.' };
  }

  return { valid: true, request: req as ExtractionRequest };
}

// =============================================================================
// Context Building (Task 4)
// =============================================================================

/**
 * Build context for the extraction agent
 * @see AC-4.1.4.2, AC-4.1.4.3 - Context injection
 */
function buildExtractionContext(request: ExtractionRequest): Record<string, unknown> {
  const { discussionContent, category, extractionTarget } = request;

  // Sort comments chronologically
  const sortedComments = [...discussionContent.comments]
    .filter(c => !c.isRetracted)
    .sort((a, b) => a.timestamp - b.timestamp);

  // Build participant summary
  const proposer = discussionContent.participants.find(p => p.isProposer);
  const contributors = discussionContent.participants.filter(p => p.isContributor && !p.isProposer);

  // Category-specific guidance
  const categoryGuidance = getCategoryGuidance(category);

  return {
    discussion: {
      id: discussionContent.discussionId,
      topic: discussionContent.topic,
      currentStage: discussionContent.currentStage,
      commentCount: sortedComments.length,
      participantCount: discussionContent.participants.length,
    },
    comments: sortedComments.map(c => ({
      id: c.id,
      content: c.content,
      authorName: c.authorName,
      authorType: c.authorType,
      timestamp: c.timestamp,
      isAgent: typeof c.authorType === 'object' && 'Agent' in c.authorType,
    })),
    participants: {
      proposer: proposer ? { name: proposer.displayName, id: proposer.id } : null,
      contributors: contributors.map(c => ({ name: c.displayName, id: c.id })),
    },
    stageHistory: discussionContent.stageHistory,
    category,
    categoryGuidance,
    extractionTarget,
    instructions: `Extract a ${extractionTarget === 'full' ? 'complete proposal' : extractionTarget} from this governance discussion. Follow the category-specific guidelines for ${category} proposals.`,
  };
}

/**
 * Get category-specific guidance
 */
function getCategoryGuidance(category: ProposalCategory): Record<string, unknown> {
  const guidelines: Record<ProposalCategory, Record<string, unknown>> = {
    Constitutional: {
      consensusThreshold: 0.8,
      suggestedVotingPeriod: 120,
      focus: 'fundamental governance changes',
      requirements: ['Strong consensus required', 'Long-term implications must be considered'],
    },
    Operational: {
      consensusThreshold: 0.6,
      suggestedVotingPeriod: 72,
      focus: 'day-to-day operations',
      requirements: ['Implementation details needed', 'Resource implications should be clear'],
    },
    Treasury: {
      consensusThreshold: 0.7,
      suggestedVotingPeriod: 72,
      focus: 'financial decisions',
      requirements: ['Specific amounts required', 'Recipients must be identified', 'Budget justification needed'],
    },
    SoftwareDevelopment: {
      consensusThreshold: 0.6,
      suggestedVotingPeriod: 48,
      focus: 'technical changes',
      requirements: ['Technical specifications needed', 'Testing plan recommended', 'Rollback strategy helpful'],
    },
  };

  return guidelines[category];
}

// =============================================================================
// AI Extraction (Task 5, Task 7)
// =============================================================================

/**
 * Perform AI extraction with multi-pass consistency check
 * @see AC-4.1.4.2 - Structured extraction
 * @see AC-4.1.4.7 - Multi-pass consistency
 */
async function performExtraction(
  request: ExtractionRequest,
  userId: string,
  sendProgress: (event: ExtractionProgressEvent) => void
): Promise<ExtractionResponse | FallbackResponse> {
  const startTime = Date.now();
  const context = buildExtractionContext(request);

  // Progress: Analyzing
  sendProgress({
    type: 'progress',
    stage: 'analyzing',
    message: 'Analyzing discussion content...',
    progress: 10,
  });

  try {
    // Multi-pass extraction for consistency check (Task 7)
    const extractionResults: Array<{ proposal: ExtractedProposal; trace: ReasoningTrace }> = [];
    const passCount = 3;

    for (let pass = 0; pass < passCount; pass++) {
      // Progress: Synthesizing
      sendProgress({
        type: 'progress',
        stage: 'synthesizing',
        message: `Synthesizing proposal (pass ${pass + 1}/${passCount})...`,
        progress: 20 + (pass * 20),
      });

      const invocation: AgentInvocation = {
        agentId: 'proposal-extractor',
        userId,
        message: `Extract a governance proposal from the following discussion. Return valid JSON only.`,
        context,
      };

      const response = await withTimeout(
        agentService.invoke(invocation),
        SINGLE_INVOCATION_TIMEOUT_MS,
        `AI extraction pass ${pass + 1}`
      );

      // Parse the JSON response
      const parsed = parseExtractionResponse(response.message);
      if (parsed) {
        extractionResults.push(parsed);
      }
    }

    if (extractionResults.length === 0) {
      // All passes failed - return fallback
      return createFallbackResponse(request, 'AI extraction failed - could not parse response');
    }

    // Progress: Generating trace
    sendProgress({
      type: 'progress',
      stage: 'generating-trace',
      message: 'Generating reasoning trace...',
      progress: 70,
    });

    // Progress: Consistency check
    sendProgress({
      type: 'progress',
      stage: 'consistency-check',
      message: 'Verifying extraction consistency...',
      progress: 85,
    });

    // Calculate consistency score (Task 7)
    const consistencyResult = calculateConsistency(extractionResults);

    // Use the first successful result (or most consistent)
    const bestResult = extractionResults[0];
    const extractionTimeMs = Date.now() - startTime;

    const response: ExtractionResponse = {
      proposal: bestResult.proposal,
      reasoningTrace: bestResult.trace,
      metadata: {
        cacheKey: generateCacheKey(request.discussionId, request.discussionContent.lastCommentTimestamp),
        timestamp: Date.now(),
        cached: false,
        extractionTimeMs,
        commentCount: request.discussionContent.comments.length,
        consistencyScore: consistencyResult.score,
        consistencyWarning: consistencyResult.warning,
      },
      fallbackMode: false,
    };

    // Progress: Complete
    sendProgress({
      type: 'progress',
      stage: 'complete',
      message: 'Extraction complete',
      progress: 100,
    });

    return response;

  } catch (error) {
    console.error('[proposal-extract] Extraction error:', error);
    return createFallbackResponse(
      request,
      error instanceof Error ? error.message : 'Unknown error during extraction'
    );
  }
}

/**
 * Parse AI response into structured format
 */
function parseExtractionResponse(response: string): { proposal: ExtractedProposal; trace: ReasoningTrace } | null {
  try {
    // Try to extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate proposal structure
    if (!parsed.proposal || !parsed.reasoningTrace) {
      return null;
    }

    const proposal: ExtractedProposal = {
      category: parsed.proposal.category,
      title: String(parsed.proposal.title || '').slice(0, 200),
      description: String(parsed.proposal.description || ''),
      votingPeriodHours: Math.min(
        Math.max(Number(parsed.proposal.votingPeriodHours) || VOTING_PERIOD_HOURS.DEFAULT, VOTING_PERIOD_HOURS.MIN),
        VOTING_PERIOD_HOURS.MAX
      ),
      executionData: parsed.proposal.executionData,
    };

    const trace: ReasoningTrace = {
      derivations: parsed.reasoningTrace.derivations || [],
      summary: parsed.reasoningTrace.summary || '',
      keyThemes: parsed.reasoningTrace.keyThemes || [],
      consensusPoints: parsed.reasoningTrace.consensusPoints || [],
      disagreementPoints: parsed.reasoningTrace.disagreementPoints || [],
    };

    return { proposal, trace };

  } catch (error) {
    console.error('[proposal-extract] Failed to parse response:', error);
    return null;
  }
}

/**
 * Calculate consistency across multiple extraction passes
 * @see AC-4.1.4.2 - Multi-pass consistency check (>15% variance flagged)
 */
function calculateConsistency(
  results: Array<{ proposal: ExtractedProposal; trace: ReasoningTrace }>
): { score: number; warning: boolean } {
  if (results.length < 2) {
    return { score: 1.0, warning: false };
  }

  // Compare key fields across results
  let matchCount = 0;
  let totalComparisons = 0;

  for (let i = 0; i < results.length - 1; i++) {
    for (let j = i + 1; j < results.length; j++) {
      const a = results[i].proposal;
      const b = results[j].proposal;

      // Compare category
      totalComparisons++;
      if (a.category === b.category) matchCount++;

      // Compare title similarity (Jaccard-like)
      totalComparisons++;
      const titleSim = calculateStringSimilarity(a.title, b.title);
      if (titleSim > 0.7) matchCount++;

      // Compare voting period
      totalComparisons++;
      if (Math.abs(a.votingPeriodHours - b.votingPeriodHours) <= 24) matchCount++;
    }
  }

  const score = totalComparisons > 0 ? matchCount / totalComparisons : 1.0;
  const warning = score < 0.85; // >15% variance

  return { score, warning };
}

/**
 * Simple string similarity (word overlap)
 */
function calculateStringSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));

  if (wordsA.size === 0 && wordsB.size === 0) return 1.0;
  if (wordsA.size === 0 || wordsB.size === 0) return 0.0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  return intersection / Math.max(wordsA.size, wordsB.size);
}

// =============================================================================
// Fallback Mode (Task 8)
// =============================================================================

/**
 * Create fallback response when AI is unavailable
 * @see AC-4.1.4.7 - Manual draft mode
 */
function createFallbackResponse(request: ExtractionRequest, reason: string): FallbackResponse {
  const { discussionContent, category } = request;

  // Extract key points from comments (simple extraction without AI)
  const keyPoints = extractKeyPointsSimple(discussionContent);

  const template: ManualDraftTemplate = {
    suggestedTitle: discussionContent.topic || 'Untitled Proposal',
    descriptionTemplate: `## Proposal Description

[Please write your proposal description here]

## Background

This proposal emerged from a discussion with ${discussionContent.participants.length} participants and ${discussionContent.comments.length} comments.

## Key Points from Discussion

${keyPoints.map(p => `- ${p}`).join('\n')}

## Proposed Action

[Describe what action should be taken]

## Expected Outcome

[Describe the expected outcome if this proposal passes]
`,
    discussionSummary: `Discussion "${discussionContent.topic}" with ${discussionContent.comments.length} comments across ${discussionContent.participants.length} participants.`,
    keyPoints,
  };

  return {
    fallbackMode: true,
    reason,
    template,
    timestamp: Date.now(),
  };
}

/**
 * Extract key points without AI (simple heuristics)
 */
function extractKeyPointsSimple(content: DiscussionContent): string[] {
  const keyPoints: string[] = [];
  const seen = new Set<string>();

  // Look for comments that seem important (longer, from proposer, etc.)
  const sortedComments = [...content.comments]
    .filter(c => !c.isRetracted)
    .sort((a, b) => b.content.length - a.content.length);

  for (const comment of sortedComments.slice(0, 5)) {
    // Extract first sentence as a key point
    const firstSentence = comment.content.split(/[.!?]/)[0]?.trim();
    if (firstSentence && firstSentence.length > 20 && firstSentence.length < 200) {
      const normalized = firstSentence.toLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        keyPoints.push(firstSentence);
      }
    }
  }

  return keyPoints.slice(0, 5);
}

// =============================================================================
// Route Handlers
// =============================================================================

/**
 * POST /api/proposal-extract
 * Extract proposal from discussion (non-streaming)
 *
 * @requires Valid session token
 * @see AC-4.1.4.1 - Manual extraction trigger
 */
proposalExtractRouter.post('/', requireSession, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const validation = validateRequest(req.body);

    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const request = validation.request;

    // Check rate limit (Security)
    if (!checkRateLimit(userId, request.discussionId)) {
      res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Maximum ${RATE_LIMIT_MAX_EXTRACTIONS} extractions per discussion per ${RATE_LIMIT_WINDOW_MS / 60000} minutes`,
      });
      return;
    }

    // Check cache (AC-4.1.4.6)
    const cacheKey = generateCacheKey(
      request.discussionId,
      request.discussionContent.lastCommentTimestamp
    );
    const cached = getCachedExtraction(cacheKey);

    if (cached) {
      res.json(cached);
      return;
    }

    // Perform extraction
    const result = await performExtraction(request, userId, () => {
      // No-op progress handler for non-streaming
    });

    // Cache successful extraction
    if (!('fallbackMode' in result) || !result.fallbackMode) {
      cacheExtraction(cacheKey, result as ExtractionResponse);
    }

    res.json(result);

  } catch (error) {
    console.error('[proposal-extract] Route error:', error);
    res.status(500).json({
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /api/proposal-extract/stream
 * Extract proposal with SSE progress updates
 *
 * @requires Valid session token
 * @see AC-4.1.4.5 - Progress indicator via SSE
 */
proposalExtractRouter.post('/stream', requireSession, async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthenticatedRequest).userId;
    const validation = validateRequest(req.body);

    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const request = validation.request;

    // Check rate limit (Security)
    if (!checkRateLimit(userId, request.discussionId)) {
      res.status(429).json({
        error: 'Rate limit exceeded',
        message: `Maximum ${RATE_LIMIT_MAX_EXTRACTIONS} extractions per discussion per ${RATE_LIMIT_WINDOW_MS / 60000} minutes`,
      });
      return;
    }

    // Set up SSE headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Check cache (AC-4.1.4.6)
    const cacheKey = generateCacheKey(
      request.discussionId,
      request.discussionContent.lastCommentTimestamp
    );
    const cached = getCachedExtraction(cacheKey);

    if (cached) {
      const event: ExtractionProgressEvent = {
        type: 'result',
        stage: 'complete',
        message: 'Cached result',
        progress: 100,
        result: cached,
      };
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      res.end();
      return;
    }

    // Progress callback for SSE
    const sendProgress = (event: ExtractionProgressEvent) => {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    };

    // Perform extraction with progress updates
    const result = await performExtraction(request, userId, sendProgress);

    // Cache successful extraction
    if (!('fallbackMode' in result) || !result.fallbackMode) {
      cacheExtraction(cacheKey, result as ExtractionResponse);
    }

    // Send final result
    const finalEvent: ExtractionProgressEvent = {
      type: 'result',
      stage: 'complete',
      message: 'Extraction complete',
      progress: 100,
      result,
    };
    res.write(`data: ${JSON.stringify(finalEvent)}\n\n`);
    res.end();

  } catch (error) {
    console.error('[proposal-extract] Stream error:', error);

    const errorEvent: ExtractionProgressEvent = {
      type: 'error',
      stage: 'error',
      message: 'Extraction failed',
      progress: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
    res.write(`data: ${JSON.stringify(errorEvent)}\n\n`);
    res.end();
  }
});

/**
 * DELETE /api/proposal-extract/cache/:discussionId
 * Invalidate cache for a discussion (for testing)
 *
 * @requires Valid session token
 */
proposalExtractRouter.delete('/cache/:discussionId', requireSession, async (req: Request, res: Response) => {
  const { discussionId } = req.params;

  // Find and remove all cache entries for this discussion
  let removed = 0;
  for (const [key] of extractionCache.entries()) {
    if (key.startsWith(`discussion-${discussionId}-`)) {
      extractionCache.delete(key);
      removed++;
    }
  }

  res.json({ success: true, removed });
});
