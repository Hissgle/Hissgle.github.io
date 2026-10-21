-- 写作台数据库（Neon Postgres）
--
-- 在 Neon SQL Editor 里整段执行即可。管理端第一次访问时也会执行同样的
-- `CREATE ... IF NOT EXISTS`，所以重复执行是安全的。
--
-- 文章正文/图片不在这里：它们仍然提交到 Git（source/_posts、source/img/posts）。
-- 这里只保存登录会话、草稿、草稿图片和发布审计。

create schema if not exists blog_admin;

create table if not exists blog_admin.sessions (
  token_hash      text primary key,
  github_id       bigint not null,
  github_login    text not null,
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),
  expires_at      timestamptz not null
);

create index if not exists sessions_expires_idx
  on blog_admin.sessions (expires_at);

create table if not exists blog_admin.drafts (
  id              uuid primary key,
  slug            text unique,
  title           text not null default '',
  front_matter    jsonb not null default '{}'::jsonb,
  content         text not null default '',
  source_path     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  published_at    timestamptz,
  last_commit_sha text
);

create index if not exists drafts_updated_idx
  on blog_admin.drafts (updated_at desc);

create index if not exists drafts_source_path_idx
  on blog_admin.drafts (source_path);

create table if not exists blog_admin.draft_assets (
  id          uuid primary key,
  draft_id    uuid not null references blog_admin.drafts(id) on delete cascade,
  filename    text not null,
  mime        text not null,
  size        integer not null,
  data        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists draft_assets_draft_idx
  on blog_admin.draft_assets (draft_id);

create table if not exists blog_admin.publish_log (
  id          bigserial primary key,
  draft_id    uuid references blog_admin.drafts(id) on delete set null,
  path        text not null,
  commit_sha  text not null,
  mode        text not null check (mode in ('create', 'update', 'delete')),
  github_id   bigint not null,
  created_at  timestamptz not null default now()
);

-- 旧库迁移：允许删除操作写入审计日志。
do $$
begin
  alter table blog_admin.publish_log
    drop constraint if exists publish_log_mode_check;
  alter table blog_admin.publish_log
    add constraint publish_log_mode_check
    check (mode in ('create', 'update', 'delete'));
exception
  when duplicate_object then null;
end $$;

create index if not exists publish_log_created_idx
  on blog_admin.publish_log (created_at desc);

create table if not exists blog_admin.rate_limits (
  bucket        text not null,
  window_start  timestamptz not null,
  count         integer not null default 0,
  primary key (bucket, window_start)
);