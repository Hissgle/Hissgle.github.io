import { z } from 'zod';
import { ApiError } from './http';
import { formatLocal, normalizeDate } from './time';

export const MAX_ASSET_BYTES = 800 * 1024;
export const MAX_TOTAL_ASSET_BYTES = 3.5 * 1024 * 1024;
export const MAX_ASSETS = 5;
export const MAX_CONTENT_CHARS = 500_000;

const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const slugRe = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const draftInputSchema = z.object({
  id: z.string().regex(uuidRe).optional(),
  title: z.string().max(200).default(''),
  slug: z.string().max(200).nullable().optional(),
  frontMatter: z.record(z.string(), z.unknown()).default({}),
  content: z.string().max(MAX_CONTENT_CHARS).default(''),
  sourcePath: z.string().max(300).nullable().optional(),
});

export const publishInputSchema = z.object({
  draftId: z.string().regex(uuidRe),
});

export const assetInputSchema = z.object({
  draftId: z.string().regex(uuidRe),
  filename: z.string().min(1).max(200),
  mime: z.string().min(1).max(80),
  data: z.string().min(1).max(2_000_000),
});

export type DraftInput = z.infer<typeof draftInputSchema>;

const FORBIDDEN_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export function parseBody<T>(schema: z.ZodType<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new ApiError(
      422,
      '提交的数据不合法',
      result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }
  return result.data;
}

export function cleanJson(value: unknown, depth = 0): unknown {
  if (depth > 5) return null;
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) {
    return value.slice(0, 200).map((item) => cleanJson(item, depth + 1));
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEYS.has(key)) continue;
      if (key.length > 100) continue;
      result[key] = cleanJson(item, depth + 1);
    }
    return result;
  }
  return null;
}

export function normalizeStringArray(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,，]/)
      : [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed.slice(0, 60));
    if (result.length >= 12) break;
  }
  return result;
}

export function normalizeSlug(value: unknown, allowUnicode = false): string | null {
  if (typeof value !== 'string') return null;
  const slug = value.trim();
  if (!slug) return null;

  if (/[/\\]/.test(slug) || slug.includes('..') || slug.length > 200) {
    throw new ApiError(422, 'slug 不合法');
  }

  // 已有文章可能是中文文件名；编辑旧文时原样保留，不能强行改成 ASCII。
  if (allowUnicode) return slug;

  const lower = slug
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!slugRe.test(lower) || lower.length > 80) {
    throw new ApiError(422, 'slug 只能使用小写字母、数字和短横线，最长 80 字符');
  }
  return lower;
}

export function sourcePathForSlug(slug: string): string {
  return `source/_posts/${slug}.md`;
}

export function validateSourcePath(value: unknown, slug: string | null): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new ApiError(422, 'sourcePath 不合法');
  if (!slug) throw new ApiError(422, '编辑旧文时必须提供 slug');
  const expected = sourcePathForSlug(slug);
  if (value !== expected) {
    throw new ApiError(422, 'sourcePath 与 slug 不匹配');
  }
  return value;
}

export function sanitizeFrontMatter(input: Record<string, unknown>): Record<string, unknown> {
  const cleaned = cleanJson(input);
  const source =
    cleaned && typeof cleaned === 'object' && !Array.isArray(cleaned)
      ? (cleaned as Record<string, unknown>)
      : {};

  const result: Record<string, unknown> = { ...source };
  delete result.title;

  result.date = normalizeDate(result.date ?? formatLocal());
  result.tags = normalizeStringArray(result.tags);
  result.categories = normalizeStringArray(result.categories);

  for (const key of ['cover', 'top_img', 'description', 'updated'] as const) {
    const value = result[key];
    if (value === undefined || value === null || value === '') {
      delete result[key];
    } else if (typeof value === 'string') {
      result[key] = value.slice(0, key === 'description' ? 500 : 300);
    } else {
      delete result[key];
    }
  }

  return result;
}

const MIME_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
};

export type ParsedAsset = {
  mime: string;
  extension: string;
  filename: string;
  buffer: Buffer;
  size: number;
};

export function parseAssetInput(input: {
  filename: string;
  mime: string;
  data: string;
}): ParsedAsset {
  const mime = input.mime.toLowerCase().split(';')[0]?.trim() ?? '';
  const extension = MIME_EXT[mime];
  if (!extension) {
    throw new ApiError(422, '只支持 JPG / PNG / WebP / GIF / AVIF 图片');
  }

  const raw = input.data.includes(',') ? input.data.slice(input.data.indexOf(',') + 1) : input.data;
  if (!/^[A-Za-z0-9+/=\s]+$/.test(raw)) {
    throw new ApiError(422, '图片数据不是合法 base64');
  }
  const buffer = Buffer.from(raw, 'base64');
  if (buffer.length === 0) throw new ApiError(422, '图片为空');
  if (buffer.length > MAX_ASSET_BYTES) {
    throw new ApiError(422, '单张图片不能超过 800 KB');
  }

  const base = input.filename
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'image';
  const suffix = Math.random().toString(16).slice(2, 8);
  const filename = `${base}-${suffix}.${extension}`;

  return { mime, extension, filename, buffer, size: buffer.length };
}

export function tempAssetPath(draftId: string, filename: string): string {
  return `/img/drafts/${draftId}/${filename}`;
}

export function finalAssetPath(slug: string, filename: string): string {
  return `/img/posts/${slug}/${filename}`;
}