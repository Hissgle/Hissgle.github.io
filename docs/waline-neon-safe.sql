-- ===========================================================================
-- Waline 建表脚本（零报错版）
--
-- 用法：Neon → SQL Editor → 全选清空 → 粘贴 → 不要选中任何内容 → Run
--
-- 特点：用 DO 块捕获异常，**哪些表/序列已经存在就自动跳过**，
--       无论当前库里有什么，跑完都不会报错，也不会清空数据。
--       可以反复运行。
--
--   跑完只会看到一行：DO   —— 那就是全部成功了。
--
-- 内容来源：官方 assets/waline.pgsql
--   https://github.com/walinejs/waline/blob/main/assets/waline.pgsql
-- 已与 docs/waline-neon.sql 逐语句比对，DDL 完全一致。
-- ===========================================================================

DO $$
BEGIN
  -- ---------------------------------------------------------------------
  -- wl_comment：评论表
  -- ---------------------------------------------------------------------
  BEGIN
    CREATE SEQUENCE wl_comment_seq;
  EXCEPTION WHEN duplicate_table THEN NULL;
  END;

  BEGIN
    CREATE TABLE wl_comment (
      id int check (id > 0) NOT NULL DEFAULT NEXTVAL ('wl_comment_seq'),
      user_id int DEFAULT NULL,
      comment text,
      insertedAt timestamp(0) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      ip varchar(100) DEFAULT '',
      link varchar(255) DEFAULT NULL,
      mail varchar(255) DEFAULT NULL,
      nick varchar(255) DEFAULT NULL,
      pid int DEFAULT NULL,
      rid int DEFAULT NULL,
      sticky numeric DEFAULT NULL,
      status varchar(50) NOT NULL DEFAULT '',
      "like" int DEFAULT NULL,
      ua text,
      url varchar(255) DEFAULT NULL,
      createdAt timestamp(0) without time zone NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt timestamp(0) without time zone NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    );
  EXCEPTION WHEN duplicate_table THEN NULL;
  END;

  -- ---------------------------------------------------------------------
  -- wl_counter：浏览量 / 表情回应计数表
  -- ---------------------------------------------------------------------
  BEGIN
    CREATE SEQUENCE wl_counter_seq;
  EXCEPTION WHEN duplicate_table THEN NULL;
  END;

  BEGIN
    CREATE TABLE wl_counter (
      id int check (id > 0) NOT NULL DEFAULT NEXTVAL ('wl_counter_seq'),
      time int DEFAULT NULL,
      reaction0 int DEFAULT NULL,
      reaction1 int DEFAULT NULL,
      reaction2 int DEFAULT NULL,
      reaction3 int DEFAULT NULL,
      reaction4 int DEFAULT NULL,
      reaction5 int DEFAULT NULL,
      reaction6 int DEFAULT NULL,
      reaction7 int DEFAULT NULL,
      reaction8 int DEFAULT NULL,
      url varchar(255) NOT NULL DEFAULT '',
      createdAt timestamp(0) without time zone NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt timestamp(0) without time zone NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    );
  EXCEPTION WHEN duplicate_table THEN NULL;
  END;

  -- ---------------------------------------------------------------------
  -- wl_users：用户表（管理员账号存在这里；
  --           缺这张表就会报 relation "wl_users" does not exist）
  -- ---------------------------------------------------------------------
  BEGIN
    CREATE SEQUENCE wl_users_seq;
  EXCEPTION WHEN duplicate_table THEN NULL;
  END;

  BEGIN
    CREATE TABLE wl_users (
      id int check (id > 0) NOT NULL DEFAULT NEXTVAL ('wl_users_seq'),
      display_name varchar(255) NOT NULL DEFAULT '',
      email varchar(255) NOT NULL DEFAULT '',
      password varchar(255) NOT NULL DEFAULT '',
      type varchar(50) NOT NULL DEFAULT '',
      label varchar(255) DEFAULT NULL,
      url varchar(255) DEFAULT NULL,
      avatar varchar(255) DEFAULT NULL,
      github varchar(255) DEFAULT NULL,
      twitter varchar(255) DEFAULT NULL,
      facebook varchar(255) DEFAULT NULL,
      google varchar(255) DEFAULT NULL,
      weibo varchar(255) DEFAULT NULL,
      qq varchar(255) DEFAULT NULL,
      oidc varchar(255) DEFAULT NULL,
      huawei varchar(255) DEFAULT NULL,
      "2fa" varchar(32) DEFAULT NULL,
      createdAt timestamp(0) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt timestamp(0) without time zone NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    );
  EXCEPTION WHEN duplicate_table THEN NULL;
  END;
END $$;

-- ---------------------------------------------------------------------------
-- 验收：应该正好列出三张表
-- ---------------------------------------------------------------------------
SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;
