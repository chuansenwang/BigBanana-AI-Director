import React from 'react';
import { Bot, Loader2, Send, Square } from 'lucide-react';
import type { AgentSessionDetail } from '../../types/agent';
import { AgentStatusBadge, EmptyState, SectionCard, formatConsoleTime } from './ui';

interface ChatPaneProps {
  session: AgentSessionDetail | null;
  pageState: 'booting' | 'ready' | 'creating_session' | 'stream_connecting' | 'streaming' | 'submitting' | 'cancelling' | 'error';
  composerText: string;
  emptyStateDescription: string;
  helperText: string;
  onComposerChange: (value: string) => void;
  onSubmit: (content: string) => void;
  onCancel: () => void;
}

const ChatPane: React.FC<ChatPaneProps> = ({
  session,
  pageState,
  composerText,
  emptyStateDescription,
  helperText,
  onComposerChange,
  onSubmit,
  onCancel,
}) => {
  const isStreaming = pageState === 'stream_connecting' || pageState === 'streaming' || pageState === 'submitting';

  return (
    <SectionCard
      title={session?.title || '智能体工作区'}
      description={session ? '查看消息流、发送新输入，并观察当前 run 的执行状态。' : '请选择一个会话，或先在左侧创建新会话。'}
      action={session ? <AgentStatusBadge status={session.status} /> : undefined}
      className="h-full flex flex-col"
    >
      <div className="flex h-full min-h-[620px] flex-col border border-[var(--border-primary)] bg-[var(--bg-secondary)]">
        <div className="flex items-center justify-between border-b border-[var(--border-primary)] px-4 py-3">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">
            {session ? `会话 ID · ${session.id}` : '等待会话'}
          </div>
          {isStreaming && (
            <div className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-[var(--accent-text)]">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              流式输出中
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {!session ? (
            <EmptyState title="请选择一个会话" description="新建一个会话后，就可以在这里查看消息流与执行过程。" />
          ) : session.messages.length === 0 ? (
            <EmptyState title="还没有消息" description={emptyStateDescription} />
          ) : (
            <div className="space-y-4">
              {session.messages.map((message) => {
                const isUser = message.role === 'user';
                const isTool = message.role === 'tool';
                const bubbleClass = isUser
                  ? 'ml-auto bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] border-[var(--btn-primary-bg)]'
                  : isTool
                    ? 'border-[var(--warning)]/20 bg-[var(--warning)]/10 text-[var(--text-secondary)]'
                    : 'border-[var(--border-primary)] bg-[var(--bg-primary)] text-[var(--text-secondary)]';

                return (
                  <div key={message.id} className={`max-w-[82%] border px-4 py-3 ${bubbleClass}`}>
                    <div className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest opacity-75">
                      {message.role === 'assistant' ? <Bot className="w-3.5 h-3.5" /> : null}
                      <span>{message.role}</span>
                      <span>·</span>
                      <span>{formatConsoleTime(message.createdAt)}</span>
                    </div>
                    <div className="whitespace-pre-wrap text-sm leading-6">{message.content || (message.status === 'streaming' ? '...' : '')}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t border-[var(--border-primary)] bg-[var(--bg-primary)] p-4">
          <div className="flex flex-col gap-3">
            <textarea
              value={composerText}
              onChange={(event) => onComposerChange(event.target.value)}
              disabled={!session || pageState === 'creating_session' || pageState === 'cancelling'}
              rows={4}
              placeholder={session ? '描述你希望智能体现在做什么…' : '先在左侧创建会话'}
              className="w-full resize-none border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-3 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-text)] disabled:opacity-60"
            />
            <div className="flex items-center justify-between gap-3">
              <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">
                {helperText}
              </div>
              <div className="flex items-center gap-2">
                {session && (session.status === 'queued' || session.status === 'running') && (
                  <button
                    onClick={onCancel}
                    className="inline-flex items-center gap-2 border border-rose-500/40 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-rose-300 transition-colors hover:border-rose-400 hover:text-rose-200"
                  >
                    <Square className="w-3.5 h-3.5" />
                    取消运行
                  </button>
                )}
                <button
                  onClick={() => onSubmit(composerText)}
                  disabled={!session || !composerText.trim() || pageState === 'stream_connecting' || pageState === 'streaming' || pageState === 'submitting'}
                  className="inline-flex items-center gap-2 bg-[var(--btn-primary-bg)] px-4 py-2 text-[10px] font-bold uppercase tracking-widest text-[var(--btn-primary-text)] disabled:opacity-60"
                >
                  <Send className="w-3.5 h-3.5" />
                  发送
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </SectionCard>
  );
};

export default ChatPane;
