import { randomUUID } from 'node:crypto';
import { one, query } from './db.js';
import { ApiError } from './http.js';
import type {
  AssetDto,
  AssetRow,
  DraftDto,
  DraftRow,
  DraftSummary,
} from './types.js';
import {
  MAX_ASSETS,
  MAX_CONTENT_CHARS,
  MAX_TOTAL_ASSET_BYTES,
  normalizeSlug,
  sanitizeFrontMatter,
  validateSourcePath,
  type DraftInput,
  type ParsedAsset,
  tempAssetPath,
} from './validate.js';

function iso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return value;
  return new Date().toISOString();
}

function parseObject(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignore
    }
  }
  return {};
}

type AssetMeta = Omit<AssetRow, 'data'>;

export function assetDto(row: AssetMeta): AssetDto {
  return {
    id: row.id,
    filename: row.filename,
    mime: row.mime,
    size: Number(row.size),
    tempPath: tempAssetPath(row.draft_id, row.filename),
    url: `/api/assets?id=${encodeURIComponent(row.id)}`,
  };
}

export function draftDto(row: DraftRow, assets: AssetDto[]): DraftDto {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    frontMatter: parseObject(row.front_matter),
    content: row.content,
    sourcePath: row.source_path,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    publishedAt: row.published_at ? iso(row.published_at) : null,
    lastCommitSha: row.last_commit_sha,
    assets,
  };
}

export async function getDraftAssetRows(draftId: string): Promise<AssetRow[]> {
  return query<AssetRow>(
    `select id, draft_id, filename, mime, size, data, created_at
       from blog_admin.draft_assets
      where draft_id = $1
      order by created_at asc`,
    [draftId],
  );
}

export async function getDraftAssets(draftId: string): Promise<AssetDto[]> {
  // 列表/详情只传元数据；base64 图片留给发布时读取，避免每次打开发送几 MB。
  const rows = await query<AssetMeta>(
    `select id, draft_id, filename, mime, size, created_at
       from blog_admin.draft_assets
      where draft_id = $1
      order by created_at asc`,
    [draftId],
  );
  return rows.map(assetDto);
}

export async function getDraft(id: string): Promise<DraftDto | null> {
  const row = await one<DraftRow>(
    `select id, slug, title, front_matter, content, source_path,
            created_at, updated_at, published_at, last_commit_sha
       from blog_admin.drafts
      where id = $1`,
    [id],
  );
  if (!row) return null;
  return draftDto(row, await getDraftAssets(id));
}

export async function listDrafts(): Promise<DraftSummary[]> {
  const rows = await query<
    DraftRow & { asset_count: number | string; excerpt: string }
  >(
    `select d.id, d.slug, d.title, d.front_matter, '' as content, d.source_path,
            d.created_at, d.updated_at, d.published_at, d.last_commit_sha,
            (select count(*)::int from blog_admin.draft_assets a where a.draft_id = d.id) as asset_count,
            substring(d.content, 1, 160) as excerpt
       from blog_admin.drafts d
      order by d.updated_at desc`,
  );

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    frontMatter: parseObject(row.front_matter),
    sourcePath: row.source_path,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
    publishedAt: row.published_at ? iso(row.published_at) : null,
    lastCommitSha: row.last_commit_sha,
    assetCount: Number(row.asset_count),
    excerpt: row.excerpt ?? '',
  }));
}

export async function saveDraft(input: DraftInput): Promise<DraftDto> {
  // 编辑已发布文章时允许中文等已有文件名；新建文章仍要求 ASCII slug。
  const slug = normalizeSlug(input.slug, Boolean(input.sourcePath));
  const sourcePath = validateSourcePath(input.sourcePath, slug);
  const frontMatter = sanitizeFrontMatter(input.frontMatter);
  const title = input.title.trim().slice(0, 200);
  const content = input.content.slice(0, MAX_CONTENT_CHARS);

  if (input.id) {
    const row = await one<DraftRow>(
      `update blog_admin.drafts
          set slug = $2,
              title = $3,
              front_matter = $4::jsonb,
              content = $5,
              source_path = $6,
              updated_at = now()
        where id = $1
        returning id, slug, title, front_matter, content, source_path,
                  created_at, updated_at, published_at, last_commit_sha`,
      [input.id, slug, title, JSON.stringify(frontMatter), content, sourcePath],
    );
    if (!row) throw new ApiError(404, '草稿不存在');
    return draftDto(row, await getDraftAssets(row.id));
  }

  const id = randomUUID();
  try {
    const row = await one<DraftRow>(
      `insert into blog_admin.drafts
         (id, slug, title, front_matter, content, source_path)
       values ($1, $2, $3, $4::jsonb, $5, $6)
       returning id, slug, title, front_matter, content, source_path,
                 created_at, updated_at, published_at, last_commit_sha`,
      [id, slug, title, JSON.stringify(frontMatter), content, sourcePath],
    );
    if (!row) throw new ApiError(500, '草稿创建失败');
    return draftDto(row, []);
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw new ApiError(409, '这个 slug 已经有一份草稿了，请从草稿列表打开');
    }
    throw error;
  }
}

export async function deleteDraft(id: string): Promise<void> {
  const row = await one<{ id: string }>(
    `delete from blog_admin.drafts where id = $1 returning id`,
    [id],
  );
  if (!row) throw new ApiError(404, '草稿不存在');
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}

export async function insertAsset(
  draftId: string,
  asset: ParsedAsset,
): Promise<AssetDto> {
  const draft = await one<{ id: string }>(
    'select id from blog_admin.drafts where id = $1',
    [draftId],
  );
  if (!draft) throw new ApiError(404, '草稿不存在');

  const totals = await one<{ count: number | string; total: number | string }>(
    `select count(*)::int as count, coalesce(sum(size), 0)::bigint as total
       from blog_admin.draft_assets
      where draft_id = $1`,
    [draftId],
  );

  if (Number(totals?.count ?? 0) >= MAX_ASSETS) {
    throw new ApiError(422, `每篇文章最多 ${MAX_ASSETS} 张图片`);
  }
  if (Number(totals?.total ?? 0) + asset.size > MAX_TOTAL_ASSET_BYTES) {
    throw new ApiError(422, '图片总大小超过 3.5 MB，请减少或压缩图片');
  }

  const id = randomUUID();
  const row = await one<AssetRow>(
    `insert into blog_admin.draft_assets
       (id, draft_id, filename, mime, size, data)
     values ($1, $2, $3, $4, $5, $6)
     returning id, draft_id, filename, mime, size, data, created_at`,
    [id, draftId, asset.filename, asset.mime, asset.size, asset.buffer.toString('base64')],
  );
  if (!row) throw new ApiError(500, '图片保存失败');
  return assetDto(row);
}

export async function getAssetRow(id: string): Promise<AssetRow | null> {
  return one<AssetRow>(
    `select id, draft_id, filename, mime, size, data, created_at
       from blog_admin.draft_assets
      where id = $1`,
    [id],
  );
}

export async function deleteAsset(id: string): Promise<void> {
  const row = await one<{ id: string }>(
    `delete from blog_admin.draft_assets where id = $1 returning id`,
    [id],
  );
  if (!row) throw new ApiError(404, '图片不存在');
}

export async function markPublished(
  draftId: string,
  sourcePath: string,
  commitSha: string,
): Promise<void> {
  await query(
    `update blog_admin.drafts
        set source_path = $2,
            published_at = now(),
            last_commit_sha = $3,
            updated_at = now()
      where id = $1`,
    [draftId, sourcePath, commitSha],
  );
}

export async function logPublish(input: {
  draftId: string;
  path: string;
  commitSha: string;
  mode: 'create' | 'update';
  githubId: number;
}): Promise<void> {
  await query(
    `insert into blog_admin.publish_log (draft_id, path, commit_sha, mode, github_id)
     values ($1, $2, $3, $4, $5)`,
    [input.draftId, input.path, input.commitSha, input.mode, input.githubId],
  );
}