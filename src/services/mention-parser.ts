/**
 * Mention Parser Utility
 *
 * Parses @agentId mentions in messages and provides handoff logic
 * for routing control to mentioned agents.
 *
 * @see Story FOS-3.4.8: Party Mode Orchestration
 */

import { isAgentRegistered, getAllAgentIds } from '../agents/registry.js';
import type { PartyMessageMetadata } from '../types/party-mode.js';

/**
 * Regular expression to detect @mentions
 * Matches @agent-id patterns (alphanumeric with hyphens)
 */
const MENTION_REGEX = /@([a-zA-Z][a-zA-Z0-9-]*)/g;

/**
 * Result of parsing a message for mentions
 */
export interface MentionParseResult {
  /** Agent IDs that were mentioned and are valid */
  validMentions: string[];
  /** Mentioned strings that don't match registered agents */
  invalidMentions: string[];
  /** Whether any valid mentions were found */
  hasMentions: boolean;
  /** The first valid mention (for handoff targeting) */
  primaryMention: string | null;
}

/**
 * Parse a message for @agent mentions
 *
 * @param message - Message text to parse
 * @returns Parse result with valid and invalid mentions
 */
export function parseMentions(message: string): MentionParseResult {
  const validMentions: string[] = [];
  const invalidMentions: string[] = [];
  let match: RegExpExecArray | null;

  // Reset regex state
  MENTION_REGEX.lastIndex = 0;

  while ((match = MENTION_REGEX.exec(message)) !== null) {
    const mentionedId = match[1].toLowerCase();

    if (isAgentRegistered(mentionedId)) {
      // Avoid duplicates
      if (!validMentions.includes(mentionedId)) {
        validMentions.push(mentionedId);
      }
    } else {
      if (!invalidMentions.includes(mentionedId)) {
        invalidMentions.push(mentionedId);
      }
    }
  }

  return {
    validMentions,
    invalidMentions,
    hasMentions: validMentions.length > 0,
    primaryMention: validMentions.length > 0 ? validMentions[0] : null,
  };
}

/**
 * Determine the next speaker based on mentions
 *
 * If the message contains @mentions, the first mentioned agent
 * should speak next (handoff behavior).
 *
 * @param message - Message to check for mentions
 * @param currentParticipants - IDs of agents in the conversation
 * @param defaultNext - Default next speaker if no mention handoff
 * @returns Agent ID that should speak next
 */
export function getHandoffTarget(
  message: string,
  currentParticipants: string[],
  defaultNext: string
): string {
  const parseResult = parseMentions(message);

  if (!parseResult.hasMentions) {
    return defaultNext;
  }

  // Find the first mentioned agent that is a participant
  for (const mention of parseResult.validMentions) {
    if (currentParticipants.includes(mention)) {
      return mention;
    }
  }

  // Mentioned agent not in conversation, fall back to default
  return defaultNext;
}

/**
 * Create message metadata with mention information
 *
 * @param message - Message to analyze
 * @returns Metadata object with mentions, or undefined if no mentions
 */
export function createMentionMetadata(message: string): PartyMessageMetadata | undefined {
  const parseResult = parseMentions(message);

  if (!parseResult.hasMentions) {
    return undefined;
  }

  return {
    mentions: parseResult.validMentions,
  };
}

/**
 * Format a message with mentions highlighted (for display)
 *
 * @param message - Original message
 * @returns Message with mentions in a highlighted format
 */
export function highlightMentions(message: string): string {
  return message.replace(MENTION_REGEX, '**@$1**');
}

/**
 * Get autocomplete suggestions for a partial mention
 *
 * @param partial - Partial agent ID (without @)
 * @param limit - Maximum suggestions to return
 * @returns Array of matching agent IDs
 */
export function getAgentSuggestions(partial: string, limit: number = 5): string[] {
  const allAgents = getAllAgentIds();
  const lowerPartial = partial.toLowerCase();

  const matches = allAgents.filter(id =>
    id.toLowerCase().startsWith(lowerPartial)
  );

  return matches.slice(0, limit);
}

/**
 * Check if a string contains any @mentions
 *
 * @param text - Text to check
 * @returns True if text contains at least one @mention pattern
 */
export function hasMentions(text: string): boolean {
  MENTION_REGEX.lastIndex = 0;
  return MENTION_REGEX.test(text);
}
