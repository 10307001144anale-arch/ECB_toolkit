// CertiGen server: REST API + SQLite database + Vite (dev) or static build (prod).
//
//   npm run dev    -> development with hot reload
//   npm run build  -> build the frontend into dist/
//   npm start      -> production server (serves dist/)

import express from 'express';
import dotenv from 'dotenv';
import path from 'node:path';
import fs from 'node:fs';
import http from 'node:http';
import { fileURLToPath } from 'node:url';

dotenv.config();

const isProd = process.env.NODE_ENV === 'production' || process.argv.includes('--production');
if (isProd) process.env.NODE_ENV = 'production';

// Imported after dotenv so DATA_DIR / APP_SECRET are available.
const { db, logActivity } = await import('./server/db.ts');
const { sessionMiddleware, guestMiddleware, createUser, passwordProblem, purgeExpiredSessions } = await import('./server/auth.ts');
const { csrfGuard, errorHandler, securityHeaders } = await import('./server/http.ts');
const { authRouter } = await import('./server/routes/auth.ts');
const { adminRouter } = await import('./server/routes/admin.ts');
const { clientRouter } = await import('./server/routes/client.ts');
const { publicRouter, filesRouter } = await import('./server/routes/public.ts');
const { microsoftRouter } = await import('./server/routes/microsoft.ts');
const { aiRouter } = await import('./server/routes/ai.ts');
const { googleRouter } = await import('./server/routes/google.ts');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Creates the first administrator from ADMIN_EMAIL / ADMIN_PASSWORD when no admin exists. */
function bootstrapAdmin() {
  const hasAdmin = db.prepare("SELECT 1 FROM users WHERE role = 'admin' LIMIT 1").get();
  if (hasAdmin) return;
  const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || !password) {
    console.warn(
      '\n  No administrator account exists yet.\n' +
        '  Set ADMIN_EMAIL and ADMIN_PASSWORD in .env and restart, or run:\n' +
        '    npm run create-admin -- you@example.org "Your Name"\n'
    );
    return;
  }
  const problem = passwordProblem(password);
  if (problem) {
    console.warn(`  ADMIN_PASSWORD rejected: ${problem}`);
    return;
  }
  const u = createUser({ email, name: process.env.ADMIN_NAME || 'Administrator', password, role: 'admin' });
  logActivity(u.id, 'admin_bootstrapped', email);
  console.log(`  Created administrator account ${email}. You can remove ADMIN_PASSWORD from .env now.`);
}

async function start() {
  bootstrapAdmin();
  purgeExpiredSessions();
  setInterval(purgeExpiredSessions, 60 * 60 * 1000).unref();

  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY === 'true' ? 1 : process.env.TRUST_PROXY);
  app.disable('x-powered-by');

  app.use(securityHeaders(isProd));
  app.use('/api', express.json({ limit: '25mb' }));
  app.use('/api', sessionMiddleware);
  app.use('/api', csrfGuard);
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', authRouter);
  app.use('/api/admin/ai', aiRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/client', guestMiddleware, clientRouter);
  // Spreadsheet integrations: signed-in clients use their account, everyone else their anonymous browser.
  const integrationAccess = (req: any, res: any, next: any) => (req.user?.role === 'client' || req.path === '/callback' ? next() : guestMiddleware(req, res, next));
  app.use('/api/integrations/microsoft', integrationAccess, microsoftRouter);
  app.use('/api/integrations/google', integrationAccess, googleRouter);
  app.use('/api/public', publicRouter);
  app.use('/api/files', (req: any, res, next) => (req.user ? next() : guestMiddleware(req, res, next)));
  app.use('/api', filesRouter); // /api/files/:id
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use('/api', errorHandler);

  const httpServer = http.createServer(app);
  if (process.env.API_ONLY === 'true') {
    // API only (used by automated tests); no frontend is served.
  } else if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    // Live reload shares the app's own port, so it never clashes with another running copy.
    const vite = await createViteServer({ server: { middlewareMode: true, hmr: { server: httpServer } }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const dist = path.resolve(__dirname, 'dist');
    if (!fs.existsSync(path.join(dist, 'index.html'))) {
      console.error('dist/index.html not found. Run "npm run build" first.');
      process.exit(1);
    }
    app.use(express.static(dist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    const url = `http://localhost:${PORT}`;
    console.log(`CertiGen running at ${url} (${isProd ? 'production' : 'development'})`);
    if (process.argv.includes('--open')) openBrowser(`${url}/app`);
  });
}

/** Opens the default browser (used by `npm run dev`). */
async function openBrowser(url: string) {
  const { exec } = await import('node:child_process');
  const cmd = process.platform === 'win32' ? `start "" "${url}"` : process.platform === 'darwin' ? `open "${url}"` : `xdg-open "${url}"`;
  exec(cmd, () => {});
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
