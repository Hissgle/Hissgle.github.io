import { GitHubIcon } from './Icons';

const ERROR_MESSAGES: Record<string, string> = {
  forbidden: '这个 GitHub 账号不是站长，没有发布权限。',
  repository: '这个 GitHub 账号没有该仓库的写入权限。',
  state: '登录状态已过期，请重新点一次登录。',
  oauth: 'GitHub 没有返回授权码，请重试。',
  oauth_failed: 'GitHub 登录失败，请稍后重试。',
  config: '管理端还没有配置好，请检查 Vercel 环境变量。',
};

type Props = {
  configured: boolean;
  error?: string;
};

export function Login({ configured, error }: Props) {
  return (
    <div className="login-page">
      <div className="login-glow" aria-hidden="true" />
      <div className="login-card">
        <div className="login-mark">H</div>
        <p className="login-kicker">HISSGLE · WRITING DESK</p>
        <h1>写作台</h1>
        <p className="login-desc">
          写完，发布，剩下的交给 GitHub Actions。
          <br />
          这里只有站长本人能进入。
        </p>

        {error ? (
          <div className="login-error" role="alert">
            {ERROR_MESSAGES[error] ?? '登录没有完成，请重试。'}
          </div>
        ) : null}

        {configured ? (
          <a className="login-button" href="/api/auth/login">
            <GitHubIcon size={20} />
            使用 GitHub 登录
          </a>
        ) : (
          <div className="login-error" role="alert">
            管理端环境变量尚未配置完整。请先按 <code>admin/README.md</code> 完成
            OAuth、PAT、Neon 和 Vercel 设置。
          </div>
        )}

        <div className="login-foot">
          <a href="https://hissgle.github.io" rel="noreferrer">
            返回博客
          </a>
          <span>·</span>
          <span>仅站长可用</span>
        </div>
      </div>
    </div>
  );
}