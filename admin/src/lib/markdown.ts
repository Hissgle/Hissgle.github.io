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
    breaks: false,
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