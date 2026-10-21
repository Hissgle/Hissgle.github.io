import type { VercelRequest, VercelResponse } from '@vercel/node';
import { rateLimit, requireAuth, requireMutation } from '../../server/auth.js';
import { deleteAsset, getAssetRow, insertAsset } from '../../server/drafts.js';
import {
  handleError,
  json,
  methodNotAllowed,
  queryString,
  readJson,
} from '../../server/http.js';
import { assetInputSchema, parseAssetInput, parseBody } from '../../server/validate.js';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  try {
    const session = await requireAuth(req);

    if (req.method === 'GET') {
      const id = queryString(req, 'id');
      if (!id) {
        json(res, 422, { error: '缺少图片 id' });
        return;
      }
      const asset = await getAssetRow(id);
      if (!asset) {
        json(res, 404, { error: '图片不存在' });
        return;
      }
      res.setHeader('Content-Type', asset.mime);
      res.setHeader('Cache-Control', 'private, max-age=3600');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.status(200).send(Buffer.from(asset.data, 'base64'));
      return;
    }

    if (req.method === 'POST') {
      requireMutation(req);
      await rateLimit(`asset:${session.githubId}`, 120, 3600);
      const input = parseBody(assetInputSchema, await readJson(req));
      const parsed = parseAssetInput(input);
      const asset = await insertAsset(input.draftId, parsed);
      json(res, 201, { asset });
      return;
    }

    if (req.method === 'DELETE') {
      requireMutation(req);
      const id = queryString(req, 'id');
      if (!id) {
        json(res, 422, { error: '缺少图片 id' });
        return;
      }
      await deleteAsset(id);
      json(res, 200, { ok: true });
      return;
    }

    methodNotAllowed(res, 'GET, POST, DELETE');
  } catch (error) {
    handleError(res, error);
  }
}