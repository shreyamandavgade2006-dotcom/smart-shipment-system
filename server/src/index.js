import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import mongoose from 'mongoose';
import { config } from './config.js';
import { connectDB } from './db.js';
import { seedIfEmpty } from './seed.js';
import { notFound, errorHandler } from './middleware/error.js';

import authRoutes from './routes/auth.js';
import shipmentRoutes from './routes/shipments.js';
import exceptionRoutes from './routes/exceptions.js';
import dashboardRoutes from './routes/dashboard.js';
import notificationRoutes from './routes/notifications.js';
import userRoutes from './routes/users.js';
import trackRoutes from './routes/track.js';
import assistantRoutes from './routes/assistant.js';
import auditRoutes from './routes/audit.js';
import integrationRoutes from './routes/integrations.js';
import rulesRoutes from './routes/rules.js';
import { startRulesScheduler } from './services/rules.js';
import { carrierProviderInfo } from './services/carrier.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const mode = await connectDB(config.mongoUri);
  await seedIfEmpty();

  const app = express();
  app.use(cors());
  // Carrier webhook needs the RAW body for HMAC signature verification —
  // mount before the JSON body parser.
  app.use('/api/integrations/carrier-webhook', express.raw({ type: '*/*', limit: '256kb' }));
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', (req, res) =>
    res.json({
      ok: true,
      db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
      dbMode: mode,
      ai: config.geminiKey ? `gemini (${config.geminiModel})` : 'fallback (no API key)',
      rules: { sweepEnabled: config.rulesSweepEnabled, intervalMin: config.rulesSweepIntervalMin },
      carrier: { provider: carrierProviderInfo().provider, webhook: '/api/integrations/carrier-webhook', secret: config.carrierWebhookSecret ? 'set' : 'missing' },
      notifications: { webhookChannel: config.notificationWebhookUrl ? 'configured' : 'not configured (skipped)' },
      time: new Date().toISOString(),
    })
  );

  app.use('/api/auth', authRoutes);
  app.use('/api/shipments', shipmentRoutes);
  app.use('/api/exceptions', exceptionRoutes);
  app.use('/api/dashboard', dashboardRoutes);
  app.use('/api/notifications', notificationRoutes);
  app.use('/api/users', userRoutes);
  app.use('/api/track', trackRoutes);
  app.use('/api/assistant', assistantRoutes);
  app.use('/api/audit', auditRoutes);
  app.use('/api/integrations', integrationRoutes);
  app.use('/api/rules', rulesRoutes);

  app.use('/api', notFound);

  // Serve the built React client (production mode) with SPA fallback.
  const dist = path.join(__dirname, '..', '..', 'client', 'dist');
  if (fs.existsSync(dist)) {
    app.use(express.static(dist));
    app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
  } else {
    app.get('/', (req, res) =>
      res.json({ message: 'SmartShip API running. Client build not found — run `npm run build` in ./client (or use the Vite dev server).' })
    );
  }

  app.use(errorHandler);

  app.listen(config.port, '0.0.0.0', () => {
    console.log(`[server] SmartShip API + client running on http://0.0.0.0:${config.port}`);
    startRulesScheduler();
  });
}

main().catch((err) => {
  console.error('Fatal startup error:', err);
  process.exit(1);
});
