import React from 'react';
import { Loader2 } from 'lucide-react';
import type { AgentSessionDetail } from '../../types/agent';
import { EmptyState, SectionCard, formatConsoleTime } from './ui';

interface RunLogPaneProps {
  session: AgentSessionDetail | null;
}

const RunLogPane: React.FC<RunLogPaneProps> = ({ session }) => {
  const logItems = (session?.timelineEvents || []).filter((event) => (
    event.type === 'tool_start'
    || event.type === 'tool_end'
    || event.type === 'run_status'
    || event.type === 'error'
    || event.type === 'done'
  ));

  return (
    <SectionCard title="运行日志" description="保留当前 run 的状态流和工具执行摘要。">
      {!session ? (
        <EmptyState title="暂无日志" description="选择一个会话后，这里会显示工具调用和状态变化。" />
      ) : logItems.length === 0 ? (
        <EmptyState title="尚未开始执行" description="首次发送消息后，这里会出现工具和状态日志。" />
      ) : (
        <div className="space-y-3">
          {logItems.map((item) => (
            <div key={`${item.type}-${item.seq}`} className="border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">{item.type}</div>
                <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">{formatConsoleTime(item.at)}</div>
              </div>
              <div className="mt-2 text-sm text-[var(--text-secondary)] leading-relaxed">
                {item.type === 'tool_start' || item.type === 'tool_end' ? item.summary || item.toolName : null}
                {item.type === 'run_status' ? `状态切换为 ${item.status}` : null}
                {item.type === 'error' ? item.message : null}
                {item.type === 'done' ? '本次输出已完成，流连接会自动结束。' : null}
              </div>
            </div>
          ))}
          {session.status === 'running' && (
            <div className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-[var(--accent-text)]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Mock run 正在输出中
            </div>
          )}
        </div>
      )}
    </SectionCard>
  );
};

export default RunLogPane;
