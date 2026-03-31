import React from 'react';
import type { AgentSessionDetail } from '../../types/agent';
import { EmptyState, SectionCard, formatConsoleTime } from './ui';

interface ArtifactPaneProps {
  session: AgentSessionDetail | null;
  canApply: boolean;
  onApplyArtifact: (artifactId: string, candidateId?: string) => void;
}

const ArtifactPane: React.FC<ArtifactPaneProps> = ({ session, canApply, onApplyArtifact }) => {
  return (
    <SectionCard title="产物" description="Mock 智能体会生成一个可应用的建议摘要，用于验证 apply 流程。">
      {!session ? (
        <EmptyState title="暂无产物" description="执行一个会话后，这里会显示报告、补丁或其他结果。" />
      ) : session.artifacts.length === 0 ? (
        <EmptyState title="当前还没有产物" description="等待本次会话输出完成后，这里会出现报告摘要。" />
      ) : (
        <div className="space-y-3">
          {session.artifacts.map((artifact) => {
            const primaryCandidate = artifact.applyCandidates?.[0];
            return (
              <div key={artifact.id} className="border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[var(--text-primary)]">{artifact.title}</div>
                    <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">
                      {artifact.type} · {formatConsoleTime(artifact.createdAt)}
                    </div>
                  </div>
                  {primaryCandidate && canApply && (
                    <button
                      onClick={() => onApplyArtifact(artifact.id, primaryCandidate.id)}
                      className="shrink-0 bg-[var(--btn-primary-bg)] px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-[var(--btn-primary-text)]"
                    >
                      应用
                    </button>
                  )}
                </div>
                <div className="mt-3 text-sm leading-relaxed text-[var(--text-tertiary)] whitespace-pre-wrap">
                  {artifact.previewText || '暂无预览'}
                </div>
                {!canApply && (
                  <div className="mt-3 text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">
                    当前范围暂不支持直接写入分集，仅保留产物预览。
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
};

export default ArtifactPane;
