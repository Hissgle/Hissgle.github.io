export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(date)
    .replace(/\//g, '-');
}

export function relativeTime(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const diff = date.getTime() - Date.now();
  const abs = Math.abs(diff);
  const formatter = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' });

  if (abs < 60_000) return '刚刚';
  if (abs < 3_600_000) return formatter.format(Math.round(diff / 60_000), 'minute');
  if (abs < 86_400_000) return formatter.format(Math.round(diff / 3_600_000), 'hour');
  if (abs < 2_592_000_000) return formatter.format(Math.round(diff / 86_400_000), 'day');
  return formatter.format(Math.round(diff / 2_592_000_000), 'month');
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function nowInputValue(): string {
  const date = new Date();
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

export function dateToInputValue(value: unknown): string {
  if (typeof value !== 'string') return nowInputValue();
  const match = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(value.trim());
  if (!match) return nowInputValue();
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}`;
}

export function inputValueToDate(value: string): string {
  const normalized = value.trim();
  if (!normalized) return '';
  return normalized.length === 16 ? `${normalized.replace('T', ' ')}:00` : normalized.replace('T', ' ');
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function absoluteSiteUrl(path: string): string {
  const base = (import.meta.env.VITE_SITE_BASE_URL as string | undefined)?.replace(/\/+$/, '') ||
    'https://hissgle.github.io';
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}