// Live updates shared by the three portals. Every signed-in browser keeps one
// Server-Sent Events stream open; after any successful change the server sends
// only the names of the data sets that changed (e.g. "templates"), never the
// data itself. Pages then reload what they show, so a template published by the
// Super Admin appears for Admins and Users without a manual reload.

import type { Request, Response, NextFunction } from 'express';
import type { AuthedRequest } from './auth.ts';

export type Topic = 'templates' | 'users' | 'activities' | 'batches' | 'presets' | 'admins';

const clients = new Set<Response>();

export function eventsHandler(req: AuthedRequest, res: Response) {
  if (!req.user) return res.status(401).json({ error: 'Please sign in.' });
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
  req.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
  });
}

export function broadcast(topics: Topic[]) {
  if (!topics.length) return;
  const msg = `event: change\ndata: ${JSON.stringify({ topics })}\n\n`;
  for (const c of clients) c.write(msg);
}

const KEYWORDS: [RegExp, Topic[]][] = [
  [/\/templates\b/, ['templates']],
  [/\/activities\b/, ['activities', 'users']],
  [/\/users\b/, ['users']],
  [/\/batches\b/, ['batches', 'activities', 'users', 'templates']],
  [/\/presets\b/, ['presets']],
  [/\/admins\b/, ['admins']],
  [/\/certificates\b/, ['batches']],
];

/** After every successful change under /api, tell the open portals what changed. */
export function liveChanges(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    const topics = new Set<Topic>();
    for (const [re, t] of KEYWORDS) if (re.test(req.path)) t.forEach((x) => topics.add(x));
    broadcast([...topics]);
  });
  next();
}
