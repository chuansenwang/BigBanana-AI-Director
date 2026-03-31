import type {
  AgentBootstrapData,
  AgentSessionListResponse,
  ApplyAgentResultRequest,
  ApplyAgentResultResponse,
  CreateAgentSessionRequest,
  CreateAgentSessionResponse,
  GetAgentSessionResponse,
  SendAgentInputRequest,
} from '../types/agent';

interface AgentSessionQuery {
  projectId?: string;
  episodeId?: string;
  status?: string;
}

const buildQuery = (params: Record<string, string | undefined>) => {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (!value) return;
    query.set(key, value);
  });
  const queryText = query.toString();
  return queryText ? `?${queryText}` : '';
};

const requestJson = async <T>(input: RequestInfo | URL, init: RequestInit = {}): Promise<T> => {
  const response = await fetch(input, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload?.error || payload?.message || `请求失败（${response.status}）`);
  }
  return payload;
};

export const fetchAgentBootstrap = async (query: AgentSessionQuery = {}): Promise<AgentBootstrapData> => {
  return requestJson(`/api/agents/bootstrap${buildQuery({
    projectId: query.projectId,
    episodeId: query.episodeId,
    status: query.status,
  })}`);
};

export const listAgentSessions = async (query: AgentSessionQuery = {}): Promise<AgentSessionListResponse> => {
  return requestJson(`/api/agents/sessions${buildQuery({
    projectId: query.projectId,
    episodeId: query.episodeId,
    status: query.status,
  })}`);
};

export const createAgentSession = async (payload: CreateAgentSessionRequest): Promise<CreateAgentSessionResponse> => {
  return requestJson('/api/agents/sessions', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const getAgentSession = async (sessionId: string): Promise<GetAgentSessionResponse> => {
  return requestJson(`/api/agents/sessions/${encodeURIComponent(sessionId)}`);
};

export const sendAgentSessionInput = async (sessionId: string, payload: SendAgentInputRequest): Promise<{ accepted: true; sessionId: string }> => {
  return requestJson(`/api/agents/sessions/${encodeURIComponent(sessionId)}/input`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};

export const cancelAgentSession = async (sessionId: string): Promise<{ accepted: true; status: 'cancelled' | 'cancelling' }> => {
  return requestJson(`/api/agents/sessions/${encodeURIComponent(sessionId)}/cancel`, {
    method: 'POST',
  });
};

export const applyAgentResult = async (sessionId: string, payload: ApplyAgentResultRequest): Promise<ApplyAgentResultResponse> => {
  return requestJson(`/api/agents/sessions/${encodeURIComponent(sessionId)}/apply`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
};
