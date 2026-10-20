import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  clearOAuthState,
  createSession,
  issueSessionCookies,
  rateLimit,
  requireConfigured,
  verifyOAuthState,
} from '../../server/auth';
import { env, getAdminBaseUrl } from '../../server/env';
import { exchangeCode, getRepoAccess, getUser } from '../../server/github';
import { getClientIp, methodNotAllowed } from '../../server/http';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'GET') {
    methodNotAllowed(res, 'GET');
    return;
  }

  const base = getAdminBaseUrl(req);
  const fail = (code: string): void => {
    clearOAuthState(res);
    res.redirect(302, `${base}/?error=${encodeURIComponent(code)}`);
  };

  try {
    const code = typeof req.query.code === 'string' ? req.query.code : '';
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!code || !state) {
      fail('oauth');
      return;
    }

    const expectedState = verifyOAuthState(req);
    if (state !== expectedState) {
      fail('state');
      return;
    }

    await rateLimit(`login:${getClientIp(req)}`, 20, 3600);
    requireConfigured();
    const accessToken = await exchangeCode(code, `${base}/api/auth/callback`);
    const user = await getUser(accessToken);

    if (String(user.id) !== env.adminGithubId) {
      fail('forbidden');
      return;
    }

    const repo = await getRepoAccess(accessToken);
    if (!repo.permissions?.push) {
      fail('repository');
      return;
    }

    const sessionToken = await createSession(user.id, user.login);
    issueSessionCookies(res, sessionToken);
    clearOAuthState(res);
    res.redirect(302, `${base}/`);
  } catch (error) {
    console.error('[admin] OAuth callback failed:', error instanceof Error ? error.message : error);
    fail('oauth_failed');
  }
}