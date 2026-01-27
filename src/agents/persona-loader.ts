import { readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface AgentPersona {
  id: string;
  name: string;
  role: string;
  description: string;
  systemPrompt: string;
  capabilities: string[];
  tags: string[];
}

/**
 * Load a persona from markdown file
 */
export async function loadPersona(agentId: string): Promise<AgentPersona | null> {
  const personaPath = join(__dirname, 'personas', `${agentId}.md`);

  try {
    const content = await readFile(personaPath, 'utf-8');
    return parsePersonaMarkdown(agentId, content);
  } catch {
    console.warn(`Persona not found: ${agentId}`);
    return null;
  }
}

/**
 * Parse persona markdown into structured data
 */
function parsePersonaMarkdown(id: string, content: string): AgentPersona {
  const lines = content.split('\n');

  let name = id;
  let role = '';
  let description = '';
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
  };
}

/**
 * List all available personas
 */
export async function listPersonas(): Promise<string[]> {
  const { readdir } = await import('fs/promises');
  const personasDir = join(__dirname, 'personas');

  try {
    const files = await readdir(personasDir);
    return files
      .filter(f => f.endsWith('.md'))
      .map(f => f.replace('.md', ''));
  } catch {
    return [];
  }
}
