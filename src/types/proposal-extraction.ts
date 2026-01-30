/**
 * Proposal Extraction Types
 *
 * Story FOS-4.1.4: AI Proposal Extraction
 * Task 2: Define extraction input/output schemas
 *
 * @see AC-4.1.4.2 - Structured proposal matching governance canister format
 * @see AC-4.1.4.3 - Reasoning trace showing derivation
 */

// =============================================================================
// Governance Category Types (matching governance canister)
// =============================================================================

/**
 * Proposal categories matching governance canister ProposalCategory enum
 * @see governance/src/types.rs
 */
export type ProposalCategory =
  | 'Constitutional'
  | 'Operational'
  | 'Treasury'
  | 'SoftwareDevelopment';

/**
 * Valid voting period range (24-168 hours)
 */
export const VOTING_PERIOD_HOURS = {
  MIN: 24,
  MAX: 168,
  DEFAULT: 72,
} as const;

/**
 * Valid title length range
 */
export const TITLE_LENGTH = {
  MIN: 1,
  MAX: 200,
} as const;

// =============================================================================
// Input Types
// =============================================================================

/**
 * Author type for comments (human vs AI agent)
 * Matches foundery-os-core Discussion.AuthorType
 */
export type AuthorType = 'Human' | { Agent: { agent_id: string } };

/**
 * Discussion stage lifecycle
 */
export type DiscussionStage = 'Brainstorm' | 'Refining' | 'Ready';

/**
 * A comment in the discussion thread
 * @see AC-4.1.4.2 - Discussion content for extraction
 */
export interface DiscussionComment {
  /** Comment ID for source reference */
  id: string;
  /** Comment content */
  content: string;
  /** Author's principal ID */
  authorId: string;
  /** Author's display name */
  authorName: string;
  /** Whether author is human or AI agent */
  authorType: AuthorType;
  /** Timestamp when posted (Unix ms) */
  timestamp: number;
  /** Whether comment has been retracted */
  isRetracted: boolean;
}

/**
 * Participant in the discussion
 */
export interface DiscussionParticipant {
  /** User's principal ID */
  id: string;
  /** User's display name */
  displayName: string;
  /** Whether this is the proposer */
  isProposer: boolean;
  /** Whether this is a contributor */
  isContributor: boolean;
}

/**
 * Stage history entry
 */
export interface StageTransition {
  /** Stage transitioned to */
  stage: DiscussionStage;
  /** When the transition occurred */
  timestamp: number;
}

/**
 * Full discussion content for extraction
 * @see AC-4.1.4.2 - Input for extraction
 */
export interface DiscussionContent {
  /** Discussion thread ID */
  discussionId: string;
  /** Original proposal topic/title */
  topic: string;
  /** Current discussion stage */
  currentStage: DiscussionStage;
  /** Category of the proposal */
  category: ProposalCategory;
  /** All comments in chronological order */
  comments: DiscussionComment[];
  /** Current participants */
  participants: DiscussionParticipant[];
  /** Stage transition history */
  stageHistory: StageTransition[];
  /** Timestamp of last comment (for cache key) */
  lastCommentTimestamp: number;
}

/**
 * Request body for extraction endpoint
 */
export interface ExtractionRequest {
  /** Discussion ID */
  discussionId: string;
  /** Full discussion content */
  discussionContent: DiscussionContent;
  /** Target category for the proposal */
  category: ProposalCategory;
  /** What to extract (full proposal or specific sections) */
  extractionTarget: ExtractionTarget;
}

/**
 * What to extract from the discussion
 */
export type ExtractionTarget = 'full' | 'title' | 'description' | 'summary';

// =============================================================================
// Output Types - Extracted Proposal
// =============================================================================

/**
 * Extracted proposal matching governance canister CreateProposalArgs
 * @see AC-4.1.4.2 - Structured proposal format
 */
export interface ExtractedProposal {
  /** Proposal category */
  category: ProposalCategory;
  /** Proposal title (1-200 chars) */
  title: string;
  /** Proposal description (markdown supported) */
  description: string;
  /** Suggested voting period in hours (24-168) */
  votingPeriodHours: number;
  /** Optional execution data (for treasury/software proposals) */
  executionData?: string;
}

// =============================================================================
// Output Types - Reasoning Trace
// =============================================================================

/**
 * Source reference for a derivation
 */
export interface SourceReference {
  /** Comment ID this was derived from */
  commentId: string;
  /** Excerpt from the comment */
  excerpt: string;
  /** Author of the comment */
  authorName: string;
  /** Whether this is from an AI agent (weighted 0.5x) */
  isAgent: boolean;
}

