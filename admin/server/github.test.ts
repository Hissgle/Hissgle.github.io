import { describe, expect, it } from 'vitest';
import { parseFrontMatter } from './github.js';

describe('front matter parsing', () => {
  it('parses the existing Hexo format without turning dates into Date objects', () => {
    const text = [
      '---',
      'title: 本站创建方案',
      'date: 2026-09-20 17:45:21',
      'tags: 技术随笔',
      'cover: /img/cover4.jpg',
      '---',
      '',
      '正文内容',
    ].join('\n');

    const parsed = parseFrontMatter(text);
    expect(parsed.data.title).toBe('本站创建方案');
    expect(parsed.data.date).toBe('2026-09-20 17:45:21');
    expect(parsed.data.tags).toBe('技术随笔');
    expect(parsed.content.trim()).toBe('正文内容');
  });

  it('parses arrays and quoted titles', () => {
    const text = [
      '---',
      'title: "标题: 带冒号"',
      'tags:',
      '  - 技术随笔',
      '  - JavaScript',
      '---',
      'body',
    ].join('\n');

    const parsed = parseFrontMatter(text);
    expect(parsed.data.title).toBe('标题: 带冒号');
    expect(parsed.data.tags).toEqual(['技术随笔', 'JavaScript']);
  });
});