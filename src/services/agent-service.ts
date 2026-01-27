import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config/index.js';
import { loadPersona, type AgentPersona } from '../agents/persona-loader.js';

export interface AgentInvocation {
  agentId: string;
  userId: string;
  message: string;
  context?: Record<string, unknown>;
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
}

export interface AgentResponse {
  agentId: string;
  message: string;
  metadata?: Record<string, unknown>;
}

export interface StreamingAgentResponse {
  agentId: string;
  chunk: string;
  isComplete: boolean;
}

class AgentService {
  private client: Anthropic | null = null;
  private personas: Map<string, AgentPersona> = new Map();

  constructor() {
    if (config.anthropic.apiKey) {
      this.client = new Anthropic({
        apiKey: config.anthropic.apiKey,
      });
    }
  }

  /**
   * Get or load an agent persona
   */
  async getPersona(agentId: string): Promise<AgentPersona | null> {
    if (this.personas.has(agentId)) {
      return this.personas.get(agentId)!;
    }

    const persona = await loadPersona(agentId);
    if (persona) {
      this.personas.set(agentId, persona);
    }
    return persona;
  }

  /**
   * Invoke an agent with a message
   */
  async invoke(invocation: AgentInvocation): Promise<AgentResponse> {
    if (!this.client) {
      return {
        agentId: invocation.agentId,
        message: 'Agent service not configured. Please set ANTHROPIC_API_KEY.',
      };
    }

    const persona = await this.getPersona(invocation.agentId);
    if (!persona) {
      return {
        agentId: invocation.agentId,
        message: `Unknown agent: ${invocation.agentId}`,
      };
    }

    const systemPrompt = this.buildSystemPrompt(persona, invocation.context);
    const messages = this.buildMessages(invocation);

    try {
      const response = await this.client.messages.create({
        model: config.anthropic.model,
        max_tokens: config.anthropic.maxTokens,
        system: systemPrompt,
        messages,
      });

      const content = response.content[0];
      const message = content.type === 'text' ? content.text : '';

      return {
        agentId: invocation.agentId,
        message,
        metadata: {
          usage: response.usage,
          stopReason: response.stop_reason,
        },
      };
    } catch (error) {
      console.error('Agent invocation error:', error);
      return {
        agentId: invocation.agentId,
        message: `Error invoking agent: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Stream an agent response
   */
  async *invokeStream(
    invocation: AgentInvocation
  ): AsyncGenerator<StreamingAgentResponse> {
    if (!this.client) {
      yield {
        agentId: invocation.agentId,
        chunk: 'Agent service not configured. Please set ANTHROPIC_API_KEY.',
        isComplete: true,
      };
      return;
    }

    const persona = await this.getPersona(invocation.agentId);
    if (!persona) {
      yield {
        agentId: invocation.agentId,
        chunk: `Unknown agent: ${invocation.agentId}`,
        isComplete: true,
      };
      return;
    }

    const systemPrompt = this.buildSystemPrompt(persona, invocation.context);
    const messages = this.buildMessages(invocation);

    try {
      const stream = this.client.messages.stream({
        model: config.anthropic.model,
        max_tokens: config.anthropic.maxTokens,
        system: systemPrompt,
        messages,
      });

      for await (const event of stream) {
        if (event.type === 'content_block_delta') {
          const delta = event.delta;
          if ('text' in delta) {
            yield {
              agentId: invocation.agentId,
              chunk: delta.text,
              isComplete: false,
            };
          }
        }
      }

      yield {
        agentId: invocation.agentId,
        chunk: '',
        isComplete: true,
      };
    } catch (error) {
      console.error('Agent stream error:', error);
      yield {
        agentId: invocation.agentId,
        chunk: `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        isComplete: true,
      };
    }
  }

  /**
   * Build system prompt from persona and context
   */
  private buildSystemPrompt(
    persona: AgentPersona,
    context?: Record<string, unknown>
  ): string {
    let prompt = persona.systemPrompt;

    if (context) {
      prompt += '\n\n## Context\n';
      prompt += JSON.stringify(context, null, 2);
    }

    return prompt;
  }

  /**
   * Build messages array for Claude API
   */
  private buildMessages(
    invocation: AgentInvocation
  ): Array<{ role: 'user' | 'assistant'; content: string }> {
    const messages: Array<{ role: 'user' | 'assistant'; content: string }> = [];

    if (invocation.conversationHistory) {
      messages.push(...invocation.conversationHistory);
    }

    messages.push({
      role: 'user',
      content: invocation.message,
    });

    return messages;
  }

  /**
   * List available agents
   */
  async listAgents(): Promise<string[]> {
    // Return the list of available agent IDs
    return [
      'winston',
      'john',
      'bob',
      'mary',
      'amelia',
      'marcus',
      'elena',
      'sophie',
      'tea',
      'theo',
    ];
  }
}

export const agentService = new AgentService();
