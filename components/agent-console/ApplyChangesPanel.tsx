import React from 'react';
import type { AgentApplyCandidate, AgentArtifact } from '../../types/agent';

interface ApplyChangesPanelProps {
  artifact: AgentArtifact | null;
  candidate: AgentApplyCandidate | null;
  isApplying: boolean;
  errorMessage?: string | null;
  onConfirm: () => void;
  onClose: () => void;
}

const ApplyChangesPanel: React.FC<ApplyChangesPanelProps> = ({
  artifact,
  candidate,
  isApplying,
  errorMessage,
  onConfirm,
  onClose,
}) => {
  if (!artifact || !candidate) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-6 backdrop-blur-sm">
      <div className="w-full max-w-2xl border border-[var(--border-primary)] bg-[var(--bg-primary)] p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">应用建议</div>
            <h2 className="mt-2 text-xl font-semibold text-[var(--text-primary)]">{artifact.title}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--text-tertiary)]">{candidate.summary}</p>
          </div>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm">关闭</button>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">目标</div>
            <div className="mt-2 text-sm text-[var(--text-secondary)]">{candidate.target.entityType || 'episode'}</div>
            <div className="mt-1 text-xs text-[var(--text-tertiary)]">projectId: {candidate.target.projectId || '--'}</div>
            <div className="mt-1 text-xs text-[var(--text-tertiary)]">episodeId: {candidate.target.episodeId || '--'}</div>
          </div>
          <div className="border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-4">
            <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">改动摘要</div>
            <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-secondary)]">
              {String(candidate.payload.content || artifact.previewText || '')}
            </div>
          </div>
        </div>

        {errorMessage && (
          <div className="mt-4 border border-[var(--error-text)]/30 bg-[var(--error-text)]/10 px-4 py-3 text-sm text-[var(--error-text)]">
            {errorMessage}
          </div>
        )}

        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="border border-[var(--border-primary)] px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            disabled={isApplying}
            className="bg-[var(--btn-primary-bg)] px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-[var(--btn-primary-text)] disabled:opacity-60"
          >
            {isApplying ? '应用中...' : '应用到当前分集'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ApplyChangesPanel;
