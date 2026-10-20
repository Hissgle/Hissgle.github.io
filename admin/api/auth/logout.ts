import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  clearAuthCookies,
  destroySession,
  requireAuth,
  requireMutation,
} from '../../server/auth';
import { handleError, json, methodNotAllowed } from '../../server/http';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  if (req.method !== 'POST') {
    methodNotAllowed(res, 'POST');
    return;
  }

  try {
    await requireAuth(req);
    requireMutation(req);
    await destroySession(req);
    clearAuthCookies(res);
    json(res, 200, { ok: true });
  } catch (error) {
    handleError(res, error);
  }
}