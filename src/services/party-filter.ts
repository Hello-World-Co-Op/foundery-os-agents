/**
 * Party Mode Category Filtering Service
 *
 * Provides functions for filtering agents by category and grouping
 * agents for party mode selection UI.
 *
 * @see Story FOS-3.4.8: Party Mode Orchestration
 */

import {
  AgentCategory,
  AgentDefinition,
  getAllAgents,
  getAgentsByCategory,
} from '../agents/registry.js';
import type { ListPartyAgentsResponse } from '../types/party-mode.js';

/**
 * Get agents filtered by one or more categories
 *
 * @param categories - Categories to filter by (empty = all agents)
 * @returns Array of agent definitions matching the categories
 */
export function getAgentsByCategories(categories: AgentCategory[]): AgentDefinition[] {
  // If no categories specified, return all agents
  if (!categories || categories.length === 0) {
    return getAllAgents();
  }

  // Collect agents from each category
  const agentMap = new Map<string, AgentDefinition>();

  for (const category of categories) {
    const categoryAgents = getAgentsByCategory(category);
    for (const agent of categoryAgents) {
      // Use Map to prevent duplicates if same agent somehow in multiple categories
      agentMap.set(agent.id, agent);
    }
  }

  return Array.from(agentMap.values());
}

/**
 * Get all agents organized by category groups for UI display
 *
 * @returns Object with agents grouped by category, including icons and capabilities
 */
export function getAllAgentsByCategoryGroups(): ListPartyAgentsResponse {
  const categories = Object.values(AgentCategory);
  const result: ListPartyAgentsResponse = {
    categories: [],
    totalAgents: 0,
  };

  for (const category of categories) {
    const agents = getAgentsByCategory(category);

    if (agents.length > 0) {
      result.categories.push({
        category,
        agents: agents.map(agent => ({
          id: agent.id,
          name: agent.name,
          icon: agent.icon,
          description: agent.description,
          capabilities: agent.capabilities,
        })),
      });

      result.totalAgents += agents.length;
    }
  }

  return result;
}

/**
 * Get category display name for UI
 *
 * @param category - The agent category
 * @returns Human-readable category name
 */
export function getCategoryDisplayName(category: AgentCategory): string {
  const displayNames: Record<AgentCategory, string> = {
    [AgentCategory.CORE]: 'Core Team',
    [AgentCategory.PERSONAL]: 'Personal Team',
    [AgentCategory.CREATIVE]: 'Creative Intelligence',
    [AgentCategory.GAMEDEV]: 'Game Development',
    [AgentCategory.BMAD]: 'BMAD',
    [AgentCategory.SPECIALIZED]: 'Specialized',
  };

  return displayNames[category] || category;
}

/**
 * Get category icon for UI
 *
 * @param category - The agent category
 * @returns Icon representing the category
 */
export function getCategoryIcon(category: AgentCategory): string {
  const icons: Record<AgentCategory, string> = {
    [AgentCategory.CORE]: '🏢',
    [AgentCategory.PERSONAL]: '👤',
    [AgentCategory.CREATIVE]: '✨',
    [AgentCategory.GAMEDEV]: '🎮',
    [AgentCategory.BMAD]: '🔮',
    [AgentCategory.SPECIALIZED]: '🎯',
  };

  return icons[category] || '📦';
}

/**
 * Check if an agent belongs to any of the specified categories
 *
 * @param agentId - Agent ID to check
 * @param categories - Categories to check against (empty = always true)
 * @returns True if agent is in one of the categories (or if no filter)
 */
export function isAgentInCategories(
  agent: AgentDefinition,
  categories: AgentCategory[]
): boolean {
  if (!categories || categories.length === 0) {
    return true;
  }

  return categories.includes(agent.category);
}
