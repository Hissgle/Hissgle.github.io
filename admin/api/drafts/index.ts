import type { VercelRequest, VercelResponse } from '@vercel/node';
import { rateLimit, requireAuth, requireMutation } from '../../server/auth';
import { deleteDraft, getDraft, listDrafts, saveDraft } from '../../server/drafts';
import {
  handleError,
  json,
  methodNotAllowed,
  queryString,
  readJson,
} from '../../server/http';
import { draftInputSchema, parseBody } from '../../server/validate';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  try {
    const session = await requireAuth(req);

    if (req.method === 'GET') {
      const id = queryString(req, 'id');
      if (id) {
        const draft = await getDraft(id);
        if (!draft) {
          json(res, 404, { error: '草稿不存在' });
          return;
        }
        json(res, 200, { draft });
        return;
      }

      json(res, 200, { drafts: await listDrafts() });
      return;
    }

    if (req.method === 'POST') {
      requireMutation(req);
      await rateLimit(`draft:${session.githubId}`, 4800, 3600);
      const input = parseBody(draftInputSchema, await readJson(req));
      const draft = await saveDraft(input);
      json(res, input.id ? 200 : 201, { draft });
      return;
    }

    if (req.method === 'DELETE') {
      requireMutation(req);
      const id = queryString(req, 'id');
      if (!id) {
        json(res, 422, { error: '缺少草稿 id' });
        return;
      }
      await deleteDraft(id);
      json(res, 200, { ok: true });
      return;
    }

    methodNotAllowed(res, 'GET, POST, DELETE');
  } catch (error) {
    handleError(res, error);
  }
}