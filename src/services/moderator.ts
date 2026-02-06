/**
 * Moderator Service
 *
 * Provides moderator-specific functionality for party mode conversations:
 * - Introduction message generation
 * - Turn cycle summaries
 * - Directing conversation to specific agents
 *
 * @see Story FOS-3.4.8: Party Mode Orchestration
 */

import { PartySession, PartyParticipant, PartyMessage } from '../types/party-mode.js';
import { getAgentDefinition } from '../agents/registry.js';

/** Default moderator agent ID */
export const DEFAULT_MODERATOR_ID = 'aurora-forester';

/**
 * Check if a session has a moderator
 */
export function hasModerator(session: PartySession): boolean {
  return session.config.moderatorId !== null &&
    session.participants.some(p => p.isModerator);
}

/**
 * Get the moderator participant from a session
 */
export function getModerator(session: PartySession): PartyParticipant | undefined {
  return session.participants.find(p => p.isModerator);
}

/**
 * Generate the moderator's introduction message context
 *
 * This creates a prompt for the moderator agent to introduce
 * the discussion and set context.
 */
export function generateModeratorIntroPrompt(session: PartySession): string {
  const participantNames = session.participants
    .filter(p => !p.isModerator)
    .map(p => `${p.name} (${p.icon})`)
    .join(', ');

  return `You are moderating a group discussion on the topic: "${session.topic}"

The participants in this discussion are: ${participantNames}

As the moderator, please:
1. Introduce the topic in an engaging way
2. Briefly mention each participant and what unique perspective they might bring
3. Set the ground rules for a productive discussion
4. Ask an opening question to get the conversation started

Keep your introduction concise but welcoming. You will summarize at the end of each discussion round.`;
}

/**
 * Generate the moderator's turn cycle summary prompt
 *
 * This creates a prompt for the moderator to summarize
 * what was discussed in the current turn cycle.
 */
export function generateModeratorSummaryPrompt(
  session: PartySession,
  turnMessages: PartyMessage[]
): string {
  const turnContent = turnMessages
    .filter(m => m.role === 'assistant' && m.agentId && !m.metadata?.isModeratorSummary)
    .map(m => {
      const participant = session.participants.find(p => p.agentId === m.agentId);
      return `${participant?.name || m.agentId}: ${m.content}`;
    })
    .join('\n\n');

  return `The participants have shared their thoughts. Here's what was said:

${turnContent}

As the moderator, please:
1. Summarize the key points made by each participant
2. Highlight any areas of agreement or disagreement
3. Identify interesting connections between different perspectives
4. Suggest a direction for the next round of discussion OR ask a follow-up question

Keep your summary concise but comprehensive.`;
}

/**
 * Generate a prompt for the moderator to direct conversation to a specific agent
 */
export function generateDirectionPrompt(
  session: PartySession,
  targetAgentId: string,
  context?: string
): string {
  const targetParticipant = session.participants.find(p => p.agentId === targetAgentId);
  const targetAgent = getAgentDefinition(targetAgentId);

  if (!targetParticipant || !targetAgent) {
    return `Please continue the discussion on "${session.topic}".`;
  }

  const capabilitiesContext = targetAgent.capabilities.slice(0, 3).join(', ');

  return `As the moderator, please direct the next part of the conversation to @${targetAgentId} (${targetParticipant.name}).

${context ? `Context for this direction: ${context}` : ''}

${targetParticipant.name}'s expertise includes: ${capabilitiesContext}

Ask them a specific question or invite them to share their perspective on an aspect of "${session.topic}" that relates to their expertise.`;
}

/**
 * Get messages from the current turn cycle
 */
export function getCurrentTurnMessages(session: PartySession): PartyMessage[] {
  const currentTurn = session.currentTurn;
  return session.history.filter(m => m.turnNumber === currentTurn);
}

/**
 * Check if it's time for a moderator summary
 *
 * Returns true after all non-moderator participants have spoken in the current turn
 */
export function shouldModeratorSummarize(session: PartySession): boolean {
  if (!hasModerator(session)) {
    return false;
  }

  const currentTurnMessages = getCurrentTurnMessages(session);
  const nonModeratorParticipants = session.participants.filter(p => !p.isModerator);

  // Check if all non-moderator participants have spoken this turn
  const speakersThisTurn = new Set(
    currentTurnMessages
      .filter(m => m.role === 'assistant' && m.agentId)
      .map(m => m.agentId)
  );

  for (const participant of nonModeratorParticipants) {
    if (!speakersThisTurn.has(participant.agentId)) {
      return false;
    }
  }

  // Check if moderator hasn't already summarized this turn
  const moderatorSummarizedThisTurn = currentTurnMessages.some(
    m => m.metadata?.isModeratorSummary
  );

  return !moderatorSummarizedThisTurn;
}

/**
 * Check if the moderator should speak first (intro)
 */
export function shouldModeratorIntro(session: PartySession): boolean {
  if (!hasModerator(session)) {
    return false;
  }

  // Moderator should intro if history is empty or only has system/user messages
  const hasModeratorSpoken = session.history.some(
    m => m.role === 'assistant' && m.agentId === session.config.moderatorId
  );

  return !hasModeratorSpoken;
}
