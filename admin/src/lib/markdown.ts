import DOMPurify from 'dompurify';
import { marked } from 'marked';
import type { Asset } from '../types';
import { absoluteSiteUrl } from './format';

let hooksInstalled = false;

function installHooks(): void {
  if (hooksInstalled) return;
  hooksInstalled = true;

  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener noreferrer');
      const href = node.getAttribute('href');
      if (href?.startsWith('/')) node.setAttribute('href', absoluteSiteUrl(href));
    }
    if (node.tagName === 'IMG') {
      const src = node.getAttribute('src');
      if (src?.startsWith('/') && !src.startsWith('/api/')) {
        node.setAttribute('src', absoluteSiteUrl(src));
      }
      node.setAttribute('loading', 'lazy');
    }
  });
}

export function renderMarkdown(source: string, assets: Asset[]): string {
  installHooks();

  let text = source;
  for (const asset of assets) {
    text = text.split(asset.tempPath).join(asset.url);
  }

  const html = marked.parse(text, {
    gfm: true,
    // 站点用 hexo-renderer-marked，它的默认值是 breaks: true（单换行也折成 <br>）。
    // 预览必须跟着一致，否则「预览正常、线上却串行或标记失效」。
    breaks: true,
    async: false,
  }) as string;

  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel', 'loading'],
  });
}

export function previewImageSrc(value: string, assets: Asset[]): string {
  if (!value) return '';
  const asset = assets.find((item) => item.tempPath === value);
  if (asset) return asset.url;
  if (value.startsWith('/') && !value.startsWith('/api/')) return absoluteSiteUrl(value);
  return value;
}