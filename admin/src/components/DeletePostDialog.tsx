import { useEffect, useId, useRef, useState } from 'react';
import type { DeletePostTarget } from '../types';
import { AlertIcon, CloseIcon, SpinnerIcon, TrashIcon } from './Icons';

type Props = {
  post: DeletePostTarget;
  busy: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function DeletePostDialog({ post, busy, error, onCancel, onConfirm }: Props) {
  const [confirmation, setConfirmation] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const descriptionId = useId();

  useEffect(() => {
    setConfirmation('');
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [post.path]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent): void {
      if (event.key === 'Escape' && !busy) onCancel();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [busy, onCancel]);

  const confirmed = confirmation.trim() === 'DELETE';

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={() => {
        if (!busy) onCancel();
      }}
    >
      <div
        className="publish-dialog delete-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-post-title"
        aria-describedby={descriptionId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (confirmed && !busy) onConfirm();
          }}
        >
          <div className="publish-dialog-head">
            <div>
              <p className="editor-kicker">DELETE POST</p>
              <h2 id="delete-post-title">删除文章</h2>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={onCancel}
              aria-label="关闭"
              disabled={busy}
            >
              <CloseIcon size={18} />
            </button>
          </div>

          <p className="publish-title" title={post.title || post.slug}>
            {post.title || post.slug}
          </p>

          <div className="delete-warning" id={descriptionId}>
            <div className="delete-warning-head">
              <AlertIcon size={17} />
              <strong>这个操作会从 Git 删除文章</strong>
            </div>
            <ul>
              <li>
                Markdown：<code>{post.path}</code>
              </li>
              <li>
                文章图片：<code>source/img/posts/{post.slug}/</code>
              </li>
            </ul>
            <p>
              提交后 GitHub Actions 会重新构建；线上页面会消失。Git 历史仍可找回，
              但写作台不会提供恢复按钮。如果正在编辑这篇文章，未保存的修改也会丢失。
            </p>
          </div>

          <label className="delete-confirm-label" htmlFor="delete-confirm-input">
            输入 <code>DELETE</code> 确认
          </label>
          <input
            ref={inputRef}
            id="delete-confirm-input"
            className="delete-confirm-input"
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
            placeholder="DELETE"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            disabled={busy}
          />

          {error ? (
            <p className="delete-error" role="alert">
              <AlertIcon size={15} />
              {error}
            </p>
          ) : null}

          <div className="delete-actions">
            <button type="button" className="ghost-button" onClick={onCancel} disabled={busy}>
              取消
            </button>
            <button
              type="submit"
              className="publish-button danger-button"
              disabled={!confirmed || busy}
            >
              {busy ? <SpinnerIcon size={16} /> : <TrashIcon size={16} />}
              {busy ? '正在删除…' : '永久删除'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}