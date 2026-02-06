import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bodyParser from 'body-parser';
import { config, validateConfig } from './config/index.js';
import { invokeRouter } from './routes/invoke.js';
import { chatRouter } from './routes/chat.js';
import { partyModeRouter } from './routes/party-mode.js';
import { proposalExtractRouter } from './routes/proposal-extract.js';
import { requestId } from './middleware/request-id.js';

// Validate configuration
validateConfig();

const app = express();

// Request ID middleware (FOS-5.6.3 AC-5.6.3.1)
// @see F-8 (security-audit-backend-auth.md) - Use opaque request IDs instead of user IDs
app.use(requestId);

// Security headers middleware (FOS-5.6.2 AC-5.6.2.3)
// @see F-7 (security-audit-backend-auth.md) - No HTTPS/TLS enforcement
app.use(helmet({
  // HSTS: Enforce HTTPS for 1 year, include subdomains, enable preload
  hsts: {
    maxAge: 31536000, // 1 year in seconds
    includeSubDomains: true,
    preload: true,
  },
  // Prevent MIME type sniffing
  xContentTypeOptions: true,
  // Prevent clickjacking
  frameguard: { action: 'deny' },
  // XSS protection (legacy but still useful)
  xssFilter: true,
  // Disable X-Powered-By header
  hidePoweredBy: true,
}));

// CORS middleware
app.use(cors({
  origin: config.cors.origins,
  credentials: true,
}));

// Body parser with size limit (FOS-5.6.4 AC-5.6.4.3 - prevent DoS via large payloads)
app.use(bodyParser.json({ limit: '10mb' }));

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'foundery-os-agents' });
});

// API Routes
app.use('/api/agents', invokeRouter);
app.use('/api/chat', chatRouter);
app.use('/api/party-mode', partyModeRouter);
app.use('/api/proposal-extract', proposalExtractRouter);

// Error handling
// FOS-5.6.4 AC-5.6.4.3: Properly handle PayloadTooLargeError for request size limits
interface HttpError extends Error {
  status?: number;
  statusCode?: number;
  type?: string;
}

app.use((err: HttpError, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  // Handle payload too large errors (413)
  if (err.type === 'entity.too.large' || err.status === 413 || err.statusCode === 413) {
    return res.status(413).json({
      error: 'Payload Too Large',
      message: 'Request body exceeds the maximum allowed size of 10MB',
    });
  }

  console.error('Unhandled error:', err);

  // Preserve HTTP error status codes
  const statusCode = err.status || err.statusCode || 500;

  res.status(statusCode).json({
    error: statusCode >= 500 ? 'Internal server error' : 'Request error',
    message: config.server.nodeEnv === 'development' ? err.message : 'An error occurred',
  });
});

// Export app for testing without starting server
export { app };

// Start server only when this file is run directly (not imported for testing)
// Using import.meta.url check for ESM modules
const isMainModule = process.argv[1]?.endsWith('index.js') || process.argv[1]?.endsWith('index.ts');
if (isMainModule) {
  const port = config.server.port;
  app.listen(port, () => {
    console.log('===========================================');
    console.log(`FounderyOS Agent Service`);
    console.log(`Environment: ${config.server.nodeEnv}`);
    console.log(`Listening on port ${port}`);
    console.log(`API Key configured: ${config.anthropic.apiKey ? 'Yes' : 'No'}`);
    // FOS-5.6.1 (F-3): Warn if auth bypass is enabled
    if (process.env.DEV_SKIP_AUTH === 'true') {
      console.warn('⚠️  WARNING: DEV_SKIP_AUTH=true - Authentication is DISABLED');
      console.warn('⚠️  DO NOT use this setting in production!');
    }
    console.log('===========================================');
  });
}
