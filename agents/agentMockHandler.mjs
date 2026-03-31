import { randomUUID } from 'node:crypto';
import { AGENT_DEFINITIONS } from './agentDefinitions.mjs';
import { createMockExecutor } from './executors/mockExecutor.mjs';

const json = (res, statusCode, payload) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
};

const createRequestError = (message, statusCode, code) => Object.assign(new Error(message), {
  statusCode,
  code,
});

const parseJsonBody = async (req) => {
  const chunks = [];

  try {
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
  } catch {
    throw createRequestError('Failed to read request body.', 500, 'AGENT_RUNTIME_INTERNAL_ERROR');
  }

  if (!chunks.length) return {};

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw createRequestError('Invalid JSON request body.', 400, 'INVALID_JSON_REQUEST');
  }
};

const createSessionId = () => `ses_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
const createEntityId = (prefix) => `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

const toSessionSummary = (session) => ({
  id: session.id,
  title: session.title,
  agentKey: session.agentKey,
  status: session.status,
  scope: session.scope,
  createdAt: session.createdAt,
  updatedAt: session.updatedAt,
  lastMessagePreview: session.lastMessagePreview,
  hasArtifacts: session.hasArtifacts,
});

const toSessionDetail = (session) => ({
  ...toSessionSummary(session),
  messages: session.messages.map((item) => ({ ...item })),
  artifacts: session.artifacts.map((item) => ({
    ...item,
    applyCandidates: (item.applyCandidates || []).map((candidate) => ({
      ...candidate,
      payload: { ...candidate.payload },
      target: { ...candidate.target },
    })),
  })),
  timelineEvents: session.timelineEvents.map((item) => ({ ...item })),
  usage: session.usage ? { ...session.usage } : undefined,
  errorMessage: session.errorMessage,
});

const matchesSessionFilters = (session, params) => {
  const projectId = params.get('projectId');
  const episodeId = params.get('episodeId');
  const status = params.get('status');

  if (status && session.status !== status) return false;
  if (projectId) {
    if (session.scope.kind === 'global') return false;
    if (session.scope.projectId !== projectId) return false;
  }
  if (episodeId) {
    if (session.scope.kind !== 'episode') return false;
    if (session.scope.episodeId !== episodeId) return false;
  }
  return true;
};

const createApplyCandidate = (session, artifact, noteText) => {
  if (session.scope.kind !== 'episode') return null;

  return {
    id: createEntityId('candidate'),
    operation: 'append-note',
    title: '记录到分集智能体备注',
    summary: '把本次建议保存为当前分集的智能体备注。',
    target: {
      projectId: session.scope.projectId,
      episodeId: session.scope.episodeId,
      entityType: 'episode',
    },
    payload: {
      title: artifact.title,
      content: noteText,
    },
  };
};

const createSessionState = ({ agentKey, title, scope, initialPrompt }) => {
  const now = Date.now();

  return {
    id: createSessionId(),
    title: title || '新建智能体会话',
    agentKey,
    status: initialPrompt ? 'queued' : 'idle',
    scope,
    createdAt: now,
    updatedAt: now,
    lastMessagePreview: initialPrompt || '',
    hasArtifacts: false,
    messages: initialPrompt ? [{
      id: createEntityId('msg'),
      role: 'user',
      content: initialPrompt,
      createdAt: now,
      status: 'done',
    }] : [],
    artifacts: [],
    timelineEvents: [],
    usage: undefined,
    errorMessage: undefined,
    nextSeq: 0,
    runCleanups: new Set(),
    cancelRequested: false,
  };
};

const applyEventToSession = (session, event) => {
  session.timelineEvents.push(event);
  session.updatedAt = event.at;

  if (event.type === 'run_status') {
    session.status = event.status;
    if (event.status === 'cancelled') {
      session.messages = session.messages.map((message) => (
        message.status === 'streaming'
          ? { ...message, status: 'done' }
          : message
      ));
    }
    if (['completed', 'failed', 'cancelled'].includes(event.status)) {
      session.cancelRequested = false;
    }
    return;
  }

  if (event.type === 'message_start') {
    session.messages.push({ ...event.message });
    return;
  }

  if (event.type === 'message_delta') {
    session.messages = session.messages.map((message) => (
      message.id === event.messageId
        ? { ...message, content: `${message.content}${event.delta}` }
        : message
    ));
    return;
  }

  if (event.type === 'message_done') {
    session.messages = session.messages.map((message) => (
      message.id === event.messageId
        ? { ...message, status: 'done' }
        : message
    ));
    const completed = session.messages.find((message) => message.id === event.messageId);
    if (completed?.content) {
      session.lastMessagePreview = completed.content;
    }
    return;
  }

  if (event.type === 'artifact_ready') {
    session.artifacts.push({
      ...event.artifact,
      applyCandidates: (event.artifact.applyCandidates || []).map((candidate) => ({
        ...candidate,
        payload: { ...candidate.payload },
        target: { ...candidate.target },
      })),
    });
    session.hasArtifacts = true;
    return;
  }

  if (event.type === 'usage') {
    session.usage = { ...event.usage };
    return;
  }

  if (event.type === 'error') {
    session.messages = session.messages.map((message) => (
      message.status === 'streaming'
        ? { ...message, status: 'done' }
        : message
    ));
    session.errorMessage = event.message;
    session.status = 'failed';
    session.cancelRequested = false;
  }
};

const sendSseEvent = (res, event) => {
  res.write(`event: message\ndata: ${JSON.stringify(event)}\n\n`);
};

const closeStreams = (sessionId, streamClients) => {
  const clients = streamClients.get(sessionId);
  if (!clients?.size) return;
  for (const client of clients) {
    client.end();
  }
  streamClients.delete(sessionId);
};

const recordEvent = (session, streamClients, event) => {
  applyEventToSession(session, event);
  const clients = streamClients.get(session.id);
  if (clients?.size) {
    for (const client of clients) {
      sendSseEvent(client, event);
    }
  }
  if (event.type === 'done') {
    closeStreams(session.id, streamClients);
  }
};

const createStreamEvent = (session, payload) => ({
  ...payload,
  seq: ++session.nextSeq,
  at: Date.now(),
});

const clearSessionRunResources = (session) => {
  for (const cleanup of session.runCleanups) {
    try {
      cleanup();
    } catch {
      // Cleanup should be best-effort.
    }
  }
  session.runCleanups.clear();
};

const createExecutionHelpers = (session, streamClients) => ({
  emit(payload) {
    const event = createStreamEvent(session, payload);
    recordEvent(session, streamClients, event);
    return event;
  },
  createEntityId,
  createReportArtifact(title, previewText, mimeType = 'application/json') {
    const artifact = {
      id: createEntityId('art'),
      type: 'report',
      title,
      mimeType,
      previewText,
      createdAt: Date.now(),
    };
    const candidate = createApplyCandidate(session, artifact, previewText);
    artifact.applyCandidates = candidate ? [candidate] : [];
    return artifact;
  },
  registerCleanup(cleanup) {
    session.runCleanups.add(cleanup);
    return cleanup;
  },
  clearRunResources() {
    clearSessionRunResources(session);
  },
  isCancelled() {
    return session.cancelRequested || session.status === 'cancelled';
  },
  now() {
    return Date.now();
  },
});

export const createAgentMockHandler = ({
  agents = AGENT_DEFINITIONS,
  executor = createMockExecutor(),
  runtimeMetadata = { executorMode: 'mock' },
} = {}) => {
  const sessions = new Map();
  const streamClients = new Map();

  const startSessionRun = (session, input) => {
    session.cancelRequested = false;
    clearSessionRunResources(session);

    const helpers = createExecutionHelpers(session, streamClients);
    Promise.resolve(executor.startRun({ session, input, helpers })).catch((error) => {
      if (helpers.isCancelled()) return;
      const code = error?.code || 'AGENT_EXECUTOR_ERROR';
      const message = error?.message || 'Agent executor failed.';
      helpers.emit({ type: 'error', code, message });
      helpers.emit({ type: 'done' });
    });
  };

  return async (req, res) => {
    const requestUrl = new URL(req.url || '/', 'http://localhost');
    const { pathname, searchParams } = requestUrl;

    try {
      if (req.method === 'GET' && pathname === '/api/agents/bootstrap') {
        const items = Array.from(sessions.values())
          .filter((session) => matchesSessionFilters(session, searchParams))
          .sort((left, right) => right.updatedAt - left.updatedAt)
          .map(toSessionSummary);
        json(res, 200, { agents, sessions: items, runtime: runtimeMetadata });
        return true;
      }

      if (req.method === 'GET' && pathname === '/api/agents/sessions') {
        const items = Array.from(sessions.values())
          .filter((session) => matchesSessionFilters(session, searchParams))
          .sort((left, right) => right.updatedAt - left.updatedAt)
          .map(toSessionSummary);
        json(res, 200, { items, total: items.length });
        return true;
      }

      if (req.method === 'POST' && pathname === '/api/agents/sessions') {
        const payload = await parseJsonBody(req);
        if (!payload?.agentKey || !payload?.scope?.kind) {
          json(res, 400, { error: 'Invalid request.', code: 'INVALID_REQUEST' });
          return true;
        }

        const session = createSessionState(payload);
        sessions.set(session.id, session);
        json(res, 200, { session: toSessionSummary(session) });
        if (payload.initialPrompt) {
          startSessionRun(session, payload.initialPrompt);
        }
        return true;
      }

      const sessionMatch = pathname.match(/^\/api\/agents\/sessions\/([^/]+)$/);
      if (req.method === 'GET' && sessionMatch) {
        const session = sessions.get(sessionMatch[1]);
        if (!session) {
          json(res, 404, { error: 'Session not found.', code: 'SESSION_NOT_FOUND' });
          return true;
        }
        json(res, 200, { session: toSessionDetail(session) });
        return true;
      }

      const inputMatch = pathname.match(/^\/api\/agents\/sessions\/([^/]+)\/input$/);
      if (req.method === 'POST' && inputMatch) {
        const session = sessions.get(inputMatch[1]);
        if (!session) {
          json(res, 404, { error: 'Session not found.', code: 'SESSION_NOT_FOUND' });
          return true;
        }
        if (session.status === 'queued' || session.status === 'running') {
          json(res, 409, { error: 'Session is already running.', code: 'SESSION_STATE_CONFLICT' });
          return true;
        }

        const payload = await parseJsonBody(req);
        const content = String(payload?.content || '').trim();
        if (!content) {
          json(res, 400, { error: 'Prompt content is required.', code: 'INVALID_REQUEST' });
          return true;
        }

        session.messages.push({
          id: createEntityId('msg'),
          role: 'user',
          content,
          createdAt: Date.now(),
          status: 'done',
        });
        session.lastMessagePreview = content;
        session.updatedAt = Date.now();
        json(res, 200, { accepted: true, sessionId: session.id });
        startSessionRun(session, content);
        return true;
      }

      const cancelMatch = pathname.match(/^\/api\/agents\/sessions\/([^/]+)\/cancel$/);
      if (req.method === 'POST' && cancelMatch) {
        const session = sessions.get(cancelMatch[1]);
        if (!session) {
          json(res, 404, { error: 'Session not found.', code: 'SESSION_NOT_FOUND' });
          return true;
        }
        if (!['queued', 'running'].includes(session.status)) {
          json(res, 409, { error: 'Session is not cancellable.', code: 'SESSION_STATE_CONFLICT' });
          return true;
        }

        session.cancelRequested = true;
        try {
          await executor.cancelRun?.({ session, helpers: createExecutionHelpers(session, streamClients) });
        } catch {
          // Cancel remains best-effort. We still close the local run state.
        }
        clearSessionRunResources(session);

        const helpers = createExecutionHelpers(session, streamClients);
        helpers.emit({ type: 'run_status', status: 'cancelled' });
        helpers.emit({ type: 'done' });
        json(res, 200, { accepted: true, status: 'cancelled' });
        return true;
      }

      const applyMatch = pathname.match(/^\/api\/agents\/sessions\/([^/]+)\/apply$/);
      if (req.method === 'POST' && applyMatch) {
        const session = sessions.get(applyMatch[1]);
        if (!session) {
          json(res, 404, { error: 'Session not found.', code: 'SESSION_NOT_FOUND' });
          return true;
        }

        const payload = await parseJsonBody(req);
        const artifact = session.artifacts.find((item) => item.id === payload?.artifactId);
        if (!artifact) {
          json(res, 404, { error: 'Artifact not found.', code: 'ARTIFACT_NOT_FOUND' });
          return true;
        }
        const candidate = (artifact.applyCandidates || []).find((item) => item.id === payload?.candidateId)
          || artifact.applyCandidates?.[0];
        if (!candidate) {
          json(res, 404, { error: 'Apply candidate not found.', code: 'APPLY_CANDIDATE_NOT_FOUND' });
          return true;
        }
        json(res, 200, { accepted: true, summary: candidate.summary, candidate });
        return true;
      }

      const streamMatch = pathname.match(/^\/api\/agents\/sessions\/([^/]+)\/stream$/);
      if (req.method === 'GET' && streamMatch) {
        const session = sessions.get(streamMatch[1]);
        if (!session) {
          json(res, 404, { error: 'Session not found.', code: 'SESSION_NOT_FOUND' });
          return true;
        }

        const since = Number.parseInt(searchParams.get('since') || '0', 10) || 0;
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');

        const replayEvents = session.timelineEvents.filter((event) => event.seq > since);
        replayEvents.forEach((event) => sendSseEvent(res, event));

        if (session.status === 'completed' || session.status === 'failed' || session.status === 'cancelled') {
          res.end();
          return true;
        }

        if (!streamClients.has(session.id)) {
          streamClients.set(session.id, new Set());
        }
        streamClients.get(session.id).add(res);

        if (typeof req.on === 'function') {
          req.on('close', () => {
            const clients = streamClients.get(session.id);
            clients?.delete(res);
            if (clients && clients.size === 0) {
              streamClients.delete(session.id);
            }
          });
        }
        return true;
      }

      return false;
    } catch (error) {
      if (res.headersSent) {
        try {
          if (!res.writableEnded) {
            res.end();
          }
        } catch {
          res.destroy?.();
        }
        return true;
      }

      const statusCode = Number.isFinite(error?.statusCode) ? Number(error.statusCode) : 500;
      const code = error?.code || 'AGENT_RUNTIME_INTERNAL_ERROR';
      const message = error?.message || 'Agent runtime request failed.';
      json(res, statusCode, { error: message, code });
      return true;
    }
  };
};
