import type { VercelRequest, VercelResponse } from '@vercel/node';
import { destroySession, ensureCsrfCookie, getSession } from '../server/auth.js';
import { env } from '../server/env.js';
import { handleError, json, methodNotAllowed } from '../server/http.js';

function isConfigured(): boolean {
  return Boolean(
    env.adminGithubId &&
      process.env.GITHUB_OAUTH_CLIENT_ID &&
      process.env.GITHUB_OAUTH_CLIENT_SECRET &&
      process.env.GITHUB_CONTENT_TOKEN &&
      process.env.DATABASE_URL &&
      process.env.SESSION_SECRET,
  );
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'GET') {
    methodNotAllowed(res, 'GET');
    return;
  }

  try {
    const configured = isConfigured();
    if (!configured) {
      json(res, 200, { authenticated: false, configured: false });
      return;
    }

    const session = await getSession(req);
    if (!session || String(session.githubId) !== env.adminGithubId) {
      if (session) await destroySession(req);
      json(res, 200, { authenticated: false, configured: true });
      return;
    }

    const csrfToken = ensureCsrfCookie(req, res);
    json(res, 200, {
      authenticated: true,
      configured: true,
      csrfToken,
      user: {
        login: session.githubLogin,
        id: session.githubId,
      },
    });
  } catch (error) {
    handleError(res, error);
  }
}