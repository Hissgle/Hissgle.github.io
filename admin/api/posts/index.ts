import type { VercelRequest, VercelResponse } from '@vercel/node';
import { rateLimit, requireAuth, requireMutation } from '../../server/auth.js';
import { deletePublishedPost } from '../../server/delete.js';
import { getPost, listPosts } from '../../server/github.js';
import { handleError, json, methodNotAllowed, queryString } from '../../server/http.js';

export default async function handler(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  try {
    const session = await requireAuth(req);

    if (req.method === 'GET') {
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
      return;
    }

    if (req.method === 'DELETE') {
      requireMutation(req);
      await rateLimit(`delete-post:${session.githubId}`, 20, 3600);

      const slug = queryString(req, 'slug');
      if (!slug) {
        json(res, 422, { error: '缺少文章 slug' });
        return;
      }

      const result = await deletePublishedPost({
        slug,
        githubId: session.githubId,
      });
      json(res, 200, { result });
      return;
    }

    methodNotAllowed(res, 'GET, DELETE');
  } catch (error) {
    handleError(res, error);
  }
}