import { describe, expect, it } from 'vitest';
import { dump } from 'js-yaml';
import {
  MAX_ASSET_BYTES,
  normalizeSlug,
  parseAssetInput,
  sanitizeFrontMatter,
  sourcePathForSlug,
  tempAssetPath,
} from './validate.js';
import { formatLocal, permalinkFor } from './time.js';

describe('slug', () => {
  it('normalizes new ASCII slugs', () => {
    expect(normalizeSlug(' Hello World ')).toBe('hello-world');
  });

  it('keeps existing Chinese filenames when editing', () => {
    expect(normalizeSlug('本站创建方案', true)).toBe('本站创建方案');
  });

  it('rejects path traversal', () => {
    expect(() => normalizeSlug('../evil', true)).toThrow();
    expect(() => normalizeSlug('a/b', true)).toThrow();
  });

  it('builds the expected source path', () => {
    expect(sourcePathForSlug('hello-world')).toBe('source/_posts/hello-world.md');
  });
});

describe('front matter', () => {
  it('keeps unknown fields and normalizes known ones', () => {
    const raw = JSON.parse(
      '{"title":"标题","tags":"技术随笔, JavaScript","categories":["技术"],"date":"2026-10-20 21:00:00","custom":"keep","__proto__":{"x":1}}',
    ) as Record<string, unknown>;
    const fm = sanitizeFrontMatter(raw);
    expect(fm.title).toBeUndefined();
    expect(fm.tags).toEqual(['技术随笔', 'JavaScript']);
    expect(fm.categories).toEqual(['技术']);
    expect(fm.custom).toBe('keep');
    expect(Object.prototype.hasOwnProperty.call(fm, '__proto__')).toBe(false);
  });

  it('dumps titles containing colons safely', () => {
    const yaml = dump(
      { title: '标题: 测试', date: '2026-10-20 21:00:00', tags: ['a'] },
      { lineWidth: -1, noRefs: true, quoteStyle: 'double' },
    );
    expect(yaml).toContain('"标题: 测试"');
  });
});

describe('assets', () => {
  it('accepts a small PNG and creates a temp path', () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Z5ZkAAAAASUVORK5CYII=',
      'base64',
    );
    const asset = parseAssetInput({
      filename: 'Cover Photo.png',
      mime: 'image/png',
      data: png.toString('base64'),
    });
    expect(asset.mime).toBe('image/png');
    expect(asset.filename.endsWith('.png')).toBe(true);
    expect(asset.size).toBe(png.length);
    expect(tempAssetPath('draft-id', asset.filename)).toContain('/img/drafts/draft-id/');
  });

  it('rejects oversized images', () => {
    const oversized = Buffer.alloc(MAX_ASSET_BYTES + 1).toString('base64');
    expect(() =>
      parseAssetInput({ filename: 'big.png', mime: 'image/png', data: oversized }),
    ).toThrow();
  });

  it('rejects SVG', () => {
    expect(() =>
      parseAssetInput({ filename: 'x.svg', mime: 'image/svg+xml', data: 'PHN2Zz48L3N2Zz4=' }),
    ).toThrow();
  });
});

describe('time', () => {
  it('formats local time in the configured timezone', () => {
    expect(formatLocal(new Date('2026-10-20T13:00:00Z'))).toMatch(
      /^2026-10-20 21:00:00$/,
    );
  });

  it('builds an encoded permalink', () => {
    expect(permalinkFor('2026-10-20 21:00:00', 'hello-world')).toBe(
      '/2026/10/20/hello-world/',
    );
    expect(permalinkFor('2026-10-20 21:00:00', '本站创建方案')).toContain(
      encodeURIComponent('本站创建方案'),
    );
  });
});