import { env } from './env.js';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/;

export function formatLocal(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: env.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? '00';

  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`;
}

export function normalizeDate(value: unknown): string {
  if (typeof value === 'string') {
    const match = DATE_RE.exec(value.trim());
    if (match) {
      const [, year, month, day, hour, minute, second] = match;
      return `${year}-${month}-${day} ${hour}:${minute}:${second ?? '00'}`;
    }
  }
  return formatLocal();
}

export function dateParts(value: unknown): { year: string; month: string; day: string } {
  const normalized = normalizeDate(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(normalized);
  if (!match) {
    const fallback = formatLocal().slice(0, 10).split('-');
    return { year: fallback[0] ?? '1970', month: fallback[1] ?? '01', day: fallback[2] ?? '01' };
  }
  return { year: match[1] ?? '1970', month: match[2] ?? '01', day: match[3] ?? '01' };
}

export function permalinkFor(date: unknown, slug: string): string {
  const { year, month, day } = dateParts(date);
  return `/${year}/${month}/${day}/${encodeURIComponent(slug)}/`;
}

export function isDateLike(value: string): boolean {
  return DATE_RE.test(value.trim());
}