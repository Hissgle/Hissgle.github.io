export type Session = {
  tokenHash: string;
  githubId: number;
  githubLogin: string;
  expiresAt: string;
};

export type DraftRow = {
  id: string;
  slug: string | null;
  title: string;
  front_matter: unknown;
  content: string;
  source_path: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  last_commit_sha: string | null;
};

export type AssetRow = {
  id: string;
  draft_id: string;
  filename: string;
  mime: string;
  size: number;
  data: string;
  created_at: string;
};

export type AssetDto = {
  id: string;
  filename: string;
  mime: string;
  size: number;
  tempPath: string;
  url: string;
};

export type DraftDto = {
  id: string;
  slug: string | null;
  title: string;
  frontMatter: Record<string, unknown>;
  content: string;
  sourcePath: string | null;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  lastCommitSha: string | null;
  assets: AssetDto[];
};

export type DraftSummary = Omit<DraftDto, 'content' | 'assets'> & {
  assetCount: number;
  excerpt: string;
};

export type PostSummary = {
  slug: string;
  path: string;
  sha: string;
  title: string;
  date: string;
  tags: string[];
  updated?: string;
  permalink: string;
};

export type PostDetail = PostSummary & {
  frontMatter: Record<string, unknown>;
  content: string;
};