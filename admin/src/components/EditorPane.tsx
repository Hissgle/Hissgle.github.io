import { useMemo, useRef } from 'react';
import type { Asset, Draft, EditorState } from '../types';
import { formatBytes } from '../lib/format';
import { renderMarkdown, previewImageSrc } from '../lib/markdown';
import {
  AlertIcon,
  ClockIcon,
  EyeIcon,
  EyeOffIcon,
  ImageIcon,
  MenuIcon,
  SaveIcon,
  SendIcon,
  SpinnerIcon,
  TrashIcon,
} from './Icons';

type SavingState = 'idle' | 'saving' | 'saved' | 'error';

type Props = {
  active: Draft;
  editor: EditorState;
  saving: SavingState;
  preview: boolean;
  publishing: boolean;
  onTogglePreview: () => void;
  onChange: (patch: Partial<EditorState>) => void;
  onSave: () => Promise<void>;
  onPublish: () => void;
  onUploadContent: (files: File[]) => Promise<Asset[]>;
  onUploadCover: (file: File) => Promise<void>;
  onRemoveAsset: (asset: Asset) => Promise<void>;
  onOpenSidebar: () => void;
  onError: (message: string) => void;
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function EditorPane({
  active,
  editor,
  saving,
  preview,
  publishing,
  onTogglePreview,
  onChange,
  onSave,
  onPublish,
  onUploadContent,
  onUploadCover,
  onRemoveAsset,
  onOpenSidebar,
  onError,
}: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  const html = useMemo(
    () => renderMarkdown(editor.content, active.assets),
    [editor.content, active.assets],
  );

  const coverPreview = previewImageSrc(editor.cover, active.assets);
  const datePath = editor.date.slice(0, 10).replace(/-/g, '/');
  const permalink = `/${datePath || 'YYYY/MM/DD'}/${editor.slug || '...'}/`;

  function insertAtCursor(text: string): void {
    const element = textareaRef.current;
    const content = element?.value ?? editor.content;
    const start = element?.selectionStart ?? content.length;
    const end = element?.selectionEnd ?? content.length;
    const next = `${content.slice(0, start)}${text}${content.slice(end)}`;
    onChange({ content: next });
    window.requestAnimationFrame(() => {
      const target = textareaRef.current;
      if (!target) return;
      const position = start + text.length;
      target.focus();
      target.setSelectionRange(position, position);
    });
  }

  function wrapSelection(prefix: string, suffix: string, placeholder: string): void {
    const element = textareaRef.current;
    const content = element?.value ?? editor.content;
    const start = element?.selectionStart ?? content.length;
    const end = element?.selectionEnd ?? content.length;
    const selected = content.slice(start, end) || placeholder;
    const replacement = `${prefix}${selected}${suffix}`;
    const next = `${content.slice(0, start)}${replacement}${content.slice(end)}`;
    onChange({ content: next });
    window.requestAnimationFrame(() => {
      const target = textareaRef.current;
      if (!target) return;
      target.focus();
      const from = start + prefix.length;
      target.setSelectionRange(from, from + selected.length);
    });
  }

  function prefixLines(prefix: string): void {
    const element = textareaRef.current;
    const content = element?.value ?? editor.content;
    const start = element?.selectionStart ?? content.length;
    const end = element?.selectionEnd ?? content.length;
    const block = content.slice(start, end) || '这一行';
    const replacement = block
      .split('\n')
      .map((line) => `${prefix}${line}`)
      .join('\n');
    onChange({ content: `${content.slice(0, start)}${replacement}${content.slice(end)}` });
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function insertMore(): void {
    insertAtCursor('\n\n<!-- more -->\n\n');
  }

  async function handleContentFiles(files: FileList | File[] | null): Promise<void> {
    const list = Array.from(files ?? []);
    if (list.length === 0) return;
    try {
      const assets = await onUploadContent(list);
      if (assets.length > 0) {
        const snippet = assets
          .map((asset) => `![${asset.filename}](${asset.tempPath})`)
          .join('\n\n');
        insertAtCursor(`${snippet}\n\n`);
      }
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  }

  async function handleCoverFile(file: File | undefined): Promise<void> {
    if (!file) return;
    try {
      await onUploadCover(file);
    } catch (error) {
      onError(errorMessage(error));
    } finally {
      if (coverInputRef.current) coverInputRef.current.value = '';
    }
  }

  async function removeAsset(asset: Asset): Promise<void> {
    if (!window.confirm(`移除图片 ${asset.filename}？正文里的引用会一并删掉。`)) return;
    try {
      await onRemoveAsset(asset);
    } catch (error) {
      onError(errorMessage(error));
    }
  }

  return (
    <div className="editor-pane">
      <header className="editor-topbar">
        <div className="editor-topbar-left">
          <button
            type="button"
            className="icon-button mobile-menu"
            onClick={onOpenSidebar}
            aria-label="打开菜单"
          >
            <MenuIcon size={19} />
          </button>
          <div>
            <p className="editor-kicker">
              {active.sourcePath ? 'EDITING PUBLISHED' : 'NEW DRAFT'}
            </p>
            <h2>{active.sourcePath ? '编辑已发布文章' : '写新文章'}</h2>
          </div>
        </div>

        <div className="editor-topbar-right">
          <span className={`save-state save-${saving}`}>
            {saving === 'saving' ? <SpinnerIcon size={14} /> : null}
            {saving === 'saving'
              ? '保存中'
              : saving === 'error'
                ? '保存失败'
                : saving === 'idle'
                  ? '未保存'
                  : '已保存'}
          </span>

          <button type="button" className="ghost-button" onClick={onTogglePreview}>
            {preview ? <EyeOffIcon size={16} /> : <EyeIcon size={16} />}
            {preview ? '收起预览' : '预览'}
          </button>

          <button type="button" className="ghost-button" onClick={() => void onSave()}>
            <SaveIcon size={16} />
            保存
          </button>

          <button
            type="button"
            className="publish-button"
            onClick={onPublish}
            disabled={publishing}
          >
            {publishing ? <SpinnerIcon size={16} /> : <SendIcon size={16} />}
            {publishing ? '发布中…' : '发布'}
          </button>
        </div>
      </header>

      <div className="editor-scroll">
        <section className="title-card">
          <input
            className="title-input"
            value={editor.title}
            onChange={(event) => onChange({ title: event.target.value })}
            placeholder="文章标题"
            maxLength={200}
            aria-label="文章标题"
          />
          <div className="title-meta">
            <span>{editor.content.trim().length} 字</span>
            <span>·</span>
            <span>{active.assets.length}/5 张图</span>
            <span>·</span>
            <span className="permalink-hint">{permalink}</span>
          </div>
        </section>

        <section className="meta-card">
          <div className="meta-grid">
            <label className="field">
              <span className="field-label">Slug（URL）</span>
              <input
                value={editor.slug}
                onChange={(event) => onChange({ slug: event.target.value })}
                placeholder="hello-world"
                disabled={Boolean(active.sourcePath)}
                aria-label="文章 slug"
              />
              <small>
                {active.sourcePath
                  ? '已发布文章的 slug 已锁定，避免改变线上 URL。'
                  : '小写字母、数字、短横线。留空时根据标题自动生成。'}
              </small>
            </label>

            <label className="field">
              <span className="field-label">发布时间</span>
              <input
                type="datetime-local"
                value={editor.date}
                onChange={(event) => onChange({ date: event.target.value })}
                aria-label="发布时间"
              />
              <small>按 Asia/Shanghai 时间写入 front matter。</small>
            </label>

            <label className="field">
              <span className="field-label">标签</span>
              <input
                value={editor.tags}
                onChange={(event) => onChange({ tags: event.target.value })}
                placeholder="技术随笔, JavaScript"
                aria-label="标签"
              />
              <small>用逗号分隔，最多 12 个。</small>
            </label>

            <label className="field">
              <span className="field-label">分类</span>
              <input
                value={editor.categories}
                onChange={(event) => onChange({ categories: event.target.value })}
                placeholder="技术"
                aria-label="分类"
              />
              <small>可选，用逗号分隔。</small>
            </label>
          </div>

          <label className="field field-full">
            <span className="field-label">摘要</span>
            <textarea
              value={editor.description}
              onChange={(event) => onChange({ description: event.target.value })}
              placeholder="给搜索引擎和首页卡片看的 1–2 句话。"
              rows={2}
              maxLength={500}
              aria-label="文章摘要"
            />
          </label>

          <div className="cover-row">
            <div className="cover-input">
              <span className="field-label">封面 / 顶部图</span>
              <input
                value={editor.cover}
                onChange={(event) => onChange({ cover: event.target.value })}
                placeholder="/img/cover1.jpg 或上传一张"
                aria-label="封面图片地址"
              />
              <div className="cover-actions">
                <button
                  type="button"
                  className="ghost-button small"
                  onClick={() => coverInputRef.current?.click()}
                >
                  <ImageIcon size={15} />
                  上传封面
                </button>
                {editor.cover ? (
                  <button
                    type="button"
                    className="text-button danger"
                    onClick={() => onChange({ cover: '' })}
                  >
                    清除
                  </button>
                ) : null}
              </div>
            </div>
            {coverPreview ? (
              <img className="cover-preview" src={coverPreview} alt="封面预览" />
            ) : (
              <div className="cover-placeholder">
                <ImageIcon size={20} />
                <span>无封面</span>
              </div>
            )}
          </div>
        </section>

        <section className="write-card">
          <div className="toolbar" role="toolbar" aria-label="Markdown 工具栏">
            <button
              type="button"
              title="二级标题"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => prefixLines('## ')}
            >
              H2
            </button>
            <button
              type="button"
              title="粗体"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => wrapSelection('**', '**', '粗体')}
            >
              <strong>B</strong>
            </button>
            <button
              type="button"
              title="斜体"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => wrapSelection('*', '*', '斜体')}
            >
              <em>I</em>
            </button>
            <button
              type="button"
              title="链接"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => wrapSelection('[', '](https://)', '链接文字')}
            >
              链接
            </button>
            <button
              type="button"
              title="行内代码"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => wrapSelection('`', '`', 'code')}
            >
              &lt;/&gt;
            </button>
            <button
              type="button"
              title="引用"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => prefixLines('> ')}
            >
              引用
            </button>
            <button
              type="button"
              title="无序列表"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => prefixLines('- ')}
            >
              • 列表
            </button>
            <button
              type="button"
              title="有序列表"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => prefixLines('1. ')}
            >
              1. 列表
            </button>
            <button
              type="button"
              title="摘要分隔"
              onMouseDown={(event) => event.preventDefault()}
              onClick={insertMore}
            >
              摘要分隔
            </button>
            <span className="toolbar-spacer" />
            <button
              type="button"
              className="toolbar-image"
              title="插入图片"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => imageInputRef.current?.click()}
            >
              <ImageIcon size={15} />
              图片
            </button>
          </div>

          <div className={`editor-split ${preview ? 'with-preview' : ''}`}>
            <textarea
              ref={textareaRef}
              className="markdown-input"
              value={editor.content}
              onChange={(event) => onChange({ content: event.target.value })}
              onKeyDown={(event) => {
                if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
                  event.preventDefault();
                  void onSave();
                }
                if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                  event.preventDefault();
                  onPublish();
                }
                if (event.key === 'Tab') {
                  event.preventDefault();
                  insertAtCursor('  ');
                }
              }}
              onDrop={(event) => {
                if (event.dataTransfer.files.length === 0) return;
                event.preventDefault();
                void handleContentFiles(event.dataTransfer.files);
              }}
              onDragOver={(event) => {
                if (event.dataTransfer.types.includes('Files')) event.preventDefault();
              }}
              placeholder="从这里开始写。支持 Markdown，图片可以直接拖进来。"
              spellCheck={false}
              aria-label="Markdown 正文"
            />

            {preview ? (
              <div className="preview-pane">
                <div className="preview-label">
                  <EyeIcon size={14} />
                  预览（发布后样式以 Butterfly 主题为准）
                </div>
                {editor.content.trim() ? (
                  <article
                    className="markdown-body"
                    dangerouslySetInnerHTML={{ __html: html }}
                  />
                ) : (
                  <p className="preview-empty">预览会显示在这里。</p>
                )}
              </div>
            ) : null}
          </div>
        </section>

        {active.assets.length > 0 ? (
          <section className="assets-card">
            <div className="assets-head">
              <div>
                <h3>草稿图片</h3>
                <p>发布时会提交到 source/img/posts/{editor.slug || '<slug>'}/</p>
              </div>
              <span className="assets-count">{active.assets.length}/5</span>
            </div>
            <div className="asset-grid">
              {active.assets.map((asset) => (
                <figure className="asset-item" key={asset.id}>
                  <img src={asset.url} alt={asset.filename} loading="lazy" />
                  <figcaption>
                    <span title={asset.filename}>{asset.filename}</span>
                    <small>{formatBytes(asset.size)}</small>
                    <button
                      type="button"
                      className="asset-insert"
                      onClick={() =>
                        insertAtCursor(`![${asset.filename}](${asset.tempPath})`)
                      }
                    >
                      插入正文
                    </button>
                  </figcaption>
                  <button
                    type="button"
                    className="asset-remove"
                    aria-label={`移除 ${asset.filename}`}
                    onClick={() => void removeAsset(asset)}
                  >
                    <TrashIcon size={13} />
                  </button>
                </figure>
              ))}
            </div>
          </section>
        ) : null}

        <footer className="editor-footer">
          <span>
            <ClockIcon size={14} />
            上次保存 {new Date(active.updatedAt).toLocaleTimeString('zh-CN', {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
          <span>Ctrl/⌘ + S 保存 · Ctrl/⌘ + Enter 发布</span>
        </footer>
      </div>

      <input
        ref={imageInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        multiple
        hidden
        onChange={(event) => void handleContentFiles(event.target.files)}
      />
      <input
        ref={coverInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
        hidden
        onChange={(event) => void handleCoverFile(event.target.files?.[0])}
      />

      {saving === 'error' ? (
        <div className="save-error-bar" role="alert">
          <AlertIcon size={15} />
          自动保存失败，先不要关闭页面；点「保存」重试。
        </div>
      ) : null}
    </div>
  );
}