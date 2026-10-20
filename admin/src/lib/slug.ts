import { pinyin } from 'pinyin-pro';

export function slugify(title: string): string {
  const words = pinyin(title, {
    toneType: 'none',
    type: 'array',
    nonZh: 'consecutive',
  })
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');

  if (words) return words;

  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
  ].join('');
  return `post-${stamp}`;
}