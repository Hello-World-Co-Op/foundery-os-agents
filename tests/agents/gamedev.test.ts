import { describe, it, expect } from 'vitest';
import { loadPersona, listPersonas, listPersonasByCategory, getPersonaCategory } from '../../src/agents/persona-loader.js';
import { agentRegistry, getAgentDefinition, getAgentsByCategory, AgentCategory, getAllAgents } from '../../src/agents/registry.js';

const GAMEDEV_AGENT_IDS = [
  'victor',
  'luna',
  'rex',
  'diego',
];

describe('Game Development Agents', () => {
  describe('Agent Registry', () => {
    it('should have all 4 gamedev agents registered', () => {
      const gamedevAgents = getAgentsByCategory(AgentCategory.GAMEDEV);
      expect(gamedevAgents).toHaveLength(4);
    });

    it.each(GAMEDEV_AGENT_IDS)('should have %s registered in the registry', (agentId) => {
      expect(agentRegistry.has(agentId)).toBe(true);
    });

    it.each(GAMEDEV_AGENT_IDS)('should have definition for %s with required fields', (agentId) => {
      const definition = getAgentDefinition(agentId);
      expect(definition).toBeDefined();
      expect(definition!.id).toBe(agentId);
      expect(definition!.name).toBeTruthy();
      expect(definition!.category).toBe(AgentCategory.GAMEDEV);
      expect(definition!.personaFile).toMatch(/^gamedev\/.+\.md$/);
      expect(definition!.description).toBeTruthy();
      expect(definition!.icon).toBeTruthy();
      expect(definition!.capabilities).toBeInstanceOf(Array);
      expect(definition!.capabilities.length).toBeGreaterThan(0);
    });

    it('should return correct agents when filtering by GAMEDEV category', () => {
      const gamedevAgents = getAgentsByCategory(AgentCategory.GAMEDEV);
      const ids = gamedevAgents.map(a => a.id);

      for (const expectedId of GAMEDEV_AGENT_IDS) {
        expect(ids).toContain(expectedId);
      }
    });

    it('should have unique icons for each gamedev agent', () => {
      const gamedevAgents = getAgentsByCategory(AgentCategory.GAMEDEV);
      const icons = gamedevAgents.map(a => a.icon);
      const uniqueIcons = new Set(icons);
      expect(uniqueIcons.size).toBe(icons.length);
    });

    it('should have unique icons across ALL agent categories (no collisions with Core, Personal, or Creative)', () => {
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
    it.each(GAMEDEV_AGENT_IDS)('should load persona for %s correctly', async (agentId) => {
      const persona = await loadPersona(agentId);
      expect(persona).not.toBeNull();
      expect(persona!.id).toBe(agentId);
      expect(persona!.name).toBeTruthy();
      expect(persona!.systemPrompt).toBeTruthy();
    });

    it.each(GAMEDEV_AGENT_IDS)('should have name, role, and systemPrompt for %s', async (agentId) => {
      const persona = await loadPersona(agentId);
      expect(persona).not.toBeNull();
      expect(persona!.name).toBeTruthy();
      expect(persona!.role).toBeTruthy();
      expect(persona!.systemPrompt).toBeTruthy();
      expect(persona!.systemPrompt.length).toBeGreaterThan(100);
    });

    it('should load persona with category hint', async () => {
      const persona = await loadPersona('victor', 'gamedev');
      expect(persona).not.toBeNull();
      expect(persona!.id).toBe('victor');
      expect(persona!.category).toBe('gamedev');
    });

    it('should find persona without category hint (searches all categories)', async () => {
      const persona = await loadPersona('diego');
      expect(persona).not.toBeNull();
      expect(persona!.id).toBe('diego');
    });

    it('should return null for non-existent gamedev persona', async () => {
      const persona = await loadPersona('non-existent-gamedev-agent', 'gamedev');
      expect(persona).toBeNull();
    });
  });

  describe('Persona Category', () => {
    it.each(GAMEDEV_AGENT_IDS)('should return "gamedev" category for %s', async (agentId) => {
      const category = await getPersonaCategory(agentId);
      expect(category).toBe('gamedev');
    });
  });

  describe('List Personas', () => {
    it('should list all gamedev personas', async () => {
      const personas = await listPersonasByCategory('gamedev');
      expect(personas.length).toBeGreaterThanOrEqual(4);

      for (const agentId of GAMEDEV_AGENT_IDS) {
        expect(personas).toContain(agentId);
      }
    });

    it('should include gamedev personas in global list', async () => {
      const allPersonas = await listPersonas();

      for (const agentId of GAMEDEV_AGENT_IDS) {
        expect(allPersonas).toContain(agentId);
      }
    });
  });

  describe('Icon Frontmatter Loading', () => {
    it.each(GAMEDEV_AGENT_IDS)('should load icon from frontmatter for %s', async (agentId) => {
      const persona = await loadPersona(agentId);
      expect(persona).not.toBeNull();
      expect(persona!.icon).toBeTruthy();
    });

    it('should load correct icon for Victor from frontmatter', async () => {
      const persona = await loadPersona('victor');
      expect(persona).not.toBeNull();
      expect(persona!.icon).toBe('🏗️');
    });

    it('should load correct icon for Luna from frontmatter', async () => {
      const persona = await loadPersona('luna');
      expect(persona).not.toBeNull();
      expect(persona!.icon).toBe('🎮');
    });

    it('should load correct icon for Rex from frontmatter', async () => {
      const persona = await loadPersona('rex');
      expect(persona).not.toBeNull();
      expect(persona!.icon).toBe('🦖');
    });

    it('should load correct icon for Diego from frontmatter', async () => {
      const persona = await loadPersona('diego');
      expect(persona).not.toBeNull();
      expect(persona!.icon).toBe('🎯');
    });
  });

  describe('Agent-Specific Tests', () => {
    it('should have Victor as Game Architect', async () => {
      const persona = await loadPersona('victor');
      expect(persona).not.toBeNull();
      expect(persona!.name).toBe('Victor');
      expect(persona!.role).toContain('Game Architect');
    });

    it('should have Luna as Game Designer', async () => {
      const persona = await loadPersona('luna');
      expect(persona).not.toBeNull();
      expect(persona!.name).toBe('Luna');
      expect(persona!.role).toContain('Game Designer');
    });

    it('should have Rex as Game Developer', async () => {
      const persona = await loadPersona('rex');
      expect(persona).not.toBeNull();
      expect(persona!.name).toBe('Rex');
      expect(persona!.role).toContain('Game Developer');
    });

    it('should have Diego as Game Scrum Master', async () => {
      const persona = await loadPersona('diego');
      expect(persona).not.toBeNull();
      expect(persona!.name).toBe('Diego');
      expect(persona!.role).toContain('Game Scrum Master');
    });
  });

  describe('Registry Capability Tests', () => {
    it('should have Victor with unity and unreal capabilities (AC-3.4.4.1)', () => {
      const definition = getAgentDefinition('victor');
      expect(definition).toBeDefined();
      expect(definition!.capabilities).toContain('unity');
      expect(definition!.capabilities).toContain('unreal');
      expect(definition!.capabilities).toContain('godot');
      expect(definition!.capabilities).toContain('game-architecture');
    });

    it('should have Luna with mda-framework and player-psychology capabilities (AC-3.4.4.2)', () => {
      const definition = getAgentDefinition('luna');
      expect(definition).toBeDefined();
      expect(definition!.capabilities).toContain('mda-framework');
      expect(definition!.capabilities).toContain('player-psychology');
      expect(definition!.capabilities).toContain('balancing');
    });

    it('should have Rex with gameplay-programming and tdd capabilities (AC-3.4.4.3)', () => {
      const definition = getAgentDefinition('rex');
      expect(definition).toBeDefined();
      expect(definition!.capabilities).toContain('gameplay-programming');
      expect(definition!.capabilities).toContain('tdd');
      expect(definition!.capabilities).toContain('unity');
      expect(definition!.capabilities).toContain('unreal');
      expect(definition!.capabilities).toContain('godot');
      expect(definition!.capabilities).toContain('gdscript');
    });

    it('should have Diego with sprint-planning and velocity-tracking capabilities (AC-3.4.4.4)', () => {
      const definition = getAgentDefinition('diego');
      expect(definition).toBeDefined();
      expect(definition!.capabilities).toContain('sprint-planning');
      expect(definition!.capabilities).toContain('velocity-tracking');
      expect(definition!.capabilities).toContain('scrum');
    });
  });
});
