import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { commitFiles, parseFrontMatter } from './github.js';

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

describe('commitFiles deletions', () => {
  let treeBody: {
    base_tree: string;
    tree: Array<{ path: string; sha: string | null }>;
  } | null;

  beforeEach(() => {
    process.env.GITHUB_CONTENT_TOKEN = 'test-token';
    process.env.GITHUB_REPO = 'owner/repo';
    process.env.GITHUB_BRANCH = 'main';
    treeBody = null;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith('/git/ref/heads/main')) {
          return jsonResponse({ object: { sha: 'base-sha' } });
        }
        if (url.endsWith('/git/commits/base-sha')) {
          return jsonResponse({ tree: { sha: 'base-tree' } });
        }
        if (url.endsWith('/git/blobs')) {
          return jsonResponse({ sha: 'blob-sha' });
        }
        if (url.endsWith('/git/trees')) {
          treeBody = JSON.parse(String(init?.body)) as typeof treeBody;
          return jsonResponse({ sha: 'new-tree' });
        }
        if (url.endsWith('/git/commits')) {
          return jsonResponse({
            sha: 'new-commit',
            html_url: 'https://github.com/owner/repo/commit/new-commit',
          });
        }
        return new Response('', { status: 200 });
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('writes delete entries with sha null and keeps file updates', async () => {
    const result = await commitFiles(
      [{ path: 'source/_posts/update.md', data: Buffer.from('body') }],
      'post(delete): test',
      [
        'source/_posts/delete.md',
        'source/img/posts/delete/a.png',
        'source/img/posts/delete/a.png',
      ],
    );

    expect(result.sha).toBe('new-commit');
    expect(treeBody?.base_tree).toBe('base-tree');
    expect(treeBody?.tree).toEqual([
      {
        path: 'source/_posts/update.md',
        mode: '100644',
        type: 'blob',
        sha: 'blob-sha',
      },
      {
        path: 'source/_posts/delete.md',
        mode: '100644',
        type: 'blob',
        sha: null,
      },
      {
        path: 'source/img/posts/delete/a.png',
        mode: '100644',
        type: 'blob',
        sha: null,
      },
    ]);
  });

  it('rejects deletions outside the posts/assets directories', async () => {
    await expect(
      commitFiles([], 'post(delete): bad', ['README.md']),
    ).rejects.toThrow('拒绝提交到非法路径');
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}