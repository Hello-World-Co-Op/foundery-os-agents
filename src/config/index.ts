import dotenv from 'dotenv';

dotenv.config();

/**
 * Parse and validate CORS origins from environment variable
 * @see FOS-5.6.2 AC-5.6.2.2 - CORS_ORIGINS required in production
 */
function parseCorsOrigins(): string[] {
  const originsEnv = process.env.CORS_ORIGINS;

  // In production, CORS_ORIGINS is required
  if (process.env.NODE_ENV === 'production' && !originsEnv) {
    throw new Error(
      'CORS_ORIGINS environment variable is required in production. ' +
      'Set it to a comma-separated list of allowed origins (e.g., "https://app.example.com,https://staging.example.com")'
    );
  }

  // Default to localhost in development
  const rawOrigins = originsEnv || 'http://localhost:5173';
  const origins = rawOrigins.split(',').map(origin => origin.trim()).filter(Boolean);

  // Validate each origin is a valid URL
  for (const origin of origins) {
    try {
      new URL(origin);
    } catch {
      throw new Error(
        `Invalid CORS origin URL: "${origin}". Each origin must be a valid URL (e.g., "https://example.com")`
      );
    }
  }

  // Warn in development if using localhost default
  if (process.env.NODE_ENV !== 'production' && !originsEnv) {
    console.warn('[WARN] CORS_ORIGINS not set - using localhost default. Set CORS_ORIGINS for production.');
  }

  return origins;
}

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
    origins: parseCorsOrigins(),
  },
};

/**
 * Validate configuration and warn about potential issues
 * @see FOS-5.6.4 AC-5.6.4.1 - Warn if using default port in production (F-13)
 */
export function validateConfig(): void {
  if (!config.anthropic.apiKey) {
    console.warn('Warning: ANTHROPIC_API_KEY not set. Agent features will be disabled.');
  }

  // FOS-5.6.4: Warn if using default port in production
  const DEFAULT_PORT = 3001;
  if (config.server.nodeEnv === 'production' && config.server.port === DEFAULT_PORT && !process.env.PORT) {
    console.warn(
      `[SECURITY] Warning: Using default port ${DEFAULT_PORT} in production. ` +
      'Set the PORT environment variable to a custom port for better security.'
    );
  }
}
