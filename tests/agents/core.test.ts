import { describe, it, expect, beforeAll } from 'vitest';
import { loadPersona, listPersonas, listPersonasByCategory, getPersonaCategory } from '../../src/agents/persona-loader.js';
import { agentRegistry, getAgentDefinition, getAgentsByCategory, AgentCategory, getAllAgentIds } from '../../src/agents/registry.js';

const CORE_AGENT_IDS = [
  'aurora-forester',
  'winston',
  'john',
  'amelia',
  'bob',
  'marcus',
  'elena',
  'sophie',
  'tea',
  'mary',
];

describe('Core Team Agents', () => {
  describe('Agent Registry', () => {
    it('should have all 10 core agents registered', () => {
      const coreAgents = getAgentsByCategory(AgentCategory.CORE);
      expect(coreAgents).toHaveLength(10);
    });

    it.each(CORE_AGENT_IDS)('should have %s registered in the registry', (agentId) => {
      expect(agentRegistry.has(agentId)).toBe(true);
    });

    it.each(CORE_AGENT_IDS)('should have definition for %s with required fields', (agentId) => {
      const definition = getAgentDefinition(agentId);
      expect(definition).toBeDefined();
      expect(definition!.id).toBe(agentId);
      expect(definition!.name).toBeTruthy();
      expect(definition!.category).toBe(AgentCategory.CORE);
      expect(definition!.personaFile).toMatch(/^core\/.+\.md$/);
      expect(definition!.description).toBeTruthy();
      expect(definition!.icon).toBeTruthy();
      expect(definition!.capabilities).toBeInstanceOf(Array);
      expect(definition!.capabilities.length).toBeGreaterThan(0);
    });

    it('should return correct agents when filtering by CORE category', () => {
      const coreAgents = getAgentsByCategory(AgentCategory.CORE);
      const ids = coreAgents.map(a => a.id);

      for (const expectedId of CORE_AGENT_IDS) {
        expect(ids).toContain(expectedId);
      }
    });

    it('should have unique icons for each core agent', () => {
      const coreAgents = getAgentsByCategory(AgentCategory.CORE);
      const icons = coreAgents.map(a => a.icon);
      const uniqueIcons = new Set(icons);
      expect(uniqueIcons.size).toBe(icons.length);
    });
  });

  describe('Persona Loader', () => {
    it.each(CORE_AGENT_IDS)('should load persona for %s correctly', async (agentId) => {
      const persona = await loadPersona(agentId);
      expect(persona).not.toBeNull();
      expect(persona!.id).toBe(agentId);
      expect(persona!.name).toBeTruthy();
      expect(persona!.systemPrompt).toBeTruthy();
    });

    it.each(CORE_AGENT_IDS)('should have name, role, and systemPrompt for %s', async (agentId) => {
      const persona = await loadPersona(agentId);
      expect(persona).not.toBeNull();
      expect(persona!.name).toBeTruthy();
      expect(persona!.role).toBeTruthy();
      expect(persona!.systemPrompt).toBeTruthy();
      expect(persona!.systemPrompt.length).toBeGreaterThan(100);
    });

    it('should load persona with category hint', async () => {
      const persona = await loadPersona('winston', 'core');
      expect(persona).not.toBeNull();
      expect(persona!.id).toBe('winston');
      expect(persona!.category).toBe('core');
    });

    it('should find persona without category hint (backward compatibility)', async () => {
      const persona = await loadPersona('winston');
      expect(persona).not.toBeNull();
      expect(persona!.id).toBe('winston');
    });

    it('should return null for non-existent persona', async () => {
      const persona = await loadPersona('non-existent-agent');
      expect(persona).toBeNull();
    });
  });

  describe('Persona Category', () => {
    it.each(CORE_AGENT_IDS)('should return "core" category for %s', async (agentId) => {
      const category = await getPersonaCategory(agentId);
      expect(category).toBe('core');
    });

    it('should return null for non-existent persona', async () => {
      const category = await getPersonaCategory('non-existent-agent');
      expect(category).toBeNull();
    });
  });

  describe('List Personas', () => {
    it('should list all core personas', async () => {
      const personas = await listPersonasByCategory('core');
      expect(personas.length).toBeGreaterThanOrEqual(10);

      for (const agentId of CORE_AGENT_IDS) {
        expect(personas).toContain(agentId);
      }
    });

    it('should include core personas in global list', async () => {
      const allPersonas = await listPersonas();

      for (const agentId of CORE_AGENT_IDS) {
        expect(allPersonas).toContain(agentId);
      }
    });
  });

  describe('Aurora Forester Specific', () => {
    it('should have Aurora Forester as A1 team leader', async () => {
      const persona = await loadPersona('aurora-forester');
      expect(persona).not.toBeNull();
      expect(persona!.name).toBe('Aurora Forester');
      expect(persona!.role).toContain('Leader');
    });

    it('should have Aurora registered with correct icon', () => {
      const definition = getAgentDefinition('aurora-forester');
      expect(definition).toBeDefined();
      expect(definition!.icon).toBe('🌲');
    });

    it('should have team orchestration capability', () => {
      const definition = getAgentDefinition('aurora-forester');
      expect(definition).toBeDefined();
      expect(definition!.capabilities).toContain('team-orchestration');
    });
  });

  describe('Icon Frontmatter Loading', () => {
    it.each(CORE_AGENT_IDS)('should load icon from frontmatter for %s', async (agentId) => {
      const persona = await loadPersona(agentId);
      expect(persona).not.toBeNull();
      expect(persona!.icon).toBeTruthy();
    });

    it('should load correct icon for Aurora from frontmatter', async () => {
      const persona = await loadPersona('aurora-forester');
      expect(persona).not.toBeNull();
      expect(persona!.icon).toBe('🌲');
    });

    it('should load correct icon for Winston from frontmatter', async () => {
      const persona = await loadPersona('winston');
      expect(persona).not.toBeNull();
      expect(persona!.icon).toBe('🏛️');
    });
  });
});