/**
 * A single derivation in the reasoning trace
 * @see AC-4.1.4.3 - Link proposal sections to source comments
 */
export interface Derivation {
  /** Which section of the proposal this derives */
  section: 'title' | 'description' | 'category' | 'votingPeriod' | 'executionData';
  /** What was derived for this section */
  derivedValue: string;
  /** Source comments this was derived from */
  sourceComments: SourceReference[];
  /** Explanation of how/why this was derived */
  rationale: string;
  /** Confidence score (0-1) */
  confidence: number;
}

/**
 * Complete reasoning trace for the extraction
 * @see AC-4.1.4.3 - Reasoning trace showing derivation
 */
export interface ReasoningTrace {
  /** All derivations */
  derivations: Derivation[];
  /** Overall extraction summary */
  summary: string;
  /** Key themes identified in the discussion */
  keyThemes: string[];
  /** Points of consensus */
  consensusPoints: string[];
  /** Points of disagreement (if any) */
  disagreementPoints: string[];
}

// =============================================================================
// Output Types - Full Response
// =============================================================================

/**
 * Extraction metadata
 */
export interface ExtractionMetadata {
  /** Cache key for this extraction */
  cacheKey: string;
  /** When extraction was performed */
  timestamp: number;
  /** Whether this is a cached result */
  cached: boolean;
  /** Time to extract (ms) */
  extractionTimeMs: number;
  /** Number of comments analyzed */
  commentCount: number;
  /** Consistency score from multi-pass check (0-1) */
  consistencyScore: number;
  /** Whether consistency variance exceeded 15% threshold */
  consistencyWarning: boolean;
}

/**
 * Complete extraction response
 */
export interface ExtractionResponse {
  /** The extracted proposal */
  proposal: ExtractedProposal;
  /** Reasoning trace showing derivations */
  reasoningTrace: ReasoningTrace;
  /** Extraction metadata */
  metadata: ExtractionMetadata;
  /** Whether in fallback mode (AI unavailable) */
  fallbackMode: boolean;
}

// =============================================================================
// Fallback Mode Types
// =============================================================================

/**
 * Manual draft template when AI is unavailable
 * @see AC-4.1.4.7 - Fallback mode
 */
export interface ManualDraftTemplate {
  /** Pre-filled title from discussion topic */
  suggestedTitle: string;
  /** Placeholder description with instructions */
  descriptionTemplate: string;
  /** Discussion summary for reference */
  discussionSummary: string;
  /** Key points from discussion (if extractable without AI) */
  keyPoints: string[];
}

/**
 * Fallback response when AI service is unavailable
 */
export interface FallbackResponse {
  /** Flag indicating fallback mode */
  fallbackMode: true;
  /** Reason for fallback */
  reason: string;
  /** Manual draft template */
  template: ManualDraftTemplate;
  /** Timestamp */
  timestamp: number;
}

// =============================================================================
// Progress Events (for SSE streaming)
// =============================================================================

/**
 * Progress stage during extraction
 * @see AC-4.1.4.5 - Progress indicator
 */
export type ExtractionProgressStage =
  | 'analyzing'
  | 'synthesizing'
  | 'generating-trace'
  | 'consistency-check'
  | 'complete'
  | 'error';

/**
 * Progress event sent via SSE
 */
export interface ExtractionProgressEvent {
  /** Event type */
  type: 'progress' | 'result' | 'error';
  /** Current stage */
  stage: ExtractionProgressStage;
  /** Progress message */
  message: string;
  /** Progress percentage (0-100) */
  progress: number;
  /** Result data (only for type='result') */
  result?: ExtractionResponse | FallbackResponse;
  /** Error message (only for type='error') */
  error?: string;
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * Validate a proposal title length
 */
export function isValidTitle(title: string): boolean {
  return title.length >= TITLE_LENGTH.MIN && title.length <= TITLE_LENGTH.MAX;
}

/**
 * Validate voting period hours
 */
export function isValidVotingPeriod(hours: number): boolean {
  return hours >= VOTING_PERIOD_HOURS.MIN && hours <= VOTING_PERIOD_HOURS.MAX;
}

/**
 * Validate a proposal category
 */
export function isValidCategory(category: string): category is ProposalCategory {
  return ['Constitutional', 'Operational', 'Treasury', 'SoftwareDevelopment'].includes(
    category
  );
}

/**
 * Generate cache key for extraction
 * @see AC-4.1.4.6 - Cache key format
 */
export function generateCacheKey(discussionId: string, lastCommentTimestamp: number): string {
  return `discussion-${discussionId}-${lastCommentTimestamp}`;
}
