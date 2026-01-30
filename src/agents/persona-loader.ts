import { readFile, readdir, stat } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync } from 'fs';
import { AgentCategory, AGENT_CATEGORIES } from './registry.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface AgentPersona {
  id: string;
  name: string;
  role: string;
  description: string;
  systemPrompt: string;
  capabilities: string[];
  tags: string[];
  category?: string;
  icon?: string;
}

/** Re-export AgentCategory as PersonaCategory for backward compatibility */
export type PersonaCategory = AgentCategory;

/**
 * Load a persona from markdown file
 * Searches subdirectories (core, personal, creative, etc.) for the persona
 */
export async function loadPersona(agentId: string, category?: PersonaCategory): Promise<AgentPersona | null> {
  const personasDir = join(__dirname, 'personas');

  // If category provided, try that first
  if (category) {
    const categoryPath = join(personasDir, category, `${agentId}.md`);
    if (existsSync(categoryPath)) {
      try {
        const content = await readFile(categoryPath, 'utf-8');
        return parsePersonaMarkdown(agentId, content, category);
      } catch {
        // Fall through to search all categories
      }
    }
  }

  // Search all category subdirectories
  for (const cat of AGENT_CATEGORIES) {
    const tryPath = join(personasDir, cat, `${agentId}.md`);
    if (existsSync(tryPath)) {
      try {
        const content = await readFile(tryPath, 'utf-8');
        return parsePersonaMarkdown(agentId, content, cat);
      } catch {
        continue;
      }
    }
  }

  // Fallback: try flat directory (backward compatibility)
  const flatPath = join(personasDir, `${agentId}.md`);
  if (existsSync(flatPath)) {
    try {
      const content = await readFile(flatPath, 'utf-8');
      return parsePersonaMarkdown(agentId, content);
    } catch {
      // Fall through
    }
  }

  console.warn(`Persona not found: ${agentId}`);
  return null;
}

/**
 * Get the category for a persona based on its file location
 */
export async function getPersonaCategory(agentId: string): Promise<PersonaCategory | null> {
  const personasDir = join(__dirname, 'personas');

  for (const category of AGENT_CATEGORIES) {
    const tryPath = join(personasDir, category, `${agentId}.md`);
    if (existsSync(tryPath)) {
      return category;
    }
  }

  return null;
}

/**
 * Parse persona markdown into structured data
 */
function parsePersonaMarkdown(id: string, content: string, category?: string): AgentPersona {
  const lines = content.split('\n');

  let name = id;
  let role = '';
  let description = '';
  let icon = '';
  const capabilities: string[] = [];
  const tags: string[] = [];

  // Extract metadata from frontmatter or headers
  let inFrontmatter = false;
  let currentSection = '';

  for (const line of lines) {
    if (line.trim() === '---') {
      inFrontmatter = !inFrontmatter;
      continue;
    }

    if (inFrontmatter) {
      const [key, ...valueParts] = line.split(':');
      const value = valueParts.join(':').trim();

      switch (key.trim().toLowerCase()) {
        case 'name':
          name = value;
          break;
        case 'role':
          role = value;
          break;
        case 'tags':
          tags.push(...value.split(',').map(t => t.trim()));
          break;
        case 'icon':
          icon = value;
          break;
      }
    } else if (line.startsWith('# ')) {
      name = line.substring(2).trim();
    } else if (line.startsWith('## ')) {
      currentSection = line.substring(3).trim().toLowerCase();
    } else if (currentSection === 'description' && line.trim()) {
      description += line.trim() + ' ';
    } else if (currentSection === 'capabilities' && line.startsWith('- ')) {
      capabilities.push(line.substring(2).trim());
    }
  }

  return {
    id,
    name,
    role,
    description: description.trim() || `${name} - AI Assistant`,
    systemPrompt: content,
    capabilities,
    tags,
    category,
    icon: icon || undefined,
  };
}

export interface PersonaInfo {
  id: string;
  category: PersonaCategory | null;
}

/**
 * List all available personas from all subdirectories
 */
export async function listPersonas(): Promise<string[]> {
  const personas = await listPersonasWithCategory();
  return personas.map(p => p.id);
}

/**
 * List all available personas with their category information
 */
export async function listPersonasWithCategory(): Promise<PersonaInfo[]> {
  const personasDir = join(__dirname, 'personas');
  const result: PersonaInfo[] = [];

  // Search all category subdirectories
  for (const category of AGENT_CATEGORIES) {
    const categoryDir = join(personasDir, category);
    try {
      const dirStat = await stat(categoryDir);
      if (dirStat.isDirectory()) {
        const files = await readdir(categoryDir);
        for (const file of files) {
          if (file.endsWith('.md')) {
            result.push({
              id: file.replace('.md', ''),
              category,
            });
          }
        }
      }
    } catch {
      // Directory doesn't exist, skip
    }
  }

  // Also check flat directory for backward compatibility
  try {
    const files = await readdir(personasDir);
    for (const file of files) {
      if (file.endsWith('.md')) {
        const id = file.replace('.md', '');
        // Only add if not already found in a category
        if (!result.some(p => p.id === id)) {
          result.push({ id, category: null });
        }
      }
    }
  } catch {
    // Ignore errors
  }

  return result;
}

/**
 * List personas by category
 */
export async function listPersonasByCategory(category: PersonaCategory): Promise<string[]> {
  const personasDir = join(__dirname, 'personas', category);

  try {
    const files = await readdir(personasDir);
    return files
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''));
  } catch {
    return [];
  }
}
