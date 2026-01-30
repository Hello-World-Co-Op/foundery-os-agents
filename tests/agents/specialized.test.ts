import { describe, it, expect } from 'vitest';
import { loadPersona, listPersonas, listPersonasByCategory, getPersonaCategory } from '../../src/agents/persona-loader.js';
import { agentRegistry, getAgentDefinition, getAgentsByCategory, AgentCategory, getAllAgents } from '../../src/agents/registry.js';

const SPECIALIZED_AGENT_IDS = [
  'dr-cadence',
  'jack-valltrades',
];

describe('Specialized Agents', () => {
  describe('Agent Registry', () => {
    it('should have all 2 specialized agents registered', () => {
      const specializedAgents = getAgentsByCategory(AgentCategory.SPECIALIZED);
      expect(specializedAgents).toHaveLength(2);
    });

    it.each(SPECIALIZED_AGENT_IDS)('should have %s registered in the registry', (agentId) => {
      expect(agentRegistry.has(agentId)).toBe(true);
    });

    it.each(SPECIALIZED_AGENT_IDS)('should have definition for %s with required fields', (agentId) => {
      const definition = getAgentDefinition(agentId);
      expect(definition).toBeDefined();
      expect(definition!.id).toBe(agentId);
      expect(definition!.name).toBeTruthy();
      expect(definition!.category).toBe(AgentCategory.SPECIALIZED);
      expect(definition!.personaFile).toMatch(/^specialized\/.+\.md$/);
      expect(definition!.description).toBeTruthy();
      expect(definition!.icon).toBeTruthy();
      expect(definition!.capabilities).toBeInstanceOf(Array);
      expect(definition!.capabilities.length).toBeGreaterThan(0);
    });

    it('should return correct agents when filtering by SPECIALIZED category', () => {
      const specializedAgents = getAgentsByCategory(AgentCategory.SPECIALIZED);
      const ids = specializedAgents.map(a => a.id);

      for (const expectedId of SPECIALIZED_AGENT_IDS) {
        expect(ids).toContain(expectedId);
      }
    });

    it('should have unique icons for each specialized agent', () => {
      const specializedAgents = getAgentsByCategory(AgentCategory.SPECIALIZED);
      const icons = specializedAgents.map(a => a.icon);
      const uniqueIcons = new Set(icons);
      expect(uniqueIcons.size).toBe(icons.length);
    });

    it('should have unique icons across ALL agent categories (no collisions with Core, Personal, Creative, GameDev, or BMAD)', () => {
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
    it.each(SPECIALIZED_AGENT_IDS)('should load persona for %s correctly', async (agentId) => {
      const persona = await loadPersona(agentId);
      expect(persona).not.toBeNull();
      expect(persona!.id).toBe(agentId);
      expect(persona!.name).toBeTruthy();
      expect(persona!.systemPrompt).toBeTruthy();
    });

    it.each(SPECIALIZED_AGENT_IDS)('should have name, role, and systemPrompt for %s', async (agentId) => {
      const persona = await loadPersona(agentId);
      expect(persona).not.toBeNull();
      expect(persona!.name).toBeTruthy();
      expect(persona!.role).toBeTruthy();
      expect(persona!.systemPrompt).toBeTruthy();
      expect(persona!.systemPrompt.length).toBeGreaterThan(100);
    });

    it('should load persona with category hint', async () => {
      const persona = await loadPersona('dr-cadence', 'specialized');
      expect(persona).not.toBeNull();
      expect(persona!.id).toBe('dr-cadence');
      expect(persona!.category).toBe('specialized');
    });

    it('should find persona without category hint (searches all categories)', async () => {
      const persona = await loadPersona('jack-valltrades');
      expect(persona).not.toBeNull();
      expect(persona!.id).toBe('jack-valltrades');
    });

    it('should return null for non-existent specialized persona', async () => {
      const persona = await loadPersona('non-existent-specialized-agent', 'specialized');
      expect(persona).toBeNull();
    });
  });

  describe('Persona Category', () => {
    it.each(SPECIALIZED_AGENT_IDS)('should return "specialized" category for %s', async (agentId) => {
      const category = await getPersonaCategory(agentId);
      expect(category).toBe('specialized');
    });
  });

  describe('List Personas', () => {
    it('should list all specialized personas', async () => {
      const personas = await listPersonasByCategory('specialized');
      expect(personas.length).toBeGreaterThanOrEqual(2);

      for (const agentId of SPECIALIZED_AGENT_IDS) {
        expect(personas).toContain(agentId);
      }
    });

    it('should include specialized personas in global list', async () => {
      const allPersonas = await listPersonas();

      for (const agentId of SPECIALIZED_AGENT_IDS) {
        expect(allPersonas).toContain(agentId);
      }
    });
  });

  describe('Icon Frontmatter Loading', () => {
    it.each(SPECIALIZED_AGENT_IDS)('should load icon from frontmatter for %s', async (agentId) => {
      const persona = await loadPersona(agentId);
      expect(persona).not.toBeNull();
      expect(persona!.icon).toBeTruthy();
    });

    it('should load correct icon for Dr. Cadence from frontmatter', async () => {
      const persona = await loadPersona('dr-cadence');
      expect(persona).not.toBeNull();
      expect(persona!.icon).toBe('🎙️');
    });

    it('should load correct icon for Jack Valltrades from frontmatter', async () => {
      const persona = await loadPersona('jack-valltrades');
      expect(persona).not.toBeNull();
      expect(persona!.icon).toBe('🎭');
    });
  });

  describe('Agent-Specific Tests', () => {
    it('should have Dr. Cadence as Communication Specialist', async () => {
      const persona = await loadPersona('dr-cadence');
      expect(persona).not.toBeNull();
      expect(persona!.name).toBe('Dr. Cadence');
      expect(persona!.role).toContain('Communication Specialist');
    });

    it('should have Jack Valltrades as Community Interface', async () => {
      const persona = await loadPersona('jack-valltrades');
      expect(persona).not.toBeNull();
      expect(persona!.name).toBe('Jack Valltrades');
      expect(persona!.role).toContain('Community Interface');
    });
  });

  describe('Persona Content Depth', () => {
    it('should have Dr. Cadence persona with required sections', async () => {
      const persona = await loadPersona('dr-cadence');
      expect(persona).not.toBeNull();
      expect(persona!.systemPrompt).toContain('Core Philosophy');
      expect(persona!.systemPrompt).toContain('Communication Style');
      expect(persona!.systemPrompt).toContain('Communication Analysis');
      expect(persona!.systemPrompt).toContain('Cadence Tuning');
      expect(persona!.systemPrompt).toContain('Style Optimization');
    });

    it('should have Jack Valltrades persona with required sections', async () => {
      const persona = await loadPersona('jack-valltrades');
      expect(persona).not.toBeNull();
      expect(persona!.systemPrompt).toContain('Core Philosophy');
      expect(persona!.systemPrompt).toContain('Communication Style');
      expect(persona!.systemPrompt).toContain('Community Interface');
      expect(persona!.systemPrompt).toContain('Storytelling');
      expect(persona!.systemPrompt).toContain('The Lover Archetype');
    });
  });

  describe('Registry Capability Tests', () => {
    it('should have Dr. Cadence with communication-analysis and cadence-tuning capabilities (AC-3.4.7.1)', () => {
      const definition = getAgentDefinition('dr-cadence');
      expect(definition).toBeDefined();
      expect(definition!.capabilities).toContain('communication-analysis');
      expect(definition!.capabilities).toContain('cadence-tuning');
      expect(definition!.capabilities).toContain('style-optimization');
      expect(definition!.capabilities).toContain('agent-coaching');
    });

    it('should have Jack Valltrades with community-engagement and storytelling capabilities (AC-3.4.7.2)', () => {
      const definition = getAgentDefinition('jack-valltrades');
      expect(definition).toBeDefined();
      expect(definition!.capabilities).toContain('community-engagement');
      expect(definition!.capabilities).toContain('storytelling');
      expect(definition!.capabilities).toContain('founder-representation');
      expect(definition!.capabilities).toContain('narrative-connection');
    });
  });
});
