import matter from 'gray-matter';
import { JSON_SCHEMA, load } from 'js-yaml';
import { env, repoOwnerAndName } from './env.js';
import { ApiError } from './http.js';
import { normalizeDate, permalinkFor } from './time.js';
import type { PostDetail, PostSummary } from './types.js';

const API = 'https://api.github.com';

type GitHubContent = {
  name: string;
  path: string;
  sha: string;
  type: string;
  content?: string;
  encoding?: string;
};

type GitHubRun = {
  id: number;
  status: string;
  conclusion: string | null;
  html_url: string;
  head_sha?: string;
};

type GitHubUser = {
  id: number;
  login: string;
};

type GitHubRepo = {
  private: boolean;
  permissions?: {
    admin?: boolean;
    maintain?: boolean;
    push?: boolean;
    triage?: boolean;
    pull?: boolean;
  };
};

export class GitHubError extends Error {
  readonly status: number;
  readonly body: string;

  constructor(status: number, message: string, body = '') {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    this.body = body.slice(0, 500);
  }
}

function headers(token: string): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'myblog-admin',
  };
}

async function github<T>(
  path: string,
  init: RequestInit = {},
  token: string = env.githubToken,
): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      ...headers(token),
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers as Record<string, string> | undefined),
    },
  });

  const text = await response.text();
  if (!response.ok) {
    let message = `GitHub API ${response.status}`;
    try {
      const parsed = JSON.parse(text) as { message?: string };
      if (parsed.message) message = parsed.message;
    } catch {
      // 保留默认信息
    }
    throw new GitHubError(response.status, message, text);
  }

  if (!text) return null as T;
  return JSON.parse(text) as T;
}

export function encodeRepoPath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

export async function exchangeCode(code: string, redirectUri: string): Promise<string> {
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'myblog-admin',
    },
    body: JSON.stringify({
      client_id: env.githubClientId,
      client_secret: env.githubClientSecret,
      code,
      redirect_uri: redirectUri,
    }),
  });

  const text = await response.text();
  let data: { access_token?: string; error?: string; error_description?: string };
  try {
    data = JSON.parse(text) as typeof data;
  } catch {
    throw new ApiError(502, 'GitHub 返回了无法解析的授权响应');
  }

  if (!response.ok || !data.access_token) {
    throw new ApiError(
      502,
      data.error_description || data.error || 'GitHub 授权失败',
    );
  }
  return data.access_token;
}

export async function getUser(token: string): Promise<GitHubUser> {
  return github<GitHubUser>('/user', {}, token);
}

export async function getRepoAccess(token: string): Promise<GitHubRepo> {
  const { owner, repo } = repoOwnerAndName();
  return github<GitHubRepo>(`/repos/${owner}/${repo}`, {}, token);
}

export function parseFrontMatter(text: string): {
  data: Record<string, unknown>;
  content: string;
} {
  const parsed = matter(text, {
    engines: {
      yaml: (source: string) =>
        (load(source, { schema: JSON_SCHEMA }) as Record<string, unknown>) ?? {},
    },
  });
  return {
    data: parsed.data ?? {},
    content: parsed.content ?? '',
  };
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(/[,，]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function postFromContent(
  slug: string,
  path: string,
  sha: string,
  text: string,
): PostDetail {
  const { data, content } = parseFrontMatter(text);
  const title =
    typeof data.title === 'string' && data.title.trim() ? data.title.trim() : slug;
  const date = normalizeDate(data.date);
  const tags = toStringArray(data.tags);
  const updated =
    typeof data.updated === 'string' ? normalizeDate(data.updated) : undefined;

  const frontMatter = { ...data };
  delete frontMatter.title;

  return {
    slug,
    path,
    sha,
    title,
    date,
    tags,
    updated,
    permalink: permalinkFor(data.date, slug),
    frontMatter,
    content,
  };
}

export async function getPost(slug: string): Promise<PostDetail | null> {
  if (!slug || /[/\\]/.test(slug) || slug.includes('..')) {
    throw new ApiError(422, '文章 slug 不合法');
  }
  const path = `source/_posts/${slug}.md`;
  try {
    const file = await github<GitHubContent>(
      `/repos/${env.repo}/contents/${encodeRepoPath(path)}?ref=${encodeURIComponent(env.branch)}`,
    );
    if (!file.content) return null;
    const text = Buffer.from(file.content, 'base64').toString('utf8');
    return postFromContent(slug, path, file.sha, text);
  } catch (error) {
    if (error instanceof GitHubError && error.status === 404) return null;
    throw error;
  }
}

export async function listPosts(): Promise<PostSummary[]> {
  const entries = await github<GitHubContent[]>(
    `/repos/${env.repo}/contents/${encodeRepoPath('source/_posts')}?ref=${encodeURIComponent(env.branch)}`,
  );

  if (!Array.isArray(entries)) return [];

  const posts: PostSummary[] = [];
  for (const entry of entries) {
    if (entry.type !== 'file' || !entry.name.endsWith('.md')) continue;
    const slug = entry.name.replace(/\.md$/i, '');
    try {
      const post = await getPost(slug);
      if (post) {
        posts.push({
          slug: post.slug,
          path: post.path,
          sha: post.sha,
          title: post.title,
          date: post.date,
          tags: post.tags,
          ...(post.updated ? { updated: post.updated } : {}),
          permalink: post.permalink,
        });
      }
    } catch (error) {
      console.warn(`[admin] 跳过无法解析的文章 ${entry.path}:`, error);
    }
  }

  return posts.sort((a, b) => b.date.localeCompare(a.date));
}

export type CommitFile = {
  path: string;
  data: Buffer;
};

export type CommitResult = {
  sha: string;
  url: string;
};

function assertCommitPath(path: string): void {
  if (
    !/^source\/_posts\/[^/]+\.md$/.test(path) &&
    !/^source\/img\/posts\/[^/]+\/[^/]+$/.test(path)
  ) {
    throw new ApiError(500, `拒绝提交到非法路径：${path}`);
  }
}

async function commitOnce(
  files: CommitFile[],
  message: string,
): Promise<CommitResult> {
  const ref = await github<{ object: { sha: string } }>(
    `/repos/${env.repo}/git/ref/heads/${encodeURIComponent(env.branch)}`,
  );
  const baseSha = ref.object.sha;

  const baseCommit = await github<{ tree: { sha: string } }>(
    `/repos/${env.repo}/git/commits/${baseSha}`,
  );

  const blobs = await Promise.all(
    files.map(async (file) => {
      assertCommitPath(file.path);
      const blob = await github<{ sha: string }>(`/repos/${env.repo}/git/blobs`, {
        method: 'POST',
        body: JSON.stringify({
          content: file.data.toString('base64'),
          encoding: 'base64',
        }),
      });
      return { path: file.path, sha: blob.sha };
    }),
  );

  const tree = await github<{ sha: string }>(`/repos/${env.repo}/git/trees`, {
    method: 'POST',
    body: JSON.stringify({
      base_tree: baseCommit.tree.sha,
      tree: blobs.map((blob) => ({
        path: blob.path,
        mode: '100644',
        type: 'blob',
        sha: blob.sha,
      })),
    }),
  });

  const commit = await github<{ sha: string; html_url: string }>(
    `/repos/${env.repo}/git/commits`,
    {
      method: 'POST',
      body: JSON.stringify({
        message,
        tree: tree.sha,
        parents: [baseSha],
      }),
    },
  );

  await github(`/repos/${env.repo}/git/refs/heads/${encodeURIComponent(env.branch)}`, {
    method: 'PATCH',
    body: JSON.stringify({ sha: commit.sha, force: false }),
  });

  return { sha: commit.sha, url: commit.html_url };
}

export async function commitFiles(
  files: CommitFile[],
  message: string,
): Promise<CommitResult> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      return await commitOnce(files, message);
    } catch (error) {
      lastError = error;
      if (
        error instanceof GitHubError &&
        (error.status === 409 || error.status === 422) &&
        attempt === 0
      ) {
        continue;
      }
      break;
    }
  }
  throw lastError;
}

export async function getRunForCommit(sha: string): Promise<GitHubRun | null> {
  const data = await github<{ workflow_runs: GitHubRun[] }>(
    `/repos/${env.repo}/actions/runs?head_sha=${encodeURIComponent(sha)}&per_page=1`,
  );
  return data.workflow_runs[0] ?? null;
}

export async function getRun(id: number): Promise<GitHubRun> {
  return github<GitHubRun>(`/repos/${env.repo}/actions/runs/${id}`);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function isLive(permalink: string, title: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${env.siteBaseUrl}${permalink}?v=${Date.now()}`,
      { cache: 'no-store' },
    );
    if (!response.ok) return false;
    const html = await response.text();
    return html.includes(title) || html.includes(escapeHtml(title));
  } catch {
    return false;
  }
}