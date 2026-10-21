import { ApiError } from './http.js';
import { commitFiles, getPost, listPostImagePaths } from './github.js';
import { logPublish, unlinkDraftsForSourcePath } from './drafts.js';

export type DeletePostResult = {
  commitSha: string;
  commitUrl: string;
  sourcePath: string;
  slug: string;
  deletedImages: number;
};

function commitTitle(title: string): string {
  return title.replace(/\s+/g, ' ').trim().slice(0, 120) || '无标题文章';
}

export async function deletePublishedPost(input: {
  slug: string;
  githubId: number;
}): Promise<DeletePostResult> {
  const post = await getPost(input.slug);
  if (!post) throw new ApiError(404, '文章不存在');

  const imagePaths = await listPostImagePaths(post.slug);
  const commit = await commitFiles(
    [],
    `post(delete): ${commitTitle(post.title)}`,
    [post.path, ...imagePaths],
  );

  // 文章已经从 Git 删除；本地草稿保留内容，但不能再处于「已发布」状态。
  // 数据库记账失败不应该让用户误以为删除没有生效。
  try {
    await unlinkDraftsForSourcePath(post.path);
    await logPublish({
      draftId: null,
      path: post.path,
      commitSha: commit.sha,
      mode: 'delete',
      githubId: input.githubId,
    });
  } catch (error) {
    console.error(
      '[admin] 文章已删除，但删除记录写入失败:',
      error instanceof Error ? error.message : error,
    );
  }

  return {
    commitSha: commit.sha,
    commitUrl: commit.url,
    sourcePath: post.path,
    slug: post.slug,
    deletedImages: imagePaths.length,
  };
}