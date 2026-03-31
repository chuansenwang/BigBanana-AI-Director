import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, Bot, Loader2, Sparkles } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAlert } from './GlobalAlert';
import type {
  AgentApplyCandidate,
  AgentArtifact,
  AgentDefinition,
  AgentSessionDetail,
  AgentSessionSummary,
  AgentStreamEvent,
} from '../types/agent';
import { loadEpisode, loadSeriesProject, saveEpisode } from '../services/storageService';
import {
  applyAgentResult,
  createAgentSession,
  fetchAgentBootstrap,
  getAgentSession,
  sendAgentSessionInput,
  cancelAgentSession,
} from '../services/agentConsoleService';
import { subscribeAgentSessionStream } from '../services/agentStreamService';
import SessionList from './agent-console/SessionList';
import ChatPane from './agent-console/ChatPane';
import RunLogPane from './agent-console/RunLogPane';
import ArtifactPane from './agent-console/ArtifactPane';
import ApplyChangesPanel from './agent-console/ApplyChangesPanel';
import { AgentStatusBadge, EmptyState, SectionCard } from './agent-console/ui';

type PageState = 'booting' | 'ready' | 'creating_session' | 'stream_connecting' | 'streaming' | 'submitting' | 'cancelling' | 'error';

const createLocalMessageId = () => `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const readRuntimeExecutorMode = (payload: unknown): string | null => {
  if (!payload || typeof payload !== 'object') return null;

  const directKeys = ['executorMode', 'runtimeExecutorMode'];
  const sources: Array<Record<string, unknown>> = [payload as Record<string, unknown>];

  for (const source of [...sources]) {
    for (const key of ['runtime', 'runtimeMeta', 'runtimeMetadata', 'metadata']) {
      const nested = source[key];
      if (nested && typeof nested === 'object') {
        sources.push(nested as Record<string, unknown>);
      }
    }
  }

  for (const source of sources) {
    for (const key of directKeys) {
      const value = source[key];
      if (typeof value === 'string' && value.trim()) {
        return value.trim();
      }
    }
  }

  return null;
};

const formatExecutorLabel = (mode: string | null) => {
  const normalized = mode?.trim().toLowerCase();

  if (!normalized) return '等待 Runtime';
  if (normalized === 'mock') return 'Mock';
  if (normalized === 'opencode-cli') return 'OpenCode CLI';

  return mode!
    .trim()
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
};

const getExecutorDisplayState = (mode: string | null) => {
  const normalized = mode?.trim().toLowerCase();
  const label = formatExecutorLabel(mode);

  if (normalized === 'mock') {
    return {
      badgeClassName: 'border border-[var(--warning)]/30 bg-[var(--warning)]/10 text-[var(--warning)]',
      badgeLabel: label,
      headerDescription: '当前工作台连接到 Mock 执行器，可用于验证会话、流式消息与产物应用流程。',
      emptyStateDescription: '在下方输入你的需求，Mock 执行器会返回示例流式建议和可应用产物。',
      helperText: '当前执行器为 Mock，适合验证前端状态和本地应用流程',
      agentFallbackDescription: '当前会话会通过 Mock 执行器返回流式事件。',
    };
  }

  if (normalized === 'opencode-cli') {
    return {
      badgeClassName: 'border border-[var(--accent-text)]/30 bg-[var(--accent-text)]/10 text-[var(--accent-text)]',
      badgeLabel: label,
      headerDescription: '当前工作台连接到 OpenCode CLI 执行器，消息与运行状态会反映真实 runtime 的执行结果。',
      emptyStateDescription: '在下方输入你的需求，OpenCode CLI 执行器会返回当前 run 的流式结果和可应用产物。',
      helperText: '当前执行器为 OpenCode CLI，输出会反映真实 runtime 的执行结果',
      agentFallbackDescription: '当前会话会通过 OpenCode CLI 执行器返回流式事件。',
    };
  }

  return {
    badgeClassName: 'border border-[var(--border-primary)] bg-[var(--bg-secondary)] text-[var(--text-secondary)]',
    badgeLabel: label,
    headerDescription: '当前工作台会根据 runtime 元数据展示执行器模式；元数据缺失时会继续以通用状态呈现会话与流式结果。',
    emptyStateDescription: '在下方输入你的需求，当前会话会返回流式结果与可应用产物。',
    helperText: '执行器模式将在 runtime 元数据就绪后显示，当前仍可继续会话与查看结果',
    agentFallbackDescription: '当前会话会通过当前 runtime 执行器返回流式事件。',
  };
};

const AgentConsole: React.FC = () => {
  const navigate = useNavigate();
  const { showAlert } = useAlert();
  const { projectId, episodeId } = useParams<{ projectId?: string; episodeId?: string }>();

  const [pageState, setPageState] = useState<PageState>('booting');
  const [agents, setAgents] = useState<AgentDefinition[]>([]);
  const [sessions, setSessions] = useState<AgentSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionDetailMap, setSessionDetailMap] = useState<Record<string, AgentSessionDetail>>({});
  const [composerText, setComposerText] = useState('');
  const [headerScopeLabel, setHeaderScopeLabel] = useState('全局工作台');
  const [runtimeExecutorMode, setRuntimeExecutorMode] = useState<string | null>(null);
  const [selectedArtifact, setSelectedArtifact] = useState<AgentArtifact | null>(null);
  const [selectedCandidate, setSelectedCandidate] = useState<AgentApplyCandidate | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [streamError, setStreamError] = useState<string | null>(null);

  const unsubscribeRef = useRef<null | (() => void)>(null);
  const sessionDetailMapRef = useRef<Record<string, AgentSessionDetail>>({});
  const lastSeqBySessionIdRef = useRef<Record<string, number>>({});

  const activeSession = useMemo(() => {
    if (!activeSessionId) return null;
    return sessionDetailMap[activeSessionId] || null;
  }, [activeSessionId, sessionDetailMap]);

  const executorDisplay = useMemo(() => getExecutorDisplayState(runtimeExecutorMode), [runtimeExecutorMode]);

  const buildScope = () => {
    if (projectId && episodeId) {
      return { kind: 'episode' as const, projectId, episodeId };
    }
    if (projectId) {
      return { kind: 'project' as const, projectId };
    }
    return { kind: 'global' as const };
  };

  const backTarget = episodeId && projectId
    ? `/project/${projectId}/episode/${episodeId}`
    : projectId
      ? `/project/${projectId}`
      : '/';

  const cleanupStream = () => {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
  };

  const patchSessionSummary = (sessionId: string, patch: Partial<AgentSessionSummary>) => {
    setSessions((prev) => prev.map((session) => (
      session.id === sessionId
        ? { ...session, ...patch, updatedAt: patch.updatedAt || Date.now() }
        : session
    )));
  };

  const upsertSessionSummary = (summary: AgentSessionSummary) => {
    setSessions((prev) => {
      const exists = prev.some((item) => item.id === summary.id);
      const next = exists
        ? prev.map((item) => item.id === summary.id ? summary : item)
        : [summary, ...prev];
      return [...next].sort((left, right) => right.updatedAt - left.updatedAt);
    });
  };

  const patchSessionDetail = (sessionId: string, updater: (prev: AgentSessionDetail) => AgentSessionDetail) => {
    setSessionDetailMap((prev) => {
      const current = prev[sessionId];
      if (!current) return prev;
      const next = {
        ...prev,
        [sessionId]: updater(current),
      };
      sessionDetailMapRef.current = next;
      return next;
    });
  };

  const setSessionDetail = (sessionId: string, detail: AgentSessionDetail) => {
    setSessionDetailMap((prev) => {
      const next = {
        ...prev,
        [sessionId]: detail,
      };
      sessionDetailMapRef.current = next;
      return next;
    });
  };

  const setLastSeq = (sessionId: string, seq: number) => {
    lastSeqBySessionIdRef.current = {
      ...lastSeqBySessionIdRef.current,
      [sessionId]: seq,
    };
  };

  const loadSessionDetail = async (sessionId: string): Promise<AgentSessionDetail> => {
    const payload = await getAgentSession(sessionId);
    setSessionDetail(sessionId, payload.session);
    const lastSeq = payload.session.timelineEvents[payload.session.timelineEvents.length - 1]?.seq || 0;
    setLastSeq(sessionId, lastSeq);
    upsertSessionSummary({
      id: payload.session.id,
      title: payload.session.title,
      agentKey: payload.session.agentKey,
      status: payload.session.status,
      scope: payload.session.scope,
      createdAt: payload.session.createdAt,
      updatedAt: payload.session.updatedAt,
      lastMessagePreview: payload.session.lastMessagePreview,
      hasArtifacts: payload.session.hasArtifacts,
    });
    return payload.session;
  };

  const handleStreamEvent = (sessionId: string, event: AgentStreamEvent) => {
    const lastSeq = lastSeqBySessionIdRef.current[sessionId] || 0;
    if (event.seq <= lastSeq) return;
    setLastSeq(sessionId, event.seq);

    if (!sessionDetailMapRef.current[sessionId]) return;

    if (event.type === 'run_status') {
      patchSessionSummary(sessionId, { status: event.status, updatedAt: event.at });
      patchSessionDetail(sessionId, (prev) => ({
        ...prev,
        status: event.status,
        updatedAt: event.at,
        timelineEvents: [...prev.timelineEvents, event],
      }));
      if (event.status === 'completed' || event.status === 'cancelled' || event.status === 'failed') {
        setPageState('ready');
      }
      return;
    }

    if (event.type === 'message_start') {
      patchSessionDetail(sessionId, (prev) => ({
        ...prev,
        messages: [...prev.messages, event.message],
        timelineEvents: [...prev.timelineEvents, event],
        updatedAt: event.at,
      }));
      patchSessionSummary(sessionId, { updatedAt: event.at });
      return;
    }

    if (event.type === 'message_delta') {
      patchSessionDetail(sessionId, (prev) => ({
        ...prev,
        messages: prev.messages.map((message) => (
          message.id === event.messageId
            ? { ...message, content: `${message.content}${event.delta}` }
            : message
        )),
        timelineEvents: [...prev.timelineEvents, event],
        updatedAt: event.at,
      }));
      return;
    }

    if (event.type === 'message_done') {
      const completedContent = sessionDetailMapRef.current[sessionId]?.messages.find((message) => message.id === event.messageId)?.content;
      patchSessionDetail(sessionId, (prev) => {
        const nextMessages = prev.messages.map((message) => (
          message.id === event.messageId
            ? { ...message, status: 'done' as const }
            : message
        ));
        return {
          ...prev,
          messages: nextMessages,
          lastMessagePreview: completedContent || prev.lastMessagePreview,
          timelineEvents: [...prev.timelineEvents, event],
          updatedAt: event.at,
        };
      });
      patchSessionSummary(sessionId, { lastMessagePreview: completedContent, updatedAt: event.at });
      return;
    }

    if (event.type === 'artifact_ready') {
      patchSessionDetail(sessionId, (prev) => ({
        ...prev,
        artifacts: [...prev.artifacts, event.artifact],
        hasArtifacts: true,
        timelineEvents: [...prev.timelineEvents, event],
        updatedAt: event.at,
      }));
      patchSessionSummary(sessionId, { hasArtifacts: true, updatedAt: event.at });
      return;
    }

    if (event.type === 'usage') {
      patchSessionDetail(sessionId, (prev) => ({
        ...prev,
        usage: event.usage,
        timelineEvents: [...prev.timelineEvents, event],
        updatedAt: event.at,
      }));
      return;
    }

    if (event.type === 'error') {
      patchSessionDetail(sessionId, (prev) => ({
        ...prev,
        errorMessage: event.message,
        status: 'failed',
        timelineEvents: [...prev.timelineEvents, event],
        updatedAt: event.at,
      }));
      patchSessionSummary(sessionId, { status: 'failed', updatedAt: event.at });
      setStreamError(event.message);
      setPageState('error');
      return;
    }

    patchSessionDetail(sessionId, (prev) => ({
      ...prev,
      timelineEvents: [...prev.timelineEvents, event],
      updatedAt: event.at,
    }));
    if (event.type === 'done') {
      setPageState('ready');
    }
  };

  const connectStream = (sessionId: string) => {
    cleanupStream();
    setPageState('stream_connecting');
    setStreamError(null);
    unsubscribeRef.current = subscribeAgentSessionStream(sessionId, {
      since: lastSeqBySessionIdRef.current[sessionId],
      onOpen: () => setPageState('streaming'),
      onEvent: (event) => handleStreamEvent(sessionId, event),
      onError: async (error) => {
        setStreamError(error.message);
        try {
          await loadSessionDetail(sessionId);
          setPageState('ready');
        } catch {
          setPageState('error');
        }
      },
    });
  };

  const handleSelectSession = async (sessionId: string) => {
    cleanupStream();
    setActiveSessionId(sessionId);
    const detail = sessionDetailMapRef.current[sessionId] || await loadSessionDetail(sessionId);
    if (detail.status === 'queued' || detail.status === 'running' || detail.status === 'waiting_input') {
      connectStream(sessionId);
    } else {
      setPageState('ready');
    }
  };

  const handleCreateSession = async (agentKey: string, title?: string) => {
    setPageState('creating_session');
    try {
      const payload = await createAgentSession({
        agentKey,
        title,
        scope: buildScope(),
      });
      upsertSessionSummary(payload.session);
      setActiveSessionId(payload.session.id);
      await loadSessionDetail(payload.session.id);
      setPageState('ready');
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '创建会话失败', { type: 'error' });
      setPageState('error');
    }
  };

  const handleSubmitInput = async (content: string) => {
    if (!activeSessionId || !content.trim()) return;
    setPageState('submitting');
    const optimisticMessage = {
      id: createLocalMessageId(),
      role: 'user' as const,
      content: content.trim(),
      createdAt: Date.now(),
      status: 'done' as const,
    };
    patchSessionDetail(activeSessionId, (prev) => ({
      ...prev,
      messages: [...prev.messages, optimisticMessage],
      lastMessagePreview: optimisticMessage.content,
      updatedAt: optimisticMessage.createdAt,
    }));
    patchSessionSummary(activeSessionId, {
      lastMessagePreview: optimisticMessage.content,
      updatedAt: optimisticMessage.createdAt,
    });

    try {
      await sendAgentSessionInput(activeSessionId, { content: optimisticMessage.content });
      setComposerText('');
      connectStream(activeSessionId);
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '发送消息失败', { type: 'error' });
      await loadSessionDetail(activeSessionId);
      setPageState('error');
    }
  };

  const handleCancelRun = async () => {
    if (!activeSessionId) return;
    setPageState('cancelling');
    try {
      await cancelAgentSession(activeSessionId);
      cleanupStream();
      await loadSessionDetail(activeSessionId);
      setPageState('ready');
    } catch (error) {
      showAlert(error instanceof Error ? error.message : '取消失败', { type: 'error' });
      setPageState('error');
    }
  };

  const handleApplyArtifact = (artifactId: string, candidateId?: string) => {
    if (!activeSession || activeSession.scope.kind !== 'episode') return;
    const artifact = activeSession.artifacts.find((item) => item.id === artifactId) || null;
    const candidate = artifact?.applyCandidates?.find((item) => item.id === candidateId)
      || artifact?.applyCandidates?.[0]
      || null;
    if (!artifact || !candidate) return;
    setSelectedArtifact(artifact);
    setSelectedCandidate(candidate);
    setApplyError(null);
  };

  const handleConfirmApply = async () => {
    if (!activeSessionId || !selectedArtifact || !selectedCandidate) return;
    setIsApplying(true);
    setApplyError(null);
    try {
      const payload = await applyAgentResult(activeSessionId, {
        artifactId: selectedArtifact.id,
        candidateId: selectedCandidate.id,
        operation: 'apply_candidate',
        target: selectedCandidate.target,
      });

      if (!episodeId || selectedCandidate.operation !== 'append-note') {
        showAlert(payload.summary, { type: 'success' });
        setSelectedArtifact(null);
        setSelectedCandidate(null);
        return;
      }

      const episode = await loadEpisode(episodeId);
      const nextNote = {
        id: `agent_note_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
        title: String(selectedCandidate.payload.title || selectedArtifact.title || '智能体建议'),
        content: String(selectedCandidate.payload.content || selectedArtifact.previewText || payload.summary),
        createdAt: Date.now(),
        sourceSessionId: activeSessionId,
        sourceAgentKey: activeSession?.agentKey,
      };
      await saveEpisode({
        ...episode,
        agentNotes: [...(episode.agentNotes || []), nextNote],
      });
      showAlert('已应用到当前分集的智能体备注。', { type: 'success' });
      setSelectedArtifact(null);
      setSelectedCandidate(null);
    } catch (error) {
      setApplyError(error instanceof Error ? error.message : '应用失败');
    } finally {
      setIsApplying(false);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      setPageState('booting');
      try {
        const [bootstrapPayload, scopeTitle] = await Promise.all([
          fetchAgentBootstrap({ projectId, episodeId }),
          (async () => {
            if (episodeId) {
              const episode = await loadEpisode(episodeId);
              return `当前分集 · ${episode.title}`;
            }
            if (projectId) {
              const project = await loadSeriesProject(projectId);
              return `当前项目 · ${project.title}`;
            }
            return '全局工作台';
          })(),
        ]);
        if (cancelled) return;
        setAgents(bootstrapPayload.agents);
        setSessions(bootstrapPayload.sessions);
        setHeaderScopeLabel(scopeTitle);
        setRuntimeExecutorMode(readRuntimeExecutorMode(bootstrapPayload));

        if (!bootstrapPayload.sessions.length) {
          setActiveSessionId(null);
          setPageState('ready');
          return;
        }

        const nextActiveId = bootstrapPayload.sessions[0].id;
        setActiveSessionId(nextActiveId);
        const detail = await loadSessionDetail(nextActiveId);
        if (cancelled) return;
        if (detail.status === 'queued' || detail.status === 'running' || detail.status === 'waiting_input') {
          connectStream(nextActiveId);
        } else {
          setPageState('ready');
        }
      } catch (error) {
        if (cancelled) return;
        setStreamError(error instanceof Error ? error.message : '初始化智能体工作台失败');
        setPageState('error');
      }
    };

    void bootstrap();

    return () => {
      cancelled = true;
      cleanupStream();
    };
  }, [projectId, episodeId]);

  return (
    <div className="min-h-screen bg-[var(--bg-base)] text-[var(--text-secondary)]">
      <div className="mx-auto flex min-h-screen max-w-[1680px] flex-col px-6 py-6">
        <div className="mb-6 flex items-start justify-between gap-4 border border-[var(--border-primary)] bg-[var(--bg-primary)] px-6 py-5">
          <div className="min-w-0">
            <button
              onClick={() => navigate(backTarget)}
              className="mb-3 inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)] transition-colors hover:text-[var(--text-primary)]"
            >
              <ArrowLeft className="w-4 h-4" />
              返回
            </button>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-[var(--text-primary)]">智能体工作台</h1>
              <span className={`inline-flex items-center gap-2 px-3 py-1 text-[10px] font-mono uppercase tracking-widest ${executorDisplay.badgeClassName}`}>
                <Sparkles className="w-3.5 h-3.5" />
                {executorDisplay.badgeLabel}
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--text-tertiary)]">
              {executorDisplay.headerDescription}
            </p>
          </div>

          <div className="grid min-w-[280px] gap-3 sm:grid-cols-2">
            <div className="border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-4">
              <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">当前范围</div>
              <div className="mt-2 text-sm font-medium text-[var(--text-primary)]">{headerScopeLabel}</div>
            </div>
            <div className="border border-[var(--border-primary)] bg-[var(--bg-secondary)] px-4 py-4">
              <div className="text-[10px] font-mono uppercase tracking-widest text-[var(--text-muted)]">当前状态</div>
              <div className="mt-2 flex items-center gap-2">
                {activeSession ? <AgentStatusBadge status={activeSession.status} /> : <span className="text-sm text-[var(--text-tertiary)]">等待会话</span>}
              </div>
            </div>
          </div>
        </div>

        {pageState === 'booting' ? (
          <div className="flex flex-1 items-center justify-center border border-[var(--border-primary)] bg-[var(--bg-primary)]">
            <div className="inline-flex items-center gap-3 text-sm text-[var(--text-tertiary)]">
              <Loader2 className="w-5 h-5 animate-spin text-[var(--accent-text)]" />
              正在初始化智能体工作台...
            </div>
          </div>
        ) : pageState === 'error' && !sessions.length ? (
          <SectionCard title="初始化失败" description="当前工作台还没加载完成，可以稍后刷新或返回工作区。">
            <EmptyState title="智能体工作台暂时不可用" description={streamError || '未能加载 bootstrap 数据。'} />
          </SectionCard>
        ) : (
          <div className="grid flex-1 grid-cols-1 gap-6 xl:grid-cols-[360px_minmax(0,1fr)_360px]">
            <SessionList
              agents={agents}
              sessions={sessions}
              activeSessionId={activeSessionId}
              isCreating={pageState === 'creating_session'}
              onSelectSession={handleSelectSession}
              onCreateSession={handleCreateSession}
            />

            <ChatPane
              session={activeSession}
              pageState={pageState}
              composerText={composerText}
              emptyStateDescription={executorDisplay.emptyStateDescription}
              helperText={executorDisplay.helperText}
              onComposerChange={setComposerText}
              onSubmit={handleSubmitInput}
              onCancel={handleCancelRun}
            />

            <div className="space-y-6">
              <SectionCard title="当前智能体" description="这里展示当前会话对应的 agent 类型和当前执行器模式。">
                {activeSession ? (
                  <div className="space-y-3">
                    <div className="inline-flex items-center gap-2 text-sm text-[var(--text-primary)]">
                      <Bot className="w-4 h-4 text-[var(--accent-text)]" />
                      <span className="font-semibold">{agents.find((item) => item.key === activeSession.agentKey)?.label || activeSession.agentKey}</span>
                    </div>
                    <p className="text-sm leading-relaxed text-[var(--text-tertiary)]">
                      {agents.find((item) => item.key === activeSession.agentKey)?.description || executorDisplay.agentFallbackDescription}
                    </p>
                  </div>
                ) : (
                  <EmptyState title="等待会话" description="左侧创建或选择一个会话后，这里会显示当前智能体概览。" />
                )}
              </SectionCard>

              <RunLogPane session={activeSession} />
              <ArtifactPane session={activeSession} canApply={activeSession?.scope.kind === 'episode'} onApplyArtifact={handleApplyArtifact} />
            </div>
          </div>
        )}
      </div>

      <ApplyChangesPanel
        artifact={selectedArtifact}
        candidate={selectedCandidate}
        isApplying={isApplying}
        errorMessage={applyError}
        onConfirm={handleConfirmApply}
        onClose={() => {
          setSelectedArtifact(null);
          setSelectedCandidate(null);
          setApplyError(null);
        }}
      />
    </div>
  );
};

export default AgentConsole;
