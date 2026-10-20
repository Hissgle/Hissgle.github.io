import type { VercelRequest, VercelResponse } from '@vercel/node';
import { rateLimit, requireAuth } from '../../server/auth';
import { getPost, listPosts } from '../../server/github';
import { handleError, json, methodNotAllowed, queryString } from '../../server/http';

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
    await rateLimit(`posts:${session.githubId}`, 240, 3600);

    const slug = queryString(req, 'slug');
    if (slug) {
      const post = await getPost(slug);
      if (!post) {
        json(res, 404, { error: '文章不存在' });
        return;
      }
      json(res, 200, { post });
      return;
    }

    json(res, 200, { posts: await listPosts() });
  } catch (error) {
    handleError(res, error);
  }
}