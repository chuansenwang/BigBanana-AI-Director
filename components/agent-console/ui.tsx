import React from 'react';
import { AgentRunStatus } from '../../types/agent';

const baseCardClass = 'border border-[var(--border-primary)] bg-[var(--bg-primary)]';

export const SectionCard: React.FC<{
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}> = ({ title, description, action, className = '', children }) => (
  <section className={`${baseCardClass} p-6 ${className}`.trim()}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h2 className="text-sm font-bold text-[var(--text-primary)] uppercase tracking-widest">{title}</h2>
        {description && <p className="mt-1 text-xs text-[var(--text-tertiary)] leading-relaxed">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
    <div className="mt-5">{children}</div>
  </section>
);

export const EmptyState: React.FC<{
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ title, description, action }) => (
  <div className="border border-dashed border-[var(--border-primary)] p-10 text-center text-[var(--text-muted)]">
    <div className="text-sm font-bold text-[var(--text-primary)]">{title}</div>
    <div className="mt-2 text-[10px] text-[var(--text-tertiary)] font-mono leading-relaxed">{description}</div>
    {action && <div className="mt-5">{action}</div>}
  </div>
);

const STATUS_LABELS: Record<AgentRunStatus, string> = {
  idle: '未开始',
  queued: '排队中',
  running: '执行中',
  waiting_input: '等待输入',
  completed: '已完成',
  failed: '执行失败',
  cancelled: '已取消',
};

const STATUS_CLASS_NAMES: Record<AgentRunStatus, string> = {
  idle: 'border-[var(--border-primary)] text-[var(--text-muted)]',
  queued: 'border-[var(--warning)]/40 text-[var(--warning)]',
  running: 'border-[var(--accent-text)]/40 text-[var(--accent-text)]',
  waiting_input: 'border-[var(--border-primary)] text-[var(--text-tertiary)]',
  completed: 'border-[var(--success)]/40 text-[var(--success)]',
  failed: 'border-[var(--error-text)]/40 text-[var(--error-text)]',
  cancelled: 'border-[var(--border-primary)] text-[var(--text-muted)]',
};

export const AgentStatusBadge: React.FC<{ status: AgentRunStatus }> = ({ status }) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest ${STATUS_CLASS_NAMES[status]}`}>
    {STATUS_LABELS[status]}
  </span>
);

export const formatConsoleTime = (timestamp?: number): string => {
  if (!timestamp) return '--';
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
};
