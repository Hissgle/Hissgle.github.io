import type { ServerResponse } from 'node:http';

export type CookieOptions = {
  maxAge?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Lax' | 'Strict' | 'None';
  path?: string;
};

export function parseCookies(header: string | undefined): Record<string, string> {
  const result: Record<string, string> = {};
  if (!header) return result;

  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index < 0) continue;
    const name = part.slice(0, index).trim();
    if (!name) continue;
    const raw = part.slice(index + 1).trim();
    try {
      result[name] = decodeURIComponent(raw);
    } catch {
      result[name] = raw;
    }
  }
  return result;
}

export function serializeCookie(name: string, value: string, options: CookieOptions = {}): string {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  parts.push(`Path=${options.path ?? '/'}`);
  if (options.maxAge !== undefined) parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join('; ');
}

export function appendSetCookie(res: ServerResponse, cookie: string): void {
  const current = res.getHeader('Set-Cookie');
  const list = Array.isArray(current)
    ? current.map(String)
    : current
      ? [String(current)]
      : [];
  res.setHeader('Set-Cookie', [...list, cookie]);
}

export function setCookie(
  res: ServerResponse,
  name: string,
  value: string,
  options: CookieOptions = {},
): void {
  appendSetCookie(res, serializeCookie(name, value, options));
}

export function clearCookie(res: ServerResponse, name: string, options: CookieOptions = {}): void {
  appendSetCookie(
    res,
    serializeCookie(name, '', { ...options, maxAge: 0 }),
  );
}