import { describe, it, expect } from 'vitest';
import { loadPersona, listPersonas, listPersonasByCategory, getPersonaCategory } from '../../src/agents/persona-loader.js';
import { agentRegistry, getAgentDefinition, getAgentsByCategory, AgentCategory, getAllAgents } from '../../src/agents/registry.js';

const PERSONAL_AGENT_IDS = [
  'dominic-vega',
  'celeste-marlowe',
  'vincent-thorne',
  'theo-ashford',
  'margot-sinclair',
  'evelyn-cross',
];

describe('Personal Team Agents', () => {
  describe('Agent Registry', () => {
    it('should have all 6 personal agents registered', () => {
      const personalAgents = getAgentsByCategory(AgentCategory.PERSONAL);
      expect(personalAgents).toHaveLength(6);
    });

    it.each(PERSONAL_AGENT_IDS)('should have %s registered in the registry', (agentId) => {
      expect(agentRegistry.has(agentId)).toBe(true);
    });

    it.each(PERSONAL_AGENT_IDS)('should have definition for %s with required fields', (agentId) => {
      const definition = getAgentDefinition(agentId);
      expect(definition).toBeDefined();
      expect(definition!.id).toBe(agentId);
      expect(definition!.name).toBeTruthy();
      expect(definition!.category).toBe(AgentCategory.PERSONAL);
      expect(definition!.personaFile).toMatch(/^personal\/.+\.md$/);
      expect(definition!.description).toBeTruthy();
      expect(definition!.icon).toBeTruthy();
      expect(definition!.capabilities).toBeInstanceOf(Array);
      expect(definition!.capabilities.length).toBeGreaterThan(0);
    });

    it('should return correct agents when filtering by PERSONAL category', () => {
      const personalAgents = getAgentsByCategory(AgentCategory.PERSONAL);
      const ids = personalAgents.map(a => a.id);

      for (const expectedId of PERSONAL_AGENT_IDS) {
        expect(ids).toContain(expectedId);
      }
    });

    it('should have unique icons for each personal agent', () => {
      const personalAgents = getAgentsByCategory(AgentCategory.PERSONAL);
      const icons = personalAgents.map(a => a.icon);
      const uniqueIcons = new Set(icons);
      expect(uniqueIcons.size).toBe(icons.length);
    });

    it('should have unique icons across ALL agent categories (no collisions with Core)', () => {
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
    it.each(PERSONAL_AGENT_IDS)('should load persona for %s correctly', async (agentId) => {
      const persona = await loadPersona(agentId);
      expect(persona).not.toBeNull();
      expect(persona!.id).toBe(agentId);
      expect(persona!.name).toBeTruthy();
      expect(persona!.systemPrompt).toBeTruthy();
    });

    it.each(PERSONAL_AGENT_IDS)('should have name, role, and systemPrompt for %s', async (agentId) => {
      const persona = await loadPersona(agentId);
      expect(persona).not.toBeNull();
      expect(persona!.name).toBeTruthy();
      expect(persona!.role).toBeTruthy();
      expect(persona!.systemPrompt).toBeTruthy();
      expect(persona!.systemPrompt.length).toBeGreaterThan(100);
    });

    it('should load persona with category hint', async () => {
      const persona = await loadPersona('dominic-vega', 'personal');
      expect(persona).not.toBeNull();
      expect(persona!.id).toBe('dominic-vega');
      expect(persona!.category).toBe('personal');
    });

    it('should find persona without category hint (searches all categories)', async () => {
      const persona = await loadPersona('margot-sinclair');
      expect(persona).not.toBeNull();
      expect(persona!.id).toBe('margot-sinclair');
    });
  });

  describe('Persona Category', () => {
    it.each(PERSONAL_AGENT_IDS)('should return "personal" category for %s', async (agentId) => {
      const category = await getPersonaCategory(agentId);
      expect(category).toBe('personal');
    });
  });

  describe('List Personas', () => {
    it('should list all personal personas', async () => {
      const personas = await listPersonasByCategory('personal');
      expect(personas.length).toBeGreaterThanOrEqual(6);

      for (const agentId of PERSONAL_AGENT_IDS) {
        expect(personas).toContain(agentId);
      }
    });

    it('should include personal personas in global list', async () => {
      const allPersonas = await listPersonas();

      for (const agentId of PERSONAL_AGENT_IDS) {
        expect(allPersonas).toContain(agentId);
      }
    });
  });

  describe('Icon Frontmatter Loading', () => {
    it.each(PERSONAL_AGENT_IDS)('should load icon from frontmatter for %s', async (agentId) => {
      const persona = await loadPersona(agentId);
      expect(persona).not.toBeNull();
      expect(persona!.icon).toBeTruthy();
    });

    it('should load correct icon for Dominic from frontmatter', async () => {
      const persona = await loadPersona('dominic-vega');
      expect(persona).not.toBeNull();
      expect(persona!.icon).toBe('💼');
    });

    it('should load correct icon for Evelyn from frontmatter', async () => {
      const persona = await loadPersona('evelyn-cross');
      expect(persona).not.toBeNull();
      expect(persona!.icon).toBe('⚖️');
    });

    it('should load correct icon for Theo from frontmatter', async () => {
      const persona = await loadPersona('theo-ashford');
      expect(persona).not.toBeNull();
      expect(persona!.icon).toBe('📅');
    });
  });

  describe('Backward Compatibility', () => {
    it('should load theo-ashford using "theo" alias', async () => {
      const persona = await loadPersona('theo');
      expect(persona).not.toBeNull();
      expect(persona!.id).toBe('theo-ashford');
      expect(persona!.name).toContain('Theo');
    });

    it('should return "personal" category for "theo" alias', async () => {
      const category = await getPersonaCategory('theo');
      expect(category).toBe('personal');
    });
  });

  describe('Agent-Specific Tests', () => {
    it('should have Dominic Vega as Sales Lead', async () => {
      const persona = await loadPersona('dominic-vega');
      expect(persona).not.toBeNull();
      expect(persona!.name).toBe('Dominic Vega');
      expect(persona!.role).toContain('Sales');
    });

    it('should have Celeste Marlowe as Marketing strategist', async () => {
      const persona = await loadPersona('celeste-marlowe');
      expect(persona).not.toBeNull();
      expect(persona!.name).toBe('Celeste Marlowe');
      expect(persona!.role).toContain('Marketing');
    });

    it('should have Vincent Thorne as Finance manager', async () => {
      const persona = await loadPersona('vincent-thorne');
      expect(persona).not.toBeNull();
      expect(persona!.name).toBe('Vincent Thorne');
      expect(persona!.role).toContain('Finance');
    });

    it('should have Margot Sinclair as Client Success manager', async () => {
      const persona = await loadPersona('margot-sinclair');
      expect(persona).not.toBeNull();
      expect(persona!.name).toBe('Margot Sinclair');
      expect(persona!.role).toContain('Client Success');
    });

    it('should have Evelyn Cross as Legal advisor', async () => {
      const persona = await loadPersona('evelyn-cross');
      expect(persona).not.toBeNull();
      expect(persona!.name).toBe('Evelyn Cross');
      expect(persona!.role).toContain('Legal');
    });

    it('should have Theo Ashford as Executive Assistant', async () => {
      const persona = await loadPersona('theo-ashford');
      expect(persona).not.toBeNull();
      expect(persona!.name).toContain('Theo');
      expect(persona!.role).toContain('Executive Assistant');
    });
  });
});
