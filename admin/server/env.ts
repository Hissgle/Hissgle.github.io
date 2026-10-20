/// <reference types="node" />

export const isProduction =
  process.env.NODE_ENV === 'production' ||
  process.env.VERCEL_ENV === 'production' ||
  process.env.VERCEL_ENV === 'preview';

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    throw new Error(`缺少环境变量 ${name}`);
  }
  return value.trim();
}

function trimBase(value: string): string {
  return value.replace(/\/+$/, '');
}

export const env = {
  get githubClientId(): string {
    return requireEnv('GITHUB_OAUTH_CLIENT_ID');
  },
  get githubClientSecret(): string {
    return requireEnv('GITHUB_OAUTH_CLIENT_SECRET');
  },
  get githubToken(): string {
    return requireEnv('GITHUB_CONTENT_TOKEN');
  },
  get repo(): string {
    return (process.env.GITHUB_REPO || 'Hissgle/Hissgle.github.io').trim();
  },
  get branch(): string {
    return (process.env.GITHUB_BRANCH || 'main').trim();
  },
  get adminGithubId(): string {
    return (process.env.ADMIN_GITHUB_ID || '').trim();
  },
  get databaseUrl(): string {
    return requireEnv('DATABASE_URL');
  },
  get sessionSecret(): string {
    return requireEnv('SESSION_SECRET');
  },
  get siteBaseUrl(): string {
    return trimBase(process.env.SITE_BASE_URL || 'https://hissgle.github.io');
  },
  get timezone(): string {
    return (process.env.PUBLISH_TIMEZONE || 'Asia/Shanghai').trim();
  },
};

export function getAdminBaseUrl(req: {
  headers: Record<string, string | string[] | undefined>;
}): string {
  const configured = process.env.ADMIN_BASE_URL;
  if (configured && configured.trim()) return trimBase(configured.trim());

  const protoHeader = req.headers['x-forwarded-proto'];
  const hostHeader = req.headers['x-forwarded-host'] ?? req.headers.host;
  const proto = (Array.isArray(protoHeader) ? protoHeader[0] : protoHeader) || 'http';
  const host = (Array.isArray(hostHeader) ? hostHeader[0] : hostHeader) || 'localhost:3000';
  return `${proto}://${host}`;
}

export function repoOwnerAndName(): { owner: string; repo: string } {
  const [owner, repo] = env.repo.split('/');
  if (!owner || !repo) {
    throw new Error('GITHUB_REPO 必须是 owner/repo 形式');
  }
  return { owner, repo };
}