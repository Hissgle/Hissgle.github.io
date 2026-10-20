import { dump } from 'js-yaml';
import { ApiError } from './http';
import {
  getDraft,
  getDraftAssetRows,
  logPublish,
  markPublished,
} from './drafts';
import { commitFiles, getPost } from './github';
import { formatLocal, normalizeDate, permalinkFor } from './time';
import {
  MAX_TOTAL_ASSET_BYTES,
  finalAssetPath,
  sourcePathForSlug,
  tempAssetPath,
} from './validate';

function replaceDeep(value: unknown, from: string, to: string): unknown {
  if (typeof value === 'string') return value.split(from).join(to);
  if (Array.isArray(value)) return value.map((item) => replaceDeep(item, from, to));
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = replaceDeep(item, from, to);
    }
    return result;
  }
  return value;
}

function normalizeTags(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string').map((v) => v.trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value.split(/[,，]/).map((v) => v.trim()).filter(Boolean);
  }
  return [];
}

export type PublishResult = {
  commitSha: string;
  commitUrl: string;
  permalink: string;
  sourcePath: string;
  mode: 'create' | 'update';
};

export async function publishDraft(input: {
  draftId: string;
  githubId: number;
}): Promise<PublishResult> {
  const draft = await getDraft(input.draftId);
  if (!draft) throw new ApiError(404, '草稿不存在');

  const slug = draft.slug;
  if (!slug) throw new ApiError(422, '请先填写 slug（文章 URL）');
  if (!draft.title.trim()) throw new ApiError(422, '请先填写标题');
  if (!draft.content.trim()) throw new ApiError(422, '正文不能为空');

  const desiredPath = sourcePathForSlug(slug);
  if (draft.sourcePath && draft.sourcePath !== desiredPath) {
    throw new ApiError(422, '已发布文章的 slug 不能直接修改');
  }

  const existing = await getPost(slug);
  const mode: 'create' | 'update' = existing ? 'update' : 'create';

  if (mode === 'create' && draft.sourcePath) {
    throw new ApiError(409, '要更新的文章不存在，可能已被删除或改名');
  }
  if (mode === 'update' && !draft.sourcePath) {
    throw new ApiError(409, '这个 slug 已有同名文章，请从「已发布」列表打开编辑');
  }

  const assets = await getDraftAssetRows(draft.id);
  const totalAssetBytes = assets.reduce((sum, asset) => sum + Number(asset.size), 0);
  if (totalAssetBytes > MAX_TOTAL_ASSET_BYTES) {
    throw new ApiError(422, '图片总大小超过 3.5 MB，请减少或压缩图片');
  }

  let content = draft.content;
  let frontMatter: Record<string, unknown> = {
    ...(existing?.frontMatter ?? {}),
    ...draft.frontMatter,
  };

  for (const asset of assets) {
    const from = tempAssetPath(draft.id, asset.filename);
    const to = finalAssetPath(slug, asset.filename);
    content = content.split(from).join(to);
    frontMatter = replaceDeep(frontMatter, from, to) as Record<string, unknown>;
  }

  frontMatter.title = draft.title.trim();
  frontMatter.date = normalizeDate(frontMatter.date ?? formatLocal());
  frontMatter.tags = normalizeTags(frontMatter.tags);
  frontMatter.categories = normalizeTags(frontMatter.categories);
  if (mode === 'update') {
    frontMatter.updated = formatLocal();
  }

  const yaml = dump(frontMatter, {
    lineWidth: -1,
    noRefs: true,
    quoteStyle: 'double',
    sortKeys: false,
  });
  const markdown = `---\n${yaml}---\n\n${content.trim()}\n`;

  const files = [
    { path: desiredPath, data: Buffer.from(markdown, 'utf8') },
    ...assets.map((asset) => ({
      path: `source/img/posts/${slug}/${asset.filename}`,
      data: Buffer.from(asset.data, 'base64'),
    })),
  ];

  const message = `${mode === 'update' ? 'post(update)' : 'post'}: ${draft.title
    .replace(/\s+/g, ' ')
    .slice(0, 120)}`;
  const commit = await commitFiles(files, message);

  // 提交已经成功；数据库记账是辅助操作，失败不应该让用户误以为文章没发出去。
  try {
    await markPublished(draft.id, desiredPath, commit.sha);
    await logPublish({
      draftId: draft.id,
      path: desiredPath,
      commitSha: commit.sha,
      mode,
      githubId: input.githubId,
    });
  } catch (error) {
    console.error(
      '[admin] 文章已提交，但发布记录写入失败:',
      error instanceof Error ? error.message : error,
    );
  }

  return {
    commitSha: commit.sha,
    commitUrl: commit.url,
    permalink: permalinkFor(frontMatter.date, slug),
    sourcePath: desiredPath,
    mode,
  };
}