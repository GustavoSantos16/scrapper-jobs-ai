import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

/**
 * Restrictive CSP for the built UI: only same-origin scripts/requests, no inline scripts,
 * no frames, no plugins. Inline style attributes are allowed (React `style` props).
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export function securityHeaders(app: FastifyInstance): void {
  app.addHook('onSend', async (_req, reply) => {
    reply.header('content-security-policy', CSP);
    reply.header('x-content-type-options', 'nosniff');
    reply.header('x-frame-options', 'DENY');
    reply.header('referrer-policy', 'strict-origin-when-cross-origin');
    reply.header('cross-origin-opener-policy', 'same-origin');
  });
}

/** Serves the built web app (apps/web/dist) with SPA fallback for client routes. */
export async function serveWeb(app: FastifyInstance, distDir: string): Promise<boolean> {
  if (!existsSync(distDir)) return false;
  await app.register(fastifyStatic, { root: distDir, prefix: '/', wildcard: false, index: ['index.html'] });
  app.setNotFoundHandler((req, reply) => {
    if (req.method === 'GET' && !req.url.startsWith('/api/')) return reply.type('text/html').sendFile('index.html');
    return reply.code(404).send({ error: 'not_found' });
  });
  return true;
}
