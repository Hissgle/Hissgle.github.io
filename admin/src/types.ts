export type Asset = {
  id: string;
  filename: string;
  mime: string;
  size: number;
  tempPath: string;
  url: string;
};

export type Draft = {
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
  assets: Asset[];
};

export type DraftSummary = Omit<Draft, 'content' | 'assets'> & {
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

export type DeletePostTarget = {
  slug: string;
  title: string;
  path: string;
  permalink?: string;
};

export type DeletePostResult = {
  commitSha: string;
  commitUrl: string;
  sourcePath: string;
  slug: string;
  deletedImages: number;
};

export type Me = {
  authenticated: boolean;
  configured: boolean;
  csrfToken?: string;
  user?: {
    login: string;
    id: number;
  };
};

export type PublishResult = {
  commitSha: string;
  commitUrl: string;
  permalink: string;
  sourcePath: string;
  mode: 'create' | 'update';
};

export type PublishState =
  | 'queued'
  | 'building'
  | 'deploying'
  | 'live'
  | 'failed'
  | 'unknown';

export type PublishStatus = {
  state: PublishState;
  runUrl?: string;
  conclusion?: string | null;
  status?: string;
  message?: string;
  result?: PublishResult;
};

export type EditorState = {
  title: string;
  slug: string;
  date: string;
  tags: string;
  categories: string;
  cover: string;
  description: string;
  content: string;
  sourcePath: string | null;
};