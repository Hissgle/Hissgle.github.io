import type { PublishStatus } from '../types';
import { absoluteSiteUrl } from '../lib/format';
import {
  AlertIcon,
  CheckIcon,
  CloseIcon,
  ExternalIcon,
  SpinnerIcon,
} from './Icons';

type Props = {
  status: PublishStatus;
  title: string;
  onClose: () => void;
};

const STEPS = [
  { key: 'commit', label: '提交到 GitHub' },
  { key: 'build', label: 'Actions 构建' },
  { key: 'deploy', label: '部署 Pages' },
  { key: 'live', label: '线上生效' },
] as const;

function currentStep(state: PublishStatus['state']): number {
  switch (state) {
    case 'queued':
      return 0;
    case 'building':
      return 1;
    case 'deploying':
      return 2;
    case 'live':
      return 3;
    case 'failed':
      return 1;
    default:
      return 0;
  }
}

export function PublishDialog({ status, title, onClose }: Props) {
  const result = status.result;
  const activeIndex = currentStep(status.state);
  const liveUrl = result ? absoluteSiteUrl(result.permalink) : '';
  const working = status.state === 'queued' || status.state === 'building' || status.state === 'deploying';

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <div
        className="publish-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="发布状态"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="publish-dialog-head">
          <div>
            <p className="editor-kicker">PUBLISH</p>
            <h2>
              {status.state === 'live'
                ? '已经上线'
                : status.state === 'failed'
                  ? '发布没有完成'
                  : '正在发布'}
            </h2>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="关闭">
            <CloseIcon size={18} />
          </button>
        </div>

        <p className="publish-title" title={title}>
          {title || '无标题文章'}
        </p>

        <ol className="publish-steps">
          {STEPS.map((step, index) => {
            const done =
              status.state === 'live' ? index <= 3 : index < activeIndex;
            const current = index === activeIndex && status.state !== 'live';
            const failed = status.state === 'failed' && index === activeIndex;
            return (
              <li
                key={step.key}
                className={`${done ? 'is-done' : ''} ${current ? 'is-current' : ''} ${
                  failed ? 'is-failed' : ''
                }`}
              >
                <span className="step-marker">
                  {done ? (
                    <CheckIcon size={13} />
                  ) : failed ? (
                    <AlertIcon size={13} />
                  ) : current ? (
                    <SpinnerIcon size={13} />
                  ) : (
                    index + 1
                  )}
                </span>
                <span>{step.label}</span>
              </li>
            );
          })}
        </ol>

        {status.state === 'live' && result ? (
          <div className="publish-live">
            <p>文章已经通过 Actions 部署到 GitHub Pages。</p>
            <a className="publish-live-link" href={liveUrl} target="_blank" rel="noreferrer">
              打开文章
              <ExternalIcon size={15} />
            </a>
          </div>
        ) : null}

        {status.state === 'failed' ? (
          <div className="publish-failed" role="alert">
            <p>
              {status.message ||
                (status.conclusion
                  ? `Actions 结束状态：${status.conclusion}`
                  : '构建失败，或者等待超时。')}
            </p>
            <p className="muted">
              线上旧版本不受影响。可以查看日志，修好后重新点发布。
            </p>
          </div>
        ) : null}

        {working ? (
          <p className="publish-hint">
            通常需要 1–3 分钟。可以关闭这个窗口，发布会在后台继续；稍后刷新「已发布」列表即可。
          </p>
        ) : null}

        <div className="publish-links">
          {result?.commitUrl ? (
            <a href={result.commitUrl} target="_blank" rel="noreferrer">
              <ExternalIcon size={14} />
              查看提交
            </a>
          ) : null}
          {status.runUrl ? (
            <a href={status.runUrl} target="_blank" rel="noreferrer">
              <ExternalIcon size={14} />
              Actions 日志
            </a>
          ) : null}
        </div>

        <div className="publish-dialog-foot">
          <button type="button" className="ghost-button" onClick={onClose}>
            {working ? '先关掉，后台继续' : '关闭'}
          </button>
        </div>
      </div>
    </div>
  );
}