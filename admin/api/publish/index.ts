import type { VercelRequest, VercelResponse } from '@vercel/node';
import { rateLimit, requireAuth, requireMutation } from '../../server/auth.js';
import { handleError, json, methodNotAllowed, readJson } from '../../server/http.js';
import { publishDraft } from '../../server/publish.js';
import { parseBody, publishInputSchema } from '../../server/validate.js';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    methodNotAllowed(res, 'POST');
    return;
  }

  try {
    const session = await requireAuth(req);
    requireMutation(req);
    await rateLimit(`publish:${session.githubId}`, 30, 3600);

    const input = parseBody(publishInputSchema, await readJson(req));
    const result = await publishDraft({
      draftId: input.draftId,
      githubId: session.githubId,
    });

    json(res, 201, { result });
  } catch (error) {
    handleError(res, error);
  }
}