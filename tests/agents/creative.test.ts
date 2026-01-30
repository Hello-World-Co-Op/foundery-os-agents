import { describe, it, expect } from 'vitest';
import { loadPersona, listPersonas, listPersonasByCategory, getPersonaCategory } from '../../src/agents/persona-loader.js';
import { agentRegistry, getAgentDefinition, getAgentsByCategory, AgentCategory, getAllAgents } from '../../src/agents/registry.js';

const CREATIVE_AGENT_IDS = [
  'spark',
  'nova',
  'iris',
  'atlas',
  'fable',
];

describe('Creative Intelligence Suite Agents', () => {
  describe('Agent Registry', () => {
    it('should have all 5 creative agents registered', () => {
      const creativeAgents = getAgentsByCategory(AgentCategory.CREATIVE);
      expect(creativeAgents).toHaveLength(5);
    });

    it.each(CREATIVE_AGENT_IDS)('should have %s registered in the registry', (agentId) => {
      expect(agentRegistry.has(agentId)).toBe(true);
    });

    it.each(CREATIVE_AGENT_IDS)('should have definition for %s with required fields', (agentId) => {
      const definition = getAgentDefinition(agentId);
      expect(definition).toBeDefined();
      expect(definition!.id).toBe(agentId);
      expect(definition!.name).toBeTruthy();
      expect(definition!.category).toBe(AgentCategory.CREATIVE);
      expect(definition!.personaFile).toMatch(/^creative\/.+\.md$/);
      expect(definition!.description).toBeTruthy();
      expect(definition!.icon).toBeTruthy();
      expect(definition!.capabilities).toBeInstanceOf(Array);
      expect(definition!.capabilities.length).toBeGreaterThan(0);
    });

    it('should return correct agents when filtering by CREATIVE category', () => {
      const creativeAgents = getAgentsByCategory(AgentCategory.CREATIVE);
      const ids = creativeAgents.map(a => a.id);

      for (const expectedId of CREATIVE_AGENT_IDS) {
        expect(ids).toContain(expectedId);
      }
    });

    it('should have unique icons for each creative agent', () => {
      const creativeAgents = getAgentsByCategory(AgentCategory.CREATIVE);
      const icons = creativeAgents.map(a => a.icon);
      const uniqueIcons = new Set(icons);
      expect(uniqueIcons.size).toBe(icons.length);
    });

    it('should have unique icons across ALL agent categories (no collisions with Core or Personal)', () => {
      const allAgents = getAllAgents();
      const iconMap = new Map<string, string[]>();

      for (const agent of allAgents) {
        const existing = iconMap.get(agent.icon) || [];
        existing.push(`${agent.id} (${agent.category})`);
        iconMap.set(agent.icon, existing);
      }

      // Find any icons used by multiple agents
      const collisions: string[] = [];
      for (const [icon, agents] of iconMap) {
        if (agents.length > 1) {
          collisions.push(`${icon}: ${agents.join(', ')}`);
        }
      }

      expect(collisions).toEqual([]);
    });
  });

  describe('Persona Loader', () => {
    it.each(CREATIVE_AGENT_IDS)('should load persona for %s correctly', async (agentId) => {
      const persona = await loadPersona(agentId);
      expect(persona).not.toBeNull();
      expect(persona!.id).toBe(agentId);
      expect(persona!.name).toBeTruthy();
      expect(persona!.systemPrompt).toBeTruthy();
    });

    it.each(CREATIVE_AGENT_IDS)('should have name, role, and systemPrompt for %s', async (agentId) => {
      const persona = await loadPersona(agentId);
      expect(persona).not.toBeNull();
      expect(persona!.name).toBeTruthy();
      expect(persona!.role).toBeTruthy();
      expect(persona!.systemPrompt).toBeTruthy();
      expect(persona!.systemPrompt.length).toBeGreaterThan(100);
    });

    it('should load persona with category hint', async () => {
      const persona = await loadPersona('spark', 'creative');
      expect(persona).not.toBeNull();
      expect(persona!.id).toBe('spark');
      expect(persona!.category).toBe('creative');
    });

    it('should find persona without category hint (searches all categories)', async () => {
      const persona = await loadPersona('fable');
      expect(persona).not.toBeNull();
      expect(persona!.id).toBe('fable');
    });
  });

  describe('Persona Category', () => {
    it.each(CREATIVE_AGENT_IDS)('should return "creative" category for %s', async (agentId) => {
      const category = await getPersonaCategory(agentId);
      expect(category).toBe('creative');
    });
  });

  describe('List Personas', () => {
    it('should list all creative personas', async () => {
      const personas = await listPersonasByCategory('creative');
      expect(personas.length).toBeGreaterThanOrEqual(5);

      for (const agentId of CREATIVE_AGENT_IDS) {
        expect(personas).toContain(agentId);
      }
    });

    it('should include creative personas in global list', async () => {
      const allPersonas = await listPersonas();

      for (const agentId of CREATIVE_AGENT_IDS) {
        expect(allPersonas).toContain(agentId);
      }
    });
  });

  describe('Icon Frontmatter Loading', () => {
    it.each(CREATIVE_AGENT_IDS)('should load icon from frontmatter for %s', async (agentId) => {
      const persona = await loadPersona(agentId);
      expect(persona).not.toBeNull();
      expect(persona!.icon).toBeTruthy();
    });

    it('should load correct icon for Spark from frontmatter', async () => {
      const persona = await loadPersona('spark');
      expect(persona).not.toBeNull();
      expect(persona!.icon).toBe('⚡');
    });

    it('should load correct icon for Nova from frontmatter', async () => {
      const persona = await loadPersona('nova');
      expect(persona).not.toBeNull();
      expect(persona!.icon).toBe('🌟');
    });

    it('should load correct icon for Iris from frontmatter', async () => {
      const persona = await loadPersona('iris');
      expect(persona).not.toBeNull();
      expect(persona!.icon).toBe('👁️');
    });

    it('should load correct icon for Atlas from frontmatter', async () => {
      const persona = await loadPersona('atlas');
      expect(persona).not.toBeNull();
      expect(persona!.icon).toBe('🗺️');
    });

    it('should load correct icon for Fable from frontmatter', async () => {
      const persona = await loadPersona('fable');
      expect(persona).not.toBeNull();
      expect(persona!.icon).toBe('📖');
    });
  });

  describe('Agent-Specific Tests', () => {
    it('should have Spark as Brainstorming Coach', async () => {
      const persona = await loadPersona('spark');
      expect(persona).not.toBeNull();
      expect(persona!.name).toBe('Spark');
      expect(persona!.role).toContain('Brainstorming');
    });

    it('should have Nova as Creative Problem Solver', async () => {
      const persona = await loadPersona('nova');
      expect(persona).not.toBeNull();
      expect(persona!.name).toBe('Nova');
      expect(persona!.role).toContain('Problem Solver');
    });

    it('should have Iris as Design Thinking Coach', async () => {
      const persona = await loadPersona('iris');
      expect(persona).not.toBeNull();
      expect(persona!.name).toBe('Iris');
      expect(persona!.role).toContain('Design Thinking');
    });

    it('should have Atlas as Innovation Strategist', async () => {
      const persona = await loadPersona('atlas');
      expect(persona).not.toBeNull();
      expect(persona!.name).toBe('Atlas');
      expect(persona!.role).toContain('Innovation Strategist');
    });

    it('should have Fable as Storyteller', async () => {
      const persona = await loadPersona('fable');
      expect(persona).not.toBeNull();
      expect(persona!.name).toBe('Fable');
      expect(persona!.role).toContain('Storyteller');
    });
  });
});
