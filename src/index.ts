import express from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import { config, validateConfig } from './config/index.js';
import { invokeRouter } from './routes/invoke.js';
import { chatRouter } from './routes/chat.js';
import { partyModeRouter } from './routes/party-mode.js';
import { proposalExtractRouter } from './routes/proposal-extract.js';

// Validate configuration
validateConfig();

const app = express();

// Middleware
app.use(cors({
  origin: config.cors.origins,
  credentials: true,
}));
app.use(bodyParser.json());

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
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: config.server.nodeEnv === 'development' ? err.message : 'An error occurred',
  });
});

// Start server
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

export { app };
