import type { DraftSummary, PostSummary } from '../types';
import { relativeTime } from '../lib/format';
import {
  CloseIcon,
  FileTextIcon,
  LogOutIcon,
  PlusIcon,
  TrashIcon,
} from './Icons';

type Props = {
  drafts: DraftSummary[];
  posts: PostSummary[];
  activeDraftId?: string;
  activeSourcePath?: string | null;
  userLogin?: string;
  open: boolean;
  creating: boolean;
  onClose: () => void;
  onNew: () => void;
  onOpenDraft: (id: string) => void;
  onOpenPost: (post: PostSummary) => void;
  onDeleteDraft: (draft: DraftSummary) => void;
  onDeletePost: (post: PostSummary) => void;
  onLogout: () => void;
};

export function Sidebar({
  drafts,
  posts,
  activeDraftId,
  activeSourcePath,
  userLogin,
  open,
  creating,
  onClose,
  onNew,
  onOpenDraft,
  onOpenPost,
  onDeleteDraft,
  onDeletePost,
  onLogout,
}: Props) {
  return (
    <>
      <div
        className={`sidebar-scrim ${open ? 'is-open' : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside className={`sidebar ${open ? 'is-open' : ''}`} aria-label="文章与草稿">
        <div className="sidebar-head">
          <div>
            <p className="sidebar-kicker">HISSGLE</p>
            <h2>写作台</h2>
          </div>
          <button
            type="button"
            className="icon-button sidebar-close"
            onClick={onClose}
            aria-label="关闭菜单"
          >
            <CloseIcon size={18} />
          </button>
        </div>

        <button
          type="button"
          className="new-post-button"
          onClick={onNew}
          disabled={creating}
        >
          <PlusIcon size={18} />
          {creating ? '正在新建…' : '写新文章'}
        </button>

        <div className="sidebar-scroll">
          <section className="sidebar-section">
            <div className="sidebar-section-title">
              <span>草稿</span>
              <span className="count">{drafts.length}</span>
            </div>
            {drafts.length === 0 ? (
              <p className="sidebar-empty">还没有草稿。点上面的按钮开始写。</p>
            ) : (
              <ul className="sidebar-list">
                {drafts.map((draft) => (
                  <li key={draft.id}>
                    <button
                      type="button"
                      className={`sidebar-item ${
                        activeDraftId === draft.id ? 'is-active' : ''
                      }`}
                      onClick={() => onOpenDraft(draft.id)}
                    >
                      <span className="sidebar-item-title">
                        {draft.title.trim() || '无标题草稿'}
                      </span>
                      <span className="sidebar-item-meta">
                        {relativeTime(draft.updatedAt)}
                        {draft.assetCount > 0 ? ` · ${draft.assetCount} 张图` : ''}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="sidebar-delete"
                      aria-label={`删除草稿 ${draft.title || '无标题'}`}
                      title="删除草稿"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeleteDraft(draft);
                      }}
                    >
                      <TrashIcon size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="sidebar-section">
            <div className="sidebar-section-title">
              <span>已发布</span>
              <span className="count">{posts.length}</span>
            </div>
            {posts.length === 0 ? (
              <p className="sidebar-empty">还没有已发布文章。</p>
            ) : (
              <ul className="sidebar-list">
                {posts.map((post) => (
                  <li key={post.path}>
                    <button
                      type="button"
                      className={`sidebar-item ${
                        activeSourcePath === post.path ? 'is-active' : ''
                      }`}
                      onClick={() => onOpenPost(post)}
                    >
                      <span className="sidebar-item-title">
                        <FileTextIcon size={13} />
                        {post.title || post.slug}
                      </span>
                      <span className="sidebar-item-meta">{post.date.slice(0, 10)}</span>
                    </button>
                    <button
                      type="button"
                      className="sidebar-delete"
                      aria-label={`删除文章 ${post.title || post.slug}`}
                      title="删除文章"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeletePost(post);
                      }}
                    >
                      <TrashIcon size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="sidebar-foot">
          <div className="sidebar-user">
            <span className="avatar">{userLogin?.slice(0, 1).toUpperCase() || 'H'}</span>
            <div>
              <strong>{userLogin || '站长'}</strong>
              <small>只剩你能发布</small>
            </div>
          </div>
          <button
            type="button"
            className="icon-button"
            onClick={onLogout}
            title="退出登录"
            aria-label="退出登录"
          >
            <LogOutIcon size={17} />
          </button>
        </div>
      </aside>
    </>
  );
}