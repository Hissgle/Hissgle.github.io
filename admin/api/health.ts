import type { VercelRequest, VercelResponse } from '@vercel/node';
import { query } from '../server/db.js';
import { env } from '../server/env.js';
import { json, methodNotAllowed } from '../server/http.js';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'GET') {
    methodNotAllowed(res, 'GET');
    return;
  }

  let db: 'ok' | 'error' = 'ok';
  try {
    await query('select 1');
  } catch (error) {
    db = 'error';
    console.error('[admin] health db check failed:', error instanceof Error ? error.message : error);
  }

  const configured = {
    oauth: Boolean(process.env.GITHUB_OAUTH_CLIENT_ID && process.env.GITHUB_OAUTH_CLIENT_SECRET),
    githubToken: Boolean(process.env.GITHUB_CONTENT_TOKEN),
    adminId: Boolean(env.adminGithubId),
    database: Boolean(process.env.DATABASE_URL),
    sessionSecret: Boolean(process.env.SESSION_SECRET),
  };

  json(res, db === 'ok' ? 200 : 503, {
    ok: db === 'ok',
    service: 'myblog-admin',
    db,
    configured,
  });
}