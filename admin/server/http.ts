import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isProduction } from './env';

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

export function noStore(res: VercelResponse): void {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
}

export function json(res: VercelResponse, status: number, body: unknown): void {
  noStore(res);
  res.status(status).json(body);
}

export function fail(
  res: VercelResponse,
  status: number,
  message: string,
  details?: unknown,
): void {
  json(res, status, { error: message, ...(details === undefined ? {} : { details }) });
}

export function handleError(res: VercelResponse, error: unknown): void {
  if (error instanceof ApiError) {
    fail(res, error.status, error.message, error.details);
    return;
  }

  // github.ts 的 GitHubError 不直接继承 ApiError，这里做一次友好转换；
  // 不要把 GitHub 的 401 当成应用会话失效，否则前端会莫名跳回登录页。
  if (error instanceof Error && error.name === 'GitHubError') {
    fail(res, 502, `GitHub API：${error.message}`);
    return;
  }

  const message = error instanceof Error ? error.message : String(error);
  console.error('[admin]', message);
  fail(res, 500, '服务器内部错误');
}

export function methodNotAllowed(res: VercelResponse, allow: string): void {
  res.setHeader('Allow', allow);
  fail(res, 405, `只支持 ${allow}`);
}

export function queryString(req: VercelRequest, name: string): string | undefined {
  const value = req.query[name];
  if (typeof value === 'string' && value.trim()) return value.trim();
  return undefined;
}

export async function readJson(req: VercelRequest): Promise<unknown> {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch {
      throw new ApiError(400, '请求体不是合法 JSON');
    }
  }
  if (Buffer.isBuffer(req.body) && req.body.length > 0) {
    try {
      return JSON.parse(req.body.toString('utf8'));
    } catch {
      throw new ApiError(400, '请求体不是合法 JSON');
    }
  }
  return {};
}

export function getOrigin(req: VercelRequest): string | undefined {
  const origin = req.headers.origin;
  if (typeof origin === 'string' && origin.trim()) return origin.trim();
  return undefined;
}

export function assertSameOrigin(req: VercelRequest): void {
  const origin = getOrigin(req);
  const allowed = new Set<string>();

  const configured = process.env.ADMIN_BASE_URL;
  if (configured && configured.trim()) allowed.add(configured.trim().replace(/\/+$/, ''));

  // Vercel 预览域名 / 未显式配置 ADMIN_BASE_URL 时，至少允许当前请求的同源地址。
  const hostHeader = req.headers['x-forwarded-host'] ?? req.headers.host;
  const host = Array.isArray(hostHeader) ? hostHeader[0] : hostHeader;
  const protoHeader = req.headers['x-forwarded-proto'];
  const proto = Array.isArray(protoHeader) ? protoHeader[0] : protoHeader;
  if (host) allowed.add(`${proto || (isProduction ? 'https' : 'http')}://${host}`);

  if (!isProduction) {
    allowed.add('http://localhost:5173');
    allowed.add('http://127.0.0.1:5173');
    allowed.add('http://localhost:3000');
    allowed.add('http://127.0.0.1:3000');
  }

  if (!origin) {
    if (isProduction) throw new ApiError(403, '缺少 Origin 请求头');
    return;
  }
  if (!allowed.has(origin)) {
    throw new ApiError(403, '请求来源不被允许');
  }
}

export function getClientIp(req: VercelRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  const first = Array.isArray(forwarded) ? forwarded[0] : forwarded;
  const ip = (first || req.headers['x-real-ip'] || req.socket?.remoteAddress || 'unknown')
    .toString()
    .split(',')[0]
    ?.trim();
  return (ip || 'unknown').slice(0, 100);
}