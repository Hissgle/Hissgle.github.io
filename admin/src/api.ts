import type {
  Asset,
  Draft,
  DraftSummary,
  Me,
  PostDetail,
  PostSummary,
  PublishResult,
  PublishStatus,
} from './types';

export class ApiError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

let csrfToken = '';

export function setCsrfToken(token: string | undefined): void {
  csrfToken = token ?? '';
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  if (init.body !== undefined) headers.set('Content-Type', 'application/json');
  if (csrfToken && init.method && init.method !== 'GET') {
    headers.set('X-CSRF-Token', csrfToken);
  }

  let response: Response;
  try {
    response = await fetch(path, {
      ...init,
      headers,
      credentials: 'include',
      cache: 'no-store',
    });
  } catch {
    throw new ApiError(0, '网络连接失败，请检查网络后重试');
  }

  if (response.status === 401 && typeof window !== 'undefined') {
    window.dispatchEvent(new Event('admin:unauthorized'));
  }

  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text.slice(0, 200) };
    }
  }

  if (!response.ok) {
    const body = data as { error?: string; details?: unknown } | null;
    throw new ApiError(
      response.status,
      body?.error || `请求失败（HTTP ${response.status}）`,
      body?.details,
    );
  }

  return data as T;
}

export const api = {
  async me(): Promise<Me> {
    return request<Me>('/api/me');
  },

  async logout(): Promise<void> {
    await request<{ ok: true }>('/api/auth/logout', { method: 'POST' });
  },

  async listDrafts(): Promise<DraftSummary[]> {
    const data = await request<{ drafts: DraftSummary[] }>('/api/drafts');
    return data.drafts;
  },

  async getDraft(id: string): Promise<Draft> {
    const data = await request<{ draft: Draft }>(`/api/drafts?id=${encodeURIComponent(id)}`);
    return data.draft;
  },

  async saveDraft(input: {
    id?: string;
    title: string;
    slug: string | null;
    frontMatter: Record<string, unknown>;
    content: string;
    sourcePath: string | null;
  }): Promise<Draft> {
    const data = await request<{ draft: Draft }>('/api/drafts', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return data.draft;
  },

  async deleteDraft(id: string): Promise<void> {
    await request<{ ok: true }>(`/api/drafts?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async uploadAsset(input: {
    draftId: string;
    filename: string;
    mime: string;
    data: string;
  }): Promise<Asset> {
    const data = await request<{ asset: Asset }>('/api/assets', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return data.asset;
  },

  async deleteAsset(id: string): Promise<void> {
    await request<{ ok: true }>(`/api/assets?id=${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },

  async listPosts(): Promise<PostSummary[]> {
    const data = await request<{ posts: PostSummary[] }>('/api/posts');
    return data.posts;
  },

  async getPost(slug: string): Promise<PostDetail> {
    const data = await request<{ post: PostDetail }>(
      `/api/posts?slug=${encodeURIComponent(slug)}`,
    );
    return data.post;
  },

  async publish(draftId: string): Promise<PublishResult> {
    const data = await request<{ result: PublishResult }>('/api/publish', {
      method: 'POST',
      body: JSON.stringify({ draftId }),
    });
    return data.result;
  },

  async publishStatus(
    sha: string,
    permalink: string,
    title: string,
  ): Promise<PublishStatus> {
    const params = new URLSearchParams({ sha, permalink, title });
    return request<PublishStatus>(`/api/publish/status?${params.toString()}`);
  },
};