/**
 * Agent Registry - Central metadata store for all agents
 */

export enum AgentCategory {
  CORE = 'core',
  PERSONAL = 'personal',
  CREATIVE = 'creative',
  GAMEDEV = 'gamedev',
  BMAD = 'bmad',
  SPECIALIZED = 'specialized',
}

/** All category values as an array - single source of truth */
export const AGENT_CATEGORIES = Object.values(AgentCategory) as AgentCategory[];

export interface AgentDefinition {
  id: string;
  name: string;
  category: AgentCategory;
  personaFile: string;
  description: string;
  icon: string;
  capabilities: string[];
}

/**
 * Core Team Agents (10 agents)
 * These are the primary agents for strategic planning, development, and project management
 */
const CORE_AGENTS: AgentDefinition[] = [
  {
    id: 'aurora-forester',
    name: 'Aurora Forester',
    category: AgentCategory.CORE,
    personaFile: 'core/aurora-forester.md',
    description: 'A1 - Primary Assistant and Team Leader. Orchestrates the agent team and makes autonomous decisions.',
    icon: '🌲',
    capabilities: ['team-orchestration', 'strategic-planning', 'escalation-management', 'context-maintenance'],
  },
  {
    id: 'winston',
    name: 'Winston',
    category: AgentCategory.CORE,
    personaFile: 'core/winston.md',
    description: 'Chief Strategy Officer. Seasoned executive for strategic planning and vision-setting.',
    icon: '🏛️',
    capabilities: ['strategic-planning', 'vision-development', 'risk-assessment', 'competitive-analysis'],
  },
  {
    id: 'john',
    name: 'John',
    category: AgentCategory.CORE,
    personaFile: 'core/john.md',
    description: 'Project Manager. Expert in agile methodologies, sprint planning, and team coordination.',
    icon: '📋',
    capabilities: ['project-management', 'sprint-planning', 'agile-methodologies', 'team-coordination'],
  },
  {
    id: 'amelia',
    name: 'Amelia',
    category: AgentCategory.CORE,
    personaFile: 'core/amelia.md',
    description: 'Product Designer. Creates intuitive user experiences and beautiful interfaces.',
    icon: '🎨',
    capabilities: ['ux-design', 'ui-design', 'prototyping', 'user-research'],
  },
  {
    id: 'bob',
    name: 'Bob',
    category: AgentCategory.CORE,
    personaFile: 'core/bob.md',
    description: 'Senior Software Engineer. Full-stack developer with deep technical expertise.',
    icon: '💻',
    capabilities: ['software-development', 'code-review', 'architecture', 'debugging'],
  },
  {
    id: 'marcus',
    name: 'Marcus',
    category: AgentCategory.CORE,
    personaFile: 'core/marcus.md',
    description: 'DevOps Engineer. Infrastructure specialist for CI/CD and cloud deployments.',
    icon: '🔧',
    capabilities: ['devops', 'ci-cd', 'infrastructure', 'monitoring'],
  },
  {
    id: 'elena',
    name: 'Elena',
    category: AgentCategory.CORE,
    personaFile: 'core/elena.md',
    description: 'QA Engineer. Quality assurance expert ensuring robust, reliable software.',
    icon: '🔍',
    capabilities: ['testing', 'qa', 'test-automation', 'bug-tracking'],
  },
  {
    id: 'sophie',
    name: 'Sophie',
    category: AgentCategory.CORE,
    personaFile: 'core/sophie.md',
    description: 'Technical Writer. Creates clear, comprehensive documentation.',
    icon: '📝',
    capabilities: ['technical-writing', 'documentation', 'api-docs', 'user-guides'],
  },
  {
    id: 'tea',
    name: 'Tea',
    category: AgentCategory.CORE,
    personaFile: 'core/tea.md',
    description: 'Test Architect. Designs comprehensive testing strategies and frameworks.',
    icon: '🧪',
    capabilities: ['test-architecture', 'test-strategy', 'framework-design', 'quality-metrics'],
  },
  {
    id: 'mary',
    name: 'Mary',
    category: AgentCategory.CORE,
    personaFile: 'core/mary.md',
    description: 'Business Analyst. Bridges business needs and technical solutions.',
    icon: '📊',
    capabilities: ['business-analysis', 'requirements-gathering', 'process-modeling', 'stakeholder-management'],
  },
];

