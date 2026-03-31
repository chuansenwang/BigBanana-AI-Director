import React, { useMemo, useState } from 'react';
import { Plus, Sparkles } from 'lucide-react';
import type { AgentDefinition, AgentSessionSummary } from '../../types/agent';
import { AgentStatusBadge, EmptyState, SectionCard, formatConsoleTime } from './ui';

interface SessionListProps {
  agents: AgentDefinition[];
  sessions: AgentSessionSummary[];
  activeSessionId: string | null;
  isCreating: boolean;
  onSelectSession: (sessionId: string) => void;
  onCreateSession: (agentKey: string, title?: string) => void;
}

const SessionList: React.FC<SessionListProps> = ({
  agents,
  sessions,
  activeSessionId,
  isCreating,
  onSelectSession,
  onCreateSession,
}) => {
  const [agentKey, setAgentKey] = useState('');
  const [title, setTitle] = useState('');

  const selectedAgentLabel = useMemo(
    () => agents.find((item) => item.key === agentKey)?.label || '',
    [agentKey, agents],
  );

  return (
    <div className="space-y-5">
      <SectionCard
        title="新建会话"
        description="先选择一个智能体，再在右侧发送具体任务。"
        action={<Sparkles className="w-4 h-4 text-[var(--accent-text)]" />}
      >
        <div className="space-y-3">
          <select
            value={agentKey}
            onChange={(event) => setAgentKey(event.target.value)}
            className="w-full border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-text)]"
          >
            <option value="">选择智能体</option>
            {agents.map((agent) => (
              <option key={agent.key} value={agent.key}>{agent.label}</option>
            ))}
          </select>
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={selectedAgentLabel ? `${selectedAgentLabel} 会话` : '可选：自定义会话标题'}
            className="w-full border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-text)]"
          />
          <button
            onClick={() => {
              if (!agentKey) return;
              onCreateSession(agentKey, title.trim() || undefined);
              setTitle('');
            }}
            disabled={!agentKey || isCreating}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] text-xs font-bold uppercase tracking-widest disabled:opacity-60"
          >
            <Plus className="w-4 h-4" />
            {isCreating ? '创建中...' : '新建会话'}
          </button>
        </div>
      </SectionCard>

      <SectionCard title="最近会话" description="保留 mock 会话、流式日志和产物预览。">
        {sessions.length === 0 ? (
          <EmptyState title="还没有智能体会话" description="新建一个会话，让智能体基于当前范围开始工作。" />
        ) : (
          <div className="space-y-3">
            {sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              return (
                <button
                  key={session.id}
                  onClick={() => onSelectSession(session.id)}
                  className={`w-full border px-4 py-3 text-left transition-colors ${isActive ? 'border-[var(--accent-text)] bg-[var(--bg-secondary)]' : 'border-[var(--border-primary)] bg-[var(--bg-secondary)] hover:border-[var(--text-tertiary)]'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[var(--text-primary)]">{session.title}</div>
                      <div className="mt-1 text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">{session.agentKey}</div>
                    </div>
                    <AgentStatusBadge status={session.status} />
                  </div>
                  <div className="mt-3 text-xs leading-relaxed text-[var(--text-tertiary)] min-h-9">
                    {session.lastMessagePreview || '等待第一次输入'}
                  </div>
                  <div className="mt-3 text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">
                    更新于 {formatConsoleTime(session.updatedAt)}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
};

export default SessionList;
