import React from 'react';
import { ChevronLeft, ChevronRight, Sparkles, Trash2, Send, MessageSquareText } from 'lucide-react';
import { CreativeCopilotMessage, CreativeCopilotStarterPrompt } from './creativeCopilot';

interface Props {
  isOpen: boolean;
  draft: string;
  messages: CreativeCopilotMessage[];
  selectedText: string;
  starterPrompts: CreativeCopilotStarterPrompt[];
  onToggle: () => void;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onClear: () => void;
  onStarterPromptSelect: (prompt: string) => void;
}

const SELECTION_PREVIEW_LIMIT = 180;

const clipSelection = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length <= SELECTION_PREVIEW_LIMIT) {
    return trimmed;
  }

  return `${trimmed.slice(0, SELECTION_PREVIEW_LIMIT)}…`;
};

const CreativeCopilotDock: React.FC<Props> = ({
  isOpen,
  draft,
  messages,
  selectedText,
  starterPrompts,
  onToggle,
  onDraftChange,
  onSend,
  onClear,
  onStarterPromptSelect,
}) => {
  const hasSelection = selectedText.trim().length > 0;
  const hasDraft = draft.trim().length > 0;
  const selectionPreview = hasSelection ? clipSelection(selectedText) : '';

  const handleComposerKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      onSend();
    }
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={onToggle}
        className="flex h-full w-14 shrink-0 flex-col items-center justify-between border-l border-[var(--border-primary)] bg-[var(--bg-primary)] px-2 py-4 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--bg-surface)] hover:text-[var(--text-primary)]"
        aria-label="打开创意副驾"
        title="打开创意副驾"
      >
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[var(--accent-border)] bg-[var(--accent-bg)] text-[var(--accent-text)]">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex flex-col items-center gap-1 text-center">
            <span className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Dock</span>
            <span className="text-[11px] font-medium leading-tight text-[var(--text-secondary)]">创意副驾</span>
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          {hasSelection && (
            <div className="rounded-full border border-[var(--accent-border)] bg-[var(--accent-bg)] px-2 py-1 text-[10px] font-mono text-[var(--accent-text)]">
              已选段
            </div>
          )}
          <ChevronLeft className="h-4 w-4" />
        </div>
      </button>
    );
  }

  return (
    <aside className="flex h-full w-80 shrink-0 flex-col border-l border-[var(--border-primary)] bg-[var(--bg-primary)]">
      <div className="border-b border-[var(--border-primary)] px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl border border-[var(--accent-border)] bg-[var(--accent-bg)] text-[var(--accent-text)]">
                <Sparkles className="h-4 w-4" />
              </div>
              <div>
                <div className="text-sm font-semibold text-[var(--text-primary)]">创意副驾</div>
                <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Local Story Copilot</div>
              </div>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-[var(--text-tertiary)]">
              本地聊天 MVP，只陪你聊创意、结构和镜头感，不会自动改动剧本内容。
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClear}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-primary)] bg-[var(--bg-surface)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--border-secondary)] hover:text-[var(--text-primary)]"
              aria-label="清空对话"
              title="清空对话"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={onToggle}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--border-primary)] bg-[var(--bg-surface)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--border-secondary)] hover:text-[var(--text-primary)]"
              aria-label="收起创意副驾"
              title="收起创意副驾"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-4 rounded-xl border border-[var(--border-primary)] bg-[var(--bg-surface)] px-3 py-3">
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">
            <MessageSquareText className="h-3.5 w-3.5" />
            当前上下文
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
            {hasSelection ? '已锁定编辑器选段，接下来的本地回复会优先围绕它展开。' : '尚未锁定选段，当前回复会默认从整段故事目标出发。'}
          </p>
          {hasSelection && (
            <div className="mt-3 rounded-lg border border-[var(--accent-border)] bg-[var(--accent-bg)] px-3 py-2 text-xs leading-relaxed text-[var(--text-secondary)]">
              {selectionPreview}
            </div>
          )}
        </div>

        <div className="mt-4">
          <div className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">Starter Prompts</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {starterPrompts.map((prompt) => (
              <button
                key={prompt.id}
                type="button"
                onClick={() => onStarterPromptSelect(prompt.prompt)}
                className="rounded-full border border-[var(--border-primary)] bg-[var(--bg-surface)] px-3 py-1.5 text-left text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--accent-border)] hover:text-[var(--text-primary)]"
              >
                {prompt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4">
        <div className="space-y-3">
          {messages.map((message) => {
            const isAssistant = message.role === 'assistant';

            return (
              <div
                key={message.id}
                className={`flex ${isAssistant ? 'justify-start' : 'justify-end'}`}
              >
                <div
                  className={`max-w-full rounded-2xl border px-3 py-3 text-xs leading-relaxed whitespace-pre-wrap ${
                    isAssistant
                      ? 'border-[var(--border-primary)] bg-[var(--bg-surface)] text-[var(--text-secondary)]'
                      : 'border-[var(--accent-border)] bg-[var(--accent-bg)] text-[var(--text-primary)]'
                  }`}
                >
                  <div className={`mb-2 font-mono text-[10px] uppercase tracking-widest ${isAssistant ? 'text-[var(--text-muted)]' : 'text-[var(--accent-text)]'}`}>
                    {isAssistant ? 'Copilot' : 'You'}
                  </div>
                  {message.content}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="border-t border-[var(--border-primary)] bg-[var(--bg-primary)] px-4 py-4">
        <label className="font-mono text-[10px] uppercase tracking-widest text-[var(--text-muted)]">
          创意提问
        </label>
        <textarea
          value={draft}
          onChange={(event) => onDraftChange(event.target.value)}
          onKeyDown={handleComposerKeyDown}
          rows={4}
          placeholder="输入你想讨论的创意问题，例如：这段戏还缺什么情绪推进？"
          className="mt-2 w-full resize-none rounded-xl border border-[var(--border-primary)] bg-[var(--bg-surface)] px-3 py-3 text-sm leading-relaxed text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--border-secondary)]"
        />
        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
            支持多轮本地聊天，使用 Ctrl/Cmd + Enter 快速发送。
          </p>
          <button
            type="button"
            onClick={onSend}
            disabled={!hasDraft}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold transition-colors ${
              hasDraft
                ? 'bg-[var(--btn-primary-bg)] text-[var(--btn-primary-text)] hover:bg-[var(--btn-primary-hover)]'
                : 'cursor-not-allowed bg-[var(--bg-surface)] text-[var(--text-muted)]'
            }`}
          >
            <Send className="h-3.5 w-3.5" />
            发送
          </button>
        </div>
      </div>
    </aside>
  );
};

export default CreativeCopilotDock;