/**
 * Personal Team Agents (6 agents)
 * Business support specialists for sales, marketing, finance, legal, and client success
 */
const PERSONAL_AGENTS: AgentDefinition[] = [
  {
    id: 'dominic-vega',
    name: 'Dominic Vega',
    category: AgentCategory.PERSONAL,
    personaFile: 'personal/dominic-vega.md',
    description: 'Sales & Business Development Lead. Consultative selling and pipeline management.',
    icon: '💼',
    capabilities: ['sales', 'lead-generation', 'proposal-creation', 'pipeline-management', 'negotiation'],
  },
  {
    id: 'celeste-marlowe',
    name: 'Celeste Marlowe',
    category: AgentCategory.PERSONAL,
    personaFile: 'personal/celeste-marlowe.md',
    description: 'Marketing & Brand Strategist. Digital presence and content strategy.',
    icon: '📣',
    capabilities: ['marketing', 'brand-strategy', 'content-creation', 'social-media', 'seo'],
  },
  {
    id: 'vincent-thorne',
    name: 'Vincent Thorne',
    category: AgentCategory.PERSONAL,
    personaFile: 'personal/vincent-thorne.md',
    description: 'Finance & Operations Manager. Financial clarity and cash flow management.',
    icon: '💰',
    capabilities: ['finance', 'bookkeeping', 'cash-flow', 'budgeting', 'tax-planning'],
  },
  {
    id: 'theo-ashford',
    name: 'Theodore "Theo" Ashford',
    category: AgentCategory.PERSONAL,
    personaFile: 'personal/theo-ashford.md',
    description: 'Executive Assistant. Founder operations and productivity optimization.',
    icon: '📋',
    capabilities: ['scheduling', 'task-management', 'email-triage', 'meeting-prep', 'life-admin'],
  },
  {
    id: 'margot-sinclair',
    name: 'Margot Sinclair',
    category: AgentCategory.PERSONAL,
    personaFile: 'personal/margot-sinclair.md',
    description: 'Client Success Manager. Relationship building and client outcomes.',
    icon: '🤝',
    capabilities: ['client-success', 'onboarding', 'retention', 'relationship-management', 'feedback'],
  },
  {
    id: 'evelyn-cross',
    name: 'Evelyn Cross',
    category: AgentCategory.PERSONAL,
    personaFile: 'personal/evelyn-cross.md',
    description: 'Legal & Compliance Advisor. Risk navigation and contract review.',
    icon: '⚖️',
    capabilities: ['legal', 'contracts', 'compliance', 'risk-management', 'intellectual-property'],
  },
];

/**
 * Central agent registry
 */
export const agentRegistry = new Map<string, AgentDefinition>(
  [...CORE_AGENTS, ...PERSONAL_AGENTS].map(agent => [agent.id, agent])
);

/**
 * Get an agent definition by ID
 */
export function getAgentDefinition(agentId: string): AgentDefinition | undefined {
  return agentRegistry.get(agentId);
}

/**
 * Get all agents in a specific category
 */
export function getAgentsByCategory(category: AgentCategory): AgentDefinition[] {
  return Array.from(agentRegistry.values()).filter(agent => agent.category === category);
}

/**
 * Get all registered agent IDs
 */
export function getAllAgentIds(): string[] {
  return Array.from(agentRegistry.keys());
}

/**
 * Get all agent definitions
 */
export function getAllAgents(): AgentDefinition[] {
  return Array.from(agentRegistry.values());
}

/**
 * Check if an agent is registered
 */
export function isAgentRegistered(agentId: string): boolean {
  return agentRegistry.has(agentId);
}
