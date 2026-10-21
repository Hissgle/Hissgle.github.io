import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { env, getAdminBaseUrl, isProduction } from './env.js';
import { clearCookie, parseCookies, setCookie } from './cookies.js';
import { ApiError, assertSameOrigin } from './http.js';
import { one, query } from './db.js';
import type { Session } from './types.js';

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;
const STATE_TTL_SECONDS = 60 * 10;

export const sessionCookieName = isProduction
  ? '__Host-blog_admin_session'
  : 'blog_admin_session';
export const csrfCookieName = isProduction
  ? '__Host-blog_admin_csrf'
  : 'blog_admin_csrf';
export const stateCookieName = isProduction
  ? '__Host-blog_admin_state'
  : 'blog_admin_state';

const baseCookieOptions = {
  path: '/',
  sameSite: 'Lax' as const,
  secure: isProduction,
};

function hashToken(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function requireConfigured(): void {
  if (!env.adminGithubId) {
    throw new ApiError(500, 'ADMIN_GITHUB_ID 未配置，禁止登录');
  }
}

export async function createSession(githubId: number, login: string): Promise<string> {
  const token = randomToken(32);
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);

  await query('delete from blog_admin.sessions where expires_at < now()');
  await query(
    `insert into blog_admin.sessions
       (token_hash, github_id, github_login, created_at, last_seen_at, expires_at)
     values ($1, $2, $3, now(), now(), $4)
     on conflict (token_hash) do update
       set expires_at = excluded.expires_at, last_seen_at = now()`,
    [tokenHash, githubId, login, expiresAt.toISOString()],
  );

  return token;
}

export async function getSession(req: VercelRequest): Promise<Session | null> {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[sessionCookieName];
  if (!token) return null;

  const row = await one<{
    token_hash: string;
    github_id: number | string;
    github_login: string;
    expires_at: string;
  }>(
    `select token_hash, github_id, github_login, expires_at
       from blog_admin.sessions
      where token_hash = $1 and expires_at > now()`,
    [hashToken(token)],
  );

  if (!row) return null;

  return {
    tokenHash: row.token_hash,
    githubId: Number(row.github_id),
    githubLogin: row.github_login,
    expiresAt: new Date(row.expires_at).toISOString(),
  };
}

export async function requireAuth(req: VercelRequest): Promise<Session> {
  if (!env.adminGithubId) {
    throw new ApiError(500, 'ADMIN_GITHUB_ID 未配置');
  }
  const session = await getSession(req);
  if (!session) throw new ApiError(401, '请先登录');
  if (String(session.githubId) !== env.adminGithubId) {
    throw new ApiError(403, '该账号没有发布权限');
  }
  return session;
}

export async function destroySession(req: VercelRequest): Promise<void> {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[sessionCookieName];
  if (token) {
    await query('delete from blog_admin.sessions where token_hash = $1', [hashToken(token)]);
  }
}

export function issueSessionCookies(res: VercelResponse, token: string): void {
  setCookie(res, sessionCookieName, token, {
    ...baseCookieOptions,
    httpOnly: true,
    maxAge: SESSION_TTL_SECONDS,
  });

  const csrf = randomToken(24);
  setCookie(res, csrfCookieName, csrf, {
    ...baseCookieOptions,
    httpOnly: false,
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearAuthCookies(res: VercelResponse): void {
  clearCookie(res, sessionCookieName, baseCookieOptions);
  clearCookie(res, csrfCookieName, baseCookieOptions);
}

export function getCsrfToken(req: VercelRequest): string {
  return parseCookies(req.headers.cookie)[csrfCookieName] ?? '';
}

export function ensureCsrfCookie(req: VercelRequest, res: VercelResponse): string {
  const existing = getCsrfToken(req);
  if (existing) return existing;

  const csrf = randomToken(24);
  setCookie(res, csrfCookieName, csrf, {
    ...baseCookieOptions,
    httpOnly: false,
    maxAge: SESSION_TTL_SECONDS,
  });
  return csrf;
}

export function requireCsrf(req: VercelRequest): void {
  const header = req.headers['x-csrf-token'];
  const provided = Array.isArray(header) ? header[0] : header;
  const cookie = getCsrfToken(req);
  if (!provided || !cookie || !safeEqual(provided, cookie)) {
    throw new ApiError(403, 'CSRF 校验失败，请刷新页面重试');
  }
}

export function requireMutation(req: VercelRequest): void {
  assertSameOrigin(req);
  requireCsrf(req);
}

function signState(state: string): string {
  return createHmac('sha256', env.sessionSecret).update(state).digest('base64url');
}

export function verifyOAuthState(req: VercelRequest): string {
  const cookies = parseCookies(req.headers.cookie);
  const raw = cookies[stateCookieName];
  if (!raw) throw new ApiError(400, 'OAuth state 已过期，请重新登录');

  const index = raw.lastIndexOf('.');
  if (index <= 0) throw new ApiError(400, 'OAuth state 不合法');
  const state = raw.slice(0, index);
  const signature = raw.slice(index + 1);
  if (!safeEqual(signature, signState(state))) {
    throw new ApiError(400, 'OAuth state 校验失败');
  }
  return state;
}

export function clearOAuthState(res: VercelResponse): void {
  clearCookie(res, stateCookieName, baseCookieOptions);
}

export function buildLoginUrl(req: VercelRequest, state: string): string {
  const redirectUri = `${getAdminBaseUrl(req)}/api/auth/callback`;
  const params = new URLSearchParams({
    client_id: env.githubClientId,
    redirect_uri: redirectUri,
    scope: 'repo',
    state,
    allow_signup: 'false',
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

export function setOAuthStateCookie(res: VercelResponse, state: string): void {
  const value = `${state}.${signState(state)}`;
  setCookie(res, stateCookieName, value, {
    ...baseCookieOptions,
    httpOnly: true,
    maxAge: STATE_TTL_SECONDS,
  });
}

export async function rateLimit(
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<void> {
  const windowMs = windowSeconds * 1000;
  const windowStart = new Date(Math.floor(Date.now() / windowMs) * windowMs).toISOString();
  const rows = await query<{ count: number }>(
    `insert into blog_admin.rate_limits (bucket, window_start, count)
     values ($1, $2, 1)
     on conflict (bucket, window_start)
     do update set count = blog_admin.rate_limits.count + 1
     returning count`,
    [bucket, windowStart],
  );
  if ((rows[0]?.count ?? 0) > limit) {
    throw new ApiError(429, '操作太频繁，请稍后再试');
  }
}