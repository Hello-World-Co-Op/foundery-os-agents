import { describe, it, expect } from 'vitest';
import { loadPersona, listPersonas, listPersonasByCategory, getPersonaCategory } from '../../src/agents/persona-loader.js';
import { agentRegistry, getAgentDefinition, getAgentsByCategory, AgentCategory, getAllAgents } from '../../src/agents/registry.js';

const BMAD_AGENT_IDS = [
  'bmad-master',
  'bmad-builder',
];

describe('BMAD Core Agents', () => {
  describe('Agent Registry', () => {
    it('should have all 2 BMAD agents registered', () => {
      const bmadAgents = getAgentsByCategory(AgentCategory.BMAD);
      expect(bmadAgents).toHaveLength(2);
    });

    it.each(BMAD_AGENT_IDS)('should have %s registered in the registry', (agentId) => {
      expect(agentRegistry.has(agentId)).toBe(true);
    });

    it.each(BMAD_AGENT_IDS)('should have definition for %s with required fields', (agentId) => {
      const definition = getAgentDefinition(agentId);
      expect(definition).toBeDefined();
      expect(definition!.id).toBe(agentId);
      expect(definition!.name).toBeTruthy();
      expect(definition!.category).toBe(AgentCategory.BMAD);
      expect(definition!.personaFile).toMatch(/^bmad\/.+\.md$/);
      expect(definition!.description).toBeTruthy();
      expect(definition!.icon).toBeTruthy();
      expect(definition!.capabilities).toBeInstanceOf(Array);
      expect(definition!.capabilities.length).toBeGreaterThan(0);
    });

    it('should return correct agents when filtering by BMAD category', () => {
      const bmadAgents = getAgentsByCategory(AgentCategory.BMAD);
      const ids = bmadAgents.map(a => a.id);

      for (const expectedId of BMAD_AGENT_IDS) {
        expect(ids).toContain(expectedId);
      }
    });

    it('should have unique icons for each BMAD agent', () => {
      const bmadAgents = getAgentsByCategory(AgentCategory.BMAD);
      const icons = bmadAgents.map(a => a.icon);
      const uniqueIcons = new Set(icons);
      expect(uniqueIcons.size).toBe(icons.length);
    });

    it('should have unique icons across ALL agent categories (no collisions with Core, Personal, Creative, or GameDev)', () => {
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
    it.each(BMAD_AGENT_IDS)('should load persona for %s correctly', async (agentId) => {
      const persona = await loadPersona(agentId);
      expect(persona).not.toBeNull();
      expect(persona!.id).toBe(agentId);
      expect(persona!.name).toBeTruthy();
      expect(persona!.systemPrompt).toBeTruthy();
    });

    it.each(BMAD_AGENT_IDS)('should have name, role, and systemPrompt for %s', async (agentId) => {
      const persona = await loadPersona(agentId);
      expect(persona).not.toBeNull();
      expect(persona!.name).toBeTruthy();
      expect(persona!.role).toBeTruthy();
      expect(persona!.systemPrompt).toBeTruthy();
      expect(persona!.systemPrompt.length).toBeGreaterThan(100);
    });

    it('should load persona with category hint', async () => {
      const persona = await loadPersona('bmad-master', 'bmad');
      expect(persona).not.toBeNull();
      expect(persona!.id).toBe('bmad-master');
      expect(persona!.category).toBe('bmad');
    });

    it('should find persona without category hint (searches all categories)', async () => {
      const persona = await loadPersona('bmad-builder');
      expect(persona).not.toBeNull();
      expect(persona!.id).toBe('bmad-builder');
    });

    it('should return null for non-existent BMAD persona', async () => {
      const persona = await loadPersona('non-existent-bmad-agent', 'bmad');
      expect(persona).toBeNull();
    });
  });

  describe('Persona Category', () => {
    it.each(BMAD_AGENT_IDS)('should return "bmad" category for %s', async (agentId) => {
      const category = await getPersonaCategory(agentId);
      expect(category).toBe('bmad');
    });
  });

  describe('List Personas', () => {
    it('should list all BMAD personas', async () => {
      const personas = await listPersonasByCategory('bmad');
      expect(personas.length).toBeGreaterThanOrEqual(2);

      for (const agentId of BMAD_AGENT_IDS) {
        expect(personas).toContain(agentId);
      }
    });

    it('should include BMAD personas in global list', async () => {
      const allPersonas = await listPersonas();

      for (const agentId of BMAD_AGENT_IDS) {
        expect(allPersonas).toContain(agentId);
      }
    });
  });

  describe('Icon Frontmatter Loading', () => {
    it.each(BMAD_AGENT_IDS)('should load icon from frontmatter for %s', async (agentId) => {
      const persona = await loadPersona(agentId);
      expect(persona).not.toBeNull();
      expect(persona!.icon).toBeTruthy();
    });

    it('should load correct icon for BMAD Master from frontmatter', async () => {
      const persona = await loadPersona('bmad-master');
      expect(persona).not.toBeNull();
      expect(persona!.icon).toBe('🧙');
    });

    it('should load correct icon for Mason (BMAD Builder) from frontmatter', async () => {
      const persona = await loadPersona('bmad-builder');
      expect(persona).not.toBeNull();
      expect(persona!.icon).toBe('🔨');
    });
  });

  describe('Agent-Specific Tests', () => {
    it('should have BMAD Master as Master Orchestrator', async () => {
      const persona = await loadPersona('bmad-master');
      expect(persona).not.toBeNull();
      expect(persona!.name).toBe('BMAD Master');
      expect(persona!.role).toContain('Master Orchestrator');
    });

    it('should have Mason as Module Builder', async () => {
      const persona = await loadPersona('bmad-builder');
      expect(persona).not.toBeNull();
      expect(persona!.name).toBe('Mason');
      expect(persona!.role).toContain('Module Builder');
    });
  });

  describe('Registry Capability Tests', () => {
    it('should have BMAD Master with workflow-orchestration and party-mode capabilities (AC-3.4.5.1)', () => {
      const definition = getAgentDefinition('bmad-master');
      expect(definition).toBeDefined();
      expect(definition!.capabilities).toContain('workflow-orchestration');
      expect(definition!.capabilities).toContain('party-mode');
      expect(definition!.capabilities).toContain('manifest-management');
      expect(definition!.capabilities).toContain('agent-coordination');
      expect(definition!.capabilities).toContain('task-execution');
    });

    it('should have Mason with agent-creation and workflow-creation capabilities (AC-3.4.5.2)', () => {
      const definition = getAgentDefinition('bmad-builder');
      expect(definition).toBeDefined();
      expect(definition!.capabilities).toContain('agent-creation');
      expect(definition!.capabilities).toContain('workflow-creation');
      expect(definition!.capabilities).toContain('module-building');
      expect(definition!.capabilities).toContain('bmad-compliance');
      expect(definition!.capabilities).toContain('quality-audit');
    });
  });
});
