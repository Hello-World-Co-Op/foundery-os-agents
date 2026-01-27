import dotenv from 'dotenv';

dotenv.config();

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3001', 10),
    nodeEnv: process.env.NODE_ENV || 'development',
  },
  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: 'claude-sonnet-4-20250514',
    maxTokens: 4096,
  },
  ic: {
    host: process.env.IC_HOST || 'http://127.0.0.1:4943',
    founderyOsCoreCanisterId: process.env.FOUNDERY_OS_CORE_CANISTER_ID || '',
    authServiceCanisterId: process.env.AUTH_SERVICE_CANISTER_ID || '',
  },
  websocket: {
    port: parseInt(process.env.WS_PORT || '3002', 10),
  },
  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(','),
  },
};

export function validateConfig(): void {
  if (!config.anthropic.apiKey) {
    console.warn('Warning: ANTHROPIC_API_KEY not set. Agent features will be disabled.');
  }
}
