import { useEffect, useRef, useState } from 'react';
import { ApiError, api, setCsrfToken } from './api';
import type {
  Asset,
  Draft,
  DraftSummary,
  EditorState,
  Me,
  PostSummary,
  PublishResult,
  PublishStatus,
} from './types';
import {
  dateToInputValue,
  inputValueToDate,
  nowInputValue,
  relativeTime,
} from './lib/format';
import { slugify } from './lib/slug';
import { compressImage } from './lib/image';
import { EditorPane } from './components/EditorPane';
import { Login } from './components/Login';
import { PublishDialog } from './components/PublishDialog';
import { Sidebar } from './components/Sidebar';
import {
  AlertIcon,
  CheckIcon,
  FileTextIcon,
  MenuIcon,
  PlusIcon,
  SpinnerIcon,
} from './components/Icons';

type SavingState = 'idle' | 'saving' | 'saved' | 'error';
type ToastKind = 'info' | 'success' | 'error';

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (Array.isArray(error.details)) {
      const first = error.details[0] as { message?: string } | undefined;
      if (first?.message) return `${error.message}：${first.message}`;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}

function normalizeList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value === 'string') {
    return value.split(/[,，]/).map((item) => item.trim()).filter(Boolean);
  }
  return [];
}

function splitList(value: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value.split(/[,，]/)) {
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
    if (result.length >= 12) break;
  }
  return result;
}

function toEditor(draft: Draft): EditorState {
  const fm = draft.frontMatter ?? {};
  const cover =
    typeof fm.cover === 'string'
      ? fm.cover
      : typeof fm.top_img === 'string'
        ? fm.top_img
        : '';
  return {
    title: draft.title,
    slug: draft.slug ?? '',
    date: dateToInputValue(fm.date),
    tags: normalizeList(fm.tags).join(', '),
    categories: normalizeList(fm.categories).join(', '),
    cover,
    description: typeof fm.description === 'string' ? fm.description : '',
    content: draft.content,
    sourcePath: draft.sourcePath,
  };
}

function toSummary(draft: Draft): DraftSummary {
  const { content, assets, ...rest } = draft;
  return {
    ...rest,
    assetCount: assets.length,
    excerpt: content.slice(0, 160),
  };
}

function blankDraftInput() {
  return {
    title: '',
    slug: null,
    frontMatter: {
      date: inputValueToDate(nowInputValue()),
      tags: [] as string[],
      categories: [] as string[],
    },
    content: '',
    sourcePath: null,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [booting, setBooting] = useState(true);
  const [bootError, setBootError] = useState('');
  const [initialError, setInitialError] = useState<string | undefined>();

  const [drafts, setDraftsState] = useState<DraftSummary[]>([]);
  const [posts, setPosts] = useState<PostSummary[]>([]);
  const [active, setActive] = useState<Draft | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [saving, setSaving] = useState<SavingState>('saved');
  const [preview, setPreview] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [loadingDraft, setLoadingDraft] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState<PublishStatus | null>(null);
  const [toast, setToast] = useState<{ message: string; kind: ToastKind } | null>(null);

  const draftsRef = useRef<DraftSummary[]>([]);
  const activeRef = useRef<Draft | null>(null);
  const editorRef = useRef<EditorState | null>(null);
  const saveTimerRef = useRef<number | null>(null);
  const saveSeqRef = useRef(0);
  const saveChainRef = useRef<Promise<void>>(Promise.resolve());
  const slugTouchedRef = useRef(false);
  const dirtyRef = useRef(false);
  const pollTimerRef = useRef<number | null>(null);
  const pollActiveRef = useRef(false);
  const toastTimerRef = useRef<number | null>(null);

  function setDrafts(next: DraftSummary[]): void {
    draftsRef.current = next;
    setDraftsState(next);
  }

  function clearSaveTimer(): void {
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
  }

  function showToast(message: string, kind: ToastKind = 'info'): void {
    setToast({ message, kind });
    if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    toastTimerRef.current = window.setTimeout(() => setToast(null), 4200);
  }

  function applyDraft(draft: Draft): void {
    const nextEditor = toEditor(draft);
    activeRef.current = draft;
    editorRef.current = nextEditor;
    setActive(draft);
    setEditor(nextEditor);
    setSaving('saved');
    dirtyRef.current = false;
    slugTouchedRef.current = Boolean(draft.sourcePath || draft.slug);
    clearSaveTimer();
  }

  function clearActive(): void {
    activeRef.current = null;
    editorRef.current = null;
    setActive(null);
    setEditor(null);
    setSaving('saved');
    dirtyRef.current = false;
    clearSaveTimer();
  }

  async function refreshLists(): Promise<void> {
    const [nextDrafts, nextPosts] = await Promise.all([api.listDrafts(), api.listPosts()]);
    setDrafts(nextDrafts);
    setPosts(nextPosts);
  }

  async function refreshPosts(): Promise<void> {
    try {
      setPosts(await api.listPosts());
    } catch {
      // 发布已成功，列表刷新失败不打断用户
    }
  }

  function upsertSummary(draft: Draft): void {
    const summary = toSummary(draft);
    const next = [summary, ...draftsRef.current.filter((item) => item.id !== draft.id)];
    next.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    setDrafts(next);
  }

  function scheduleSave(state: EditorState): void {
    clearSaveTimer();
    saveTimerRef.current = window.setTimeout(() => {
      void persist(state, true).catch(() => {
        // persist 内部已经提示过；自动保存失败时保留 dirty 状态
      });
    }, 1200);
  }

  function changeEditor(patch: Partial<EditorState>): void {
    const previous = editorRef.current;
    if (!previous) return;

    let next: EditorState = { ...previous, ...patch };
    if (patch.title !== undefined && !slugTouchedRef.current && !previous.sourcePath) {
      next = { ...next, slug: patch.title.trim() ? slugify(patch.title) : '' };
    }
    if (patch.slug !== undefined) slugTouchedRef.current = true;

    editorRef.current = next;
    setEditor(next);
    setSaving('idle');
    dirtyRef.current = true;
    scheduleSave(next);
  }

  async function persist(state: EditorState, isAutosave: boolean): Promise<Draft | null> {
    const current = activeRef.current;
    if (!current) return null;

    clearSaveTimer();
    const seq = ++saveSeqRef.current;
    setSaving('saving');

    const frontMatter: Record<string, unknown> = { ...current.frontMatter };
    const date = inputValueToDate(state.date);
    if (date) frontMatter.date = date;
    frontMatter.tags = splitList(state.tags);
    frontMatter.categories = splitList(state.categories);

    const cover = state.cover.trim();
    if (cover) {
      frontMatter.cover = cover;
      frontMatter.top_img = cover;
    } else {
      delete frontMatter.cover;
      delete frontMatter.top_img;
    }

    const description = state.description.trim();
    if (description) frontMatter.description = description;
    else delete frontMatter.description;

    // 串行化保存，避免「自动保存请求还没回来就点发布」时旧内容后写覆盖新内容。
    const previous = saveChainRef.current.catch(() => undefined);
    let release!: () => void;
    saveChainRef.current = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    try {
      try {
        const saved = await api.saveDraft({
          id: current.id,
          title: state.title,
          slug: state.slug.trim() || null,
          frontMatter,
          content: state.content,
          sourcePath: state.sourcePath,
        });

        if (seq !== saveSeqRef.current) return saved;

        activeRef.current = saved;
        setActive(saved);
        upsertSummary(saved);
        setSaving('saved');
        dirtyRef.current = false;
        return saved;
      } catch (error) {
        if (seq === saveSeqRef.current) {
          setSaving('error');
          dirtyRef.current = true;
          if (!isAutosave) showToast(errorMessage(error), 'error');
        }
        throw error;
      }
    } finally {
      release();
    }
  }

  async function saveNow(): Promise<Draft | null> {
    clearSaveTimer();
    const state = editorRef.current;
    if (!state) return null;
    return persist(state, false);
  }

  async function ensureDraft(): Promise<Draft> {
    if (activeRef.current) return activeRef.current;
    const draft = await api.saveDraft(blankDraftInput());
    applyDraft(draft);
    upsertSummary(draft);
    return draft;
  }

  async function handleNew(): Promise<void> {
    if (creating) return;
    setCreating(true);
    try {
      if (dirtyRef.current) await saveNow();
      const draft = await api.saveDraft(blankDraftInput());
      applyDraft(draft);
      upsertSummary(draft);
      setSidebarOpen(false);
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      setCreating(false);
    }
  }

  async function openDraft(id: string): Promise<void> {
    if (activeRef.current?.id === id) {
      setSidebarOpen(false);
      return;
    }
    if (dirtyRef.current) {
      try {
        await saveNow();
      } catch {
        return;
      }
    }

    setLoadingDraft(true);
    try {
      const draft = await api.getDraft(id);
      applyDraft(draft);
      setSidebarOpen(false);
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      setLoadingDraft(false);
    }
  }

  async function openPost(post: PostSummary): Promise<void> {
    if (dirtyRef.current) {
      try {
        await saveNow();
      } catch {
        return;
      }
    }

    const existing = draftsRef.current.find(
      (draft) => draft.sourcePath === post.path || draft.slug === post.slug,
    );
    if (existing) {
      await openDraft(existing.id);
      return;
    }

    setLoadingDraft(true);
    try {
      const detail = await api.getPost(post.slug);
      const draft = await api.saveDraft({
        title: detail.title,
        slug: detail.slug,
        frontMatter: detail.frontMatter,
        content: detail.content,
        sourcePath: detail.path,
      });
      applyDraft(draft);
      upsertSummary(draft);
      setSidebarOpen(false);
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        const bySlug = draftsRef.current.find((draft) => draft.slug === post.slug);
        if (bySlug) {
          await openDraft(bySlug.id);
          return;
        }
      }
      showToast(errorMessage(error), 'error');
    } finally {
      setLoadingDraft(false);
    }
  }

  async function handleDeleteDraft(draft: DraftSummary): Promise<void> {
    if (!window.confirm(`删除草稿「${draft.title || '无标题'}」？`)) return;
    try {
      await api.deleteDraft(draft.id);
      setDrafts(draftsRef.current.filter((item) => item.id !== draft.id));
      if (activeRef.current?.id === draft.id) clearActive();
      showToast('草稿已删除', 'success');
    } catch (error) {
      showToast(errorMessage(error), 'error');
    }
  }

  async function uploadAssets(files: File[]): Promise<Asset[]> {
    if (files.length === 0) return [];
    let draft = await ensureDraft();
    if (dirtyRef.current) {
      const saved = await saveNow();
      if (saved) draft = saved;
    }
    if (draft.assets.length + files.length > 5) {
      throw new Error(`每篇文章最多 5 张图片，当前已有 ${draft.assets.length} 张`);
    }

    const uploaded: Asset[] = [];
    try {
      for (const file of files) {
        const compressed = await compressImage(file);
        const asset = await api.uploadAsset({
          draftId: draft.id,
          filename: compressed.filename,
          mime: compressed.mime,
          data: compressed.data,
        });
        uploaded.push(asset);
      }
    } catch (error) {
      if (activeRef.current?.id === draft.id) {
        try {
          const latest = await api.getDraft(draft.id);
          const current = activeRef.current;
          if (current) {
            const next = { ...current, assets: latest.assets };
            activeRef.current = next;
            setActive(next);
          }
        } catch {
          // ignore
        }
      }
      throw error;
    }

    const current = activeRef.current;
    if (current && current.id === draft.id) {
      const next = { ...current, assets: [...current.assets, ...uploaded] };
      activeRef.current = next;
      setActive(next);
      setDrafts(
        draftsRef.current.map((item) =>
          item.id === next.id
            ? { ...item, assetCount: next.assets.length, updatedAt: new Date().toISOString() }
            : item,
        ),
      );
    }

    return uploaded;
  }

  async function uploadCover(file: File): Promise<void> {
    const [asset] = await uploadAssets([file]);
    if (asset) changeEditor({ cover: asset.tempPath });
  }

  async function removeAsset(asset: Asset): Promise<void> {
    await api.deleteAsset(asset.id);
    const current = activeRef.current;
    if (!current) return;

    const next = { ...current, assets: current.assets.filter((item) => item.id !== asset.id) };
    activeRef.current = next;
    setActive(next);

    const state = editorRef.current;
    if (state) {
      const imagePattern = new RegExp(
        `!\\[[^\\]]*\\]\\(${escapeRegExp(asset.tempPath)}\\)`,
        'g',
      );
      const content = state.content.replace(imagePattern, '').split(asset.tempPath).join('');
      const cover = state.cover === asset.tempPath ? '' : state.cover;
      changeEditor({ content, cover });
    }

    setDrafts(
      draftsRef.current.map((item) =>
        item.id === next.id ? { ...item, assetCount: next.assets.length } : item,
      ),
    );
  }

  function applyPublishedSourcePath(result: PublishResult): void {
    const current = activeRef.current;
    if (current) {
      const next = {
        ...current,
        sourcePath: result.sourcePath,
        publishedAt: new Date().toISOString(),
      };
      activeRef.current = next;
      setActive(next);
    }
    const state = editorRef.current;
    if (state) {
      const nextEditor = { ...state, sourcePath: result.sourcePath };
      editorRef.current = nextEditor;
      setEditor(nextEditor);
      slugTouchedRef.current = true;
    }
    const activeId = current?.id;
    setDrafts(
      draftsRef.current.map((item) =>
        item.id === activeId
          ? {
              ...item,
              sourcePath: result.sourcePath,
              publishedAt: new Date().toISOString(),
            }
          : item,
      ),
    );
  }

  function startPolling(result: PublishResult, title: string): void {
    pollActiveRef.current = true;
    if (pollTimerRef.current !== null) window.clearTimeout(pollTimerRef.current);
    const startedAt = Date.now();

    const tick = async (): Promise<void> => {
      if (!pollActiveRef.current) return;
      if (Date.now() - startedAt > 6 * 60 * 1000) {
        setPublishStatus({
          state: 'failed',
          result,
          message: '等待超时（6 分钟）。可以到 Actions 页面查看具体情况。',
        });
        pollActiveRef.current = false;
        return;
      }

      try {
        const status = await api.publishStatus(result.commitSha, result.permalink, title);
        setPublishStatus({ ...status, result });
        if (status.state === 'live') {
          pollActiveRef.current = false;
          showToast('文章已经上线', 'success');
          void refreshPosts();
          void refreshLists().catch(() => undefined);
          return;
        }
        if (status.state === 'failed') {
          pollActiveRef.current = false;
          return;
        }
      } catch {
        // 网络抖动时继续轮询
      }

      if (pollActiveRef.current) {
        pollTimerRef.current = window.setTimeout(() => void tick(), 4000);
      }
    };

    pollTimerRef.current = window.setTimeout(() => void tick(), 2500);
  }

  async function handlePublish(): Promise<void> {
    const state = editorRef.current;
    const current = activeRef.current;
    if (!state || !current) return;

    if (!state.title.trim()) {
      showToast('先给文章起个标题', 'error');
      return;
    }
    if (!state.slug.trim()) {
      showToast('先填写 slug（文章 URL）', 'error');
      return;
    }
    if (!state.content.trim()) {
      showToast('正文还是空的', 'error');
      return;
    }

    setPublishing(true);
    try {
      const saved = await saveNow();
      if (!saved) throw new Error('保存草稿失败');

      setPublishStatus({ state: 'queued' });
      const result = await api.publish(saved.id);
      applyPublishedSourcePath(result);
      setPublishStatus({ state: 'building', result });
      startPolling(result, state.title);
    } catch (error) {
      setPublishStatus({ state: 'failed', message: errorMessage(error) });
    } finally {
      setPublishing(false);
    }
  }

  function closePublishDialog(): void {
    pollActiveRef.current = false;
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setPublishStatus(null);
  }

  async function handleLogout(): Promise<void> {
    try {
      await api.logout();
    } catch (error) {
      showToast(errorMessage(error), 'error');
      return;
    }
    pollActiveRef.current = false;
    if (pollTimerRef.current !== null) {
      window.clearTimeout(pollTimerRef.current);
      pollTimerRef.current = null;
    }
    setPublishStatus(null);
    setCsrfToken('');
    setMe({ authenticated: false, configured: true });
    clearActive();
    setDrafts([]);
    setPosts([]);
  }

  useEffect(() => {
    const search = new URLSearchParams(window.location.search);
    const error = search.get('error');
    if (error) {
      setInitialError(error);
      window.history.replaceState(null, '', window.location.pathname);
    }

    let cancelled = false;
    void (async () => {
      try {
        const result = await api.me();
        if (cancelled) return;
        setMe(result);
        setCsrfToken(result.csrfToken);
        if (result.authenticated) await refreshLists();
      } catch (error) {
        if (!cancelled) setBootError(errorMessage(error));
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();

    return () => {
      cancelled = true;
      clearSaveTimer();
      if (pollTimerRef.current !== null) window.clearTimeout(pollTimerRef.current);
      if (toastTimerRef.current !== null) window.clearTimeout(toastTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onUnauthorized = (): void => {
      pollActiveRef.current = false;
      if (pollTimerRef.current !== null) {
        window.clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      setPublishStatus(null);
      setMe({ authenticated: false, configured: true });
      clearActive();
    };
    window.addEventListener('admin:unauthorized', onUnauthorized);
    return () => window.removeEventListener('admin:unauthorized', onUnauthorized);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (booting) {
    return (
      <div className="boot-screen">
        <div className="boot-mark">H</div>
        <SpinnerIcon size={22} />
        <p>正在打开写作台…</p>
      </div>
    );
  }

  if (bootError) {
    return (
      <div className="boot-screen">
        <div className="boot-error-card">
          <AlertIcon size={26} />
          <h1>写作台没有启动</h1>
          <p>{bootError}</p>
          <p className="muted">
            请检查 Vercel 环境变量和 Neon 数据库；详情见 <code>admin/README.md</code>。
          </p>
          <button type="button" className="publish-button" onClick={() => window.location.reload()}>
            重试
          </button>
        </div>
      </div>
    );
  }

  if (!me?.authenticated) {
    return <Login configured={Boolean(me?.configured)} error={initialError} />;
  }

  return (
    <div className="app-shell">
      <Sidebar
        drafts={drafts}
        posts={posts}
        activeDraftId={active?.id}
        activeSourcePath={active?.sourcePath}
        userLogin={me.user?.login}
        open={sidebarOpen}
        creating={creating}
        onClose={() => setSidebarOpen(false)}
        onNew={() => void handleNew()}
        onOpenDraft={(id) => void openDraft(id)}
        onOpenPost={(post) => void openPost(post)}
        onDeleteDraft={(draft) => void handleDeleteDraft(draft)}
        onLogout={() => void handleLogout()}
      />

      <main className="main-area">
        {editor && active ? (
          <EditorPane
            active={active}
            editor={editor}
            saving={saving}
            preview={preview}
            publishing={publishing}
            onTogglePreview={() => setPreview((value) => !value)}
            onChange={changeEditor}
            onSave={async () => {
              try {
                await saveNow();
                showToast('已保存', 'success');
              } catch (error) {
                showToast(errorMessage(error), 'error');
              }
            }}
            onPublish={() => void handlePublish()}
            onUploadContent={uploadAssets}
            onUploadCover={uploadCover}
            onRemoveAsset={removeAsset}
            onOpenSidebar={() => setSidebarOpen(true)}
            onError={(message) => showToast(message, 'error')}
          />
        ) : (
          <div className="empty-state">
            <button
              type="button"
              className="icon-button mobile-menu empty-menu"
              onClick={() => setSidebarOpen(true)}
              aria-label="打开菜单"
            >
              <MenuIcon size={19} />
            </button>
            <div className="empty-mark">
              <PlusIcon size={34} />
            </div>
            <p className="editor-kicker">WRITE SOMETHING</p>
            <h1>今天写点什么？</h1>
            <p className="empty-desc">
              点下面的按钮开始一篇新文章。写完点「发布」，GitHub Actions 会自动构建并部署。
            </p>
            <button
              type="button"
              className="publish-button empty-cta"
              onClick={() => void handleNew()}
              disabled={creating}
            >
              {creating ? <SpinnerIcon size={17} /> : <PlusIcon size={17} />}
              {creating ? '正在新建…' : '写新文章'}
            </button>
            {drafts.length > 0 ? (
              <div className="empty-recent">
                <p>最近草稿</p>
                <ul>
                  {drafts.slice(0, 4).map((draft) => (
                    <li key={draft.id}>
                      <button type="button" onClick={() => void openDraft(draft.id)}>
                        <FileTextIcon size={14} />
                        <span>{draft.title.trim() || '无标题草稿'}</span>
                        <small>{relativeTime(draft.updatedAt)}</small>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        )}

        {loadingDraft ? (
          <div className="loading-overlay" role="status">
            <SpinnerIcon size={22} />
            正在打开草稿…
          </div>
        ) : null}
      </main>

      {publishStatus ? (
        <PublishDialog
          status={publishStatus}
          title={editor?.title || active?.title || ''}
          onClose={closePublishDialog}
        />
      ) : null}

      {toast ? (
        <div className={`toast toast-${toast.kind}`} role="status">
          {toast.kind === 'success' ? <CheckIcon size={16} /> : null}
          {toast.kind === 'error' ? <AlertIcon size={16} /> : null}
          {toast.message}
        </div>
      ) : null}
    </div>
  );
}