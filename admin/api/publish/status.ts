import type { VercelRequest, VercelResponse } from '@vercel/node';
import { rateLimit, requireAuth } from '../../server/auth.js';
import { getRunForCommit, isLive } from '../../server/github.js';
import {
  handleError,
  json,
  methodNotAllowed,
  queryString,
} from '../../server/http.js';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'GET') {
    methodNotAllowed(res, 'GET');
    return;
  }

  try {
    const session = await requireAuth(req);
    await rateLimit(`status:${session.githubId}`, 600, 3600);

    const sha = queryString(req, 'sha');
    const permalink = queryString(req, 'permalink');
    const title = queryString(req, 'title');

    if (!sha || !/^[0-9a-f]{7,40}$/i.test(sha)) {
      json(res, 422, { error: 'commit SHA 不合法' });
      return;
    }
    if (!permalink || !permalink.startsWith('/') || permalink.includes('//')) {
      json(res, 422, { error: 'permalink 不合法' });
      return;
    }

    const run = await getRunForCommit(sha);
    if (!run) {
      json(res, 200, { state: 'queued' });
      return;
    }

    if (run.status !== 'completed') {
      json(res, 200, {
        state: 'building',
        runUrl: run.html_url,
        status: run.status,
      });
      return;
    }

    if (run.conclusion === 'success') {
      const live = title ? await isLive(permalink, title) : true;
      json(res, 200, {
        state: live ? 'live' : 'deploying',
        runUrl: run.html_url,
        conclusion: run.conclusion,
      });
      return;
    }

    json(res, 200, {
      state: 'failed',
      runUrl: run.html_url,
      conclusion: run.conclusion,
    });
  } catch (error) {
    handleError(res, error);
  }
}