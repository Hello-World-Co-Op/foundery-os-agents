/**
 * Turn Ordering Service
 *
 * Strategy pattern implementation for different turn ordering modes
 * in party mode conversations.
 *
 * @see Story FOS-3.4.8: Party Mode Orchestration
 */

import { TurnOrderingMode, PartySession, PartyParticipant } from '../types/party-mode.js';
import { parseMentions } from './mention-parser.js';

/**
 * Interface for turn ordering strategies
 */
export interface TurnOrderingStrategy {
  /**
   * Get the next speaker in the conversation
   *
   * @param session - Current session state
   * @param lastMessage - The last message content (for relevance/mention detection)
   * @returns Agent ID of next speaker
   */
  getNextSpeaker(session: PartySession, lastMessage?: string): string;

  /**
   * Get the order of speakers for a full round
   *
   * @param session - Current session state
   * @param lastMessage - The last message content
   * @returns Ordered array of agent IDs for the round
   */
  getSpeakersForRound(session: PartySession, lastMessage?: string): string[];
}

/**
 * Round-robin strategy: Agents speak in sequential order
 */
export class RoundRobinStrategy implements TurnOrderingStrategy {
  getNextSpeaker(session: PartySession): string {
    const nonModeratorParticipants = session.participants.filter(p => !p.isModerator);
    const nextIndex = session.currentSpeakerIndex % nonModeratorParticipants.length;
    return nonModeratorParticipants[nextIndex].agentId;
  }

  getSpeakersForRound(session: PartySession): string[] {
    // In round-robin, everyone speaks in order
    return session.participants
      .filter(p => !p.isModerator)
      .map(p => p.agentId);
  }
}

/**
 * Dynamic strategy: Agents speak based on relevance scoring
 *
 * Uses a simple heuristic based on:
 * - Recent mentions of the agent
 * - Agent's capability match to topic keywords
 * - Turn count (less turns = higher priority)
 */
export class DynamicStrategy implements TurnOrderingStrategy {
  getNextSpeaker(session: PartySession, lastMessage?: string): string {
    const nonModeratorParticipants = session.participants.filter(p => !p.isModerator);

    if (!lastMessage) {
      // No context, use least-spoken agent
      return this.getLeastSpokenAgent(nonModeratorParticipants);
    }

    // Check for @mentions first - they get priority
    const mentionResult = parseMentions(lastMessage);
    if (mentionResult.hasMentions) {
      const mentionedParticipant = nonModeratorParticipants.find(
        p => mentionResult.validMentions.includes(p.agentId)
      );
      if (mentionedParticipant) {
        return mentionedParticipant.agentId;
      }
    }

    // Score each participant
    const scored = nonModeratorParticipants.map(p => ({
      participant: p,
      score: this.calculateRelevanceScore(p, lastMessage, session),
    }));

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    return scored[0].participant.agentId;
  }

  getSpeakersForRound(session: PartySession, lastMessage?: string): string[] {
    const nonModeratorParticipants = session.participants.filter(p => !p.isModerator);

    // Score and sort all participants
    const scored = nonModeratorParticipants.map(p => ({
      participant: p,
      score: this.calculateRelevanceScore(p, lastMessage || '', session),
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored.map(s => s.participant.agentId);
  }

  private getLeastSpokenAgent(participants: PartyParticipant[]): string {
    let minTurns = Infinity;
    let leastSpoken = participants[0];

    for (const p of participants) {
      if (p.turnCount < minTurns) {
        minTurns = p.turnCount;
        leastSpoken = p;
      }
    }

    return leastSpoken.agentId;
  }

  private calculateRelevanceScore(
    participant: PartyParticipant,
    message: string,
    session: PartySession
  ): number {
    let score = 0;

    // Bias toward less-spoken agents (fairness)
    const maxTurns = Math.max(...session.participants.map(p => p.turnCount), 1);
    score += (maxTurns - participant.turnCount) * 10;

    // Check if agent name is mentioned in message (not @mention)
    if (message.toLowerCase().includes(participant.name.toLowerCase())) {
      score += 50;
    }

    // Small random factor to avoid predictability
    score += Math.random() * 5;

    return score;
  }
}

/**
 * Moderator-directed strategy: Moderator chooses who speaks
 *
 * This strategy relies on the moderator's message containing @mentions
 * to direct conversation. Falls back to round-robin if no direction given.
 */
export class ModeratorDirectedStrategy implements TurnOrderingStrategy {
  private roundRobinFallback = new RoundRobinStrategy();

  getNextSpeaker(session: PartySession, lastMessage?: string): string {
    if (!lastMessage) {
      return this.roundRobinFallback.getNextSpeaker(session);
    }

    // Parse moderator's message for @mentions
    const mentionResult = parseMentions(lastMessage);

    if (mentionResult.hasMentions) {
      // Find first mentioned agent that's a participant
      const nonModeratorParticipants = session.participants.filter(p => !p.isModerator);
      for (const mention of mentionResult.validMentions) {
        const participant = nonModeratorParticipants.find(p => p.agentId === mention);
        if (participant) {
          return participant.agentId;
        }
      }
    }

    // No valid direction, fall back to round-robin
    return this.roundRobinFallback.getNextSpeaker(session);
  }

  getSpeakersForRound(session: PartySession, lastMessage?: string): string[] {
    // In moderator-directed mode, we don't predetermine the order
    // Each speaker is chosen one at a time based on moderator's direction
    // Return all participants as potential speakers
    return session.participants
      .filter(p => !p.isModerator)
      .map(p => p.agentId);
  }
}

/**
 * Factory function to get the appropriate strategy
 *
 * @param mode - Turn ordering mode
 * @returns Strategy instance for the mode
 */
export function getTurnOrderingStrategy(mode: TurnOrderingMode): TurnOrderingStrategy {
  switch (mode) {
    case TurnOrderingMode.ROUND_ROBIN:
      return new RoundRobinStrategy();
    case TurnOrderingMode.DYNAMIC:
      return new DynamicStrategy();
    case TurnOrderingMode.MODERATOR_DIRECTED:
      return new ModeratorDirectedStrategy();
    default:
      return new RoundRobinStrategy();
  }
}
