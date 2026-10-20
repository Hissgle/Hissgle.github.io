import type { VercelRequest, VercelResponse } from '@vercel/node';
import { buildLoginUrl, randomToken, setOAuthStateCookie } from '../../server/auth';
import { handleError, methodNotAllowed } from '../../server/http';

export default function handler(req: VercelRequest, res: VercelResponse): void {
  if (req.method !== 'GET') {
    methodNotAllowed(res, 'GET');
    return;
  }

  try {
    if (
      !process.env.GITHUB_OAUTH_CLIENT_ID ||
      !process.env.GITHUB_OAUTH_CLIENT_SECRET ||
      !process.env.SESSION_SECRET
    ) {
      res.redirect(302, '/?error=config');
      return;
    }

    const state = randomToken(24);
    setOAuthStateCookie(res, state);
    res.redirect(302, buildLoginUrl(req, state));
  } catch (error) {
    handleError(res, error);
  }
}