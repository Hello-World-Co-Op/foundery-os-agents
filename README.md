# FounderyOS Agent Service

AI-powered productivity agents for FounderyOS, built with Claude and TypeScript.

## Overview

This service provides the AI agent layer for FounderyOS, enabling users to interact with specialized AI assistants for various tasks. Each agent has a unique persona and expertise area.

## Features

- **Agent Invocation** - Call agents with messages and context
- **Streaming Responses** - Real-time streaming via Server-Sent Events
- **Party Mode** - Multi-agent collaborative discussions
- **10 Core Agents** - Specialized personas for different tasks
- **Extensible Personas** - Add new agents via markdown files

## Available Agents

| Agent | Role | Expertise |
|-------|------|-----------|
| **Winston** | Chief Strategy Officer | Strategy, planning, vision |
| **John** | Senior Software Engineer | Code, architecture, debugging |
| **Bob** | Product Manager | Requirements, user stories, roadmap |
| **Mary** | UX Designer | Design, user experience, accessibility |
| **Amelia** | Data Analyst | Analytics, metrics, insights |
| **Marcus** | DevOps Engineer | Infrastructure, CI/CD, deployment |
| **Elena** | QA Lead | Testing, quality, automation |
| **Sophie** | Technical Writer | Documentation, communication |
| **TEA** | Technical Excellence Advisor | Architecture, best practices |
| **Theo** | Executive Assistant | Productivity, organization |

## Getting Started

### Prerequisites

- Node.js 20+
- npm or pnpm
- Anthropic API key

### Installation

```bash
npm install
```

### Configuration

Copy the environment example and configure:

```bash
cp .env.example .env
```

Required environment variables:
- `ANTHROPIC_API_KEY` - Your Anthropic API key
- `PORT` - Server port (default: 3001)

Authentication environment variables (required for protected endpoints):
- `AUTH_SERVICE_CANISTER_ID` - Auth service canister ID on IC
- `IC_HOST` - IC host URL (default: `https://ic0.app`, use `http://localhost:4943` for local dev)

### Development

```bash
npm run dev
```

### Production

```bash
npm run build
npm run start:prod
```

## API Reference

### Authentication

Protected endpoints require a valid session token from the auth-service canister.

**Authorization Header Format:**
```
Authorization: Bearer <session_token>
```

**Error Responses:**

| Status | Code | Description |
|--------|------|-------------|
| 401 | `MISSING_TOKEN` | No Authorization header provided |
| 401 | `INVALID_TOKEN` | Token is invalid or expired |
| 503 | `AUTH_SERVICE_ERROR` | Unable to validate with auth-service |
| 503 | `AUTH_NOT_CONFIGURED` | AUTH_SERVICE_CANISTER_ID not set (production only) |

All 401 responses include `WWW-Authenticate: Bearer realm="foundery-os-agents"` header.

### Public Endpoints (No Auth Required)

### Health Check

```
GET /health
```

Returns service status.

### List Agents

```
GET /api/agents/list
```

Returns list of available agent IDs.

### Get Agent Details

```
GET /api/agents/:agentId
```

Returns agent persona details.

### Protected Endpoints (Auth Required)

### Invoke Agent

```
POST /api/agents/invoke
Authorization: Bearer <session_token>
Content-Type: application/json

{
  "agentId": "winston",
  "message": "Help me plan our Q1 strategy",
  "context": { "company": "Acme Corp" },
  "conversationHistory": []
}
```

### Chat (Single Response)

```
POST /api/chat
Authorization: Bearer <session_token>
Content-Type: application/json

{
  "agentId": "john",
  "message": "Review this code for me",
  "history": []
}
```

### Chat (Streaming)

```
POST /api/chat/stream
Authorization: Bearer <session_token>
Content-Type: application/json

{
  "agentId": "john",
  "message": "Explain this algorithm",
  "history": []
}
```

Returns Server-Sent Events stream.

### Party Mode (Multi-Agent)

```
POST /api/party-mode/start
Authorization: Bearer <session_token>
Content-Type: application/json

{
  "agentIds": ["winston", "bob", "john"],
  "topic": "Should we prioritize feature X or Y?",
  "maxTurns": 3
}
```

## Adding New Agents

Create a markdown file in `src/agents/personas/`:

```markdown
---
name: Agent Name
role: Agent Role
tags: tag1, tag2, tag3
---

# Agent Name

## Description

Agent description here.

## Capabilities

- Capability 1
- Capability 2

## Instructions

System prompt for the agent.
```

## Architecture

```
src/
├── index.ts              # Express server entry point
├── config/
│   └── index.ts          # Configuration management
├── middleware/
│   └── session-auth.ts   # Session authentication middleware
├── ic/
│   ├── auth-client.ts    # IC agent client for auth-service
│   └── declarations/     # Generated TypeScript from .did files
├── routes/
│   ├── invoke.ts         # Agent invocation endpoints
│   ├── chat.ts           # Chat endpoints
│   ├── party-mode.ts     # Multi-agent endpoints
│   └── route-config.ts   # Auth requirements configuration
├── services/
│   └── agent-service.ts  # Claude API integration
└── agents/
    ├── persona-loader.ts # Persona file loading
    └── personas/         # Agent persona markdown files
```

## Integration

This service integrates with:
- **foundery-os-core** - Data storage canister
- **foundery-os-suite** - User-facing UI
- **auth-service** - Session validation (required for protected endpoints)

## License

Part of the Hello World Co-Op DAO platform.
