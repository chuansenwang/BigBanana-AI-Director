export type AgentRunStatus = 'idle' | 'queued' | 'running' | 'waiting_input' | 'completed' | 'failed' | 'cancelled';

export type AgentMessageRole = 'user' | 'assistant' | 'system' | 'tool';

export type AgentArtifactType = 'text' | 'json' | 'patch' | 'image' | 'file' | 'report';

export type AgentApplyOperation = 'append-note' | 'replace-analysis' | 'create-shot-draft' | 'patch-shot-summary';

export type AgentScope =
  | { kind: 'global' }
  | { kind: 'project'; projectId: string }
  | { kind: 'episode'; projectId: string; episodeId: string };

export interface AgentDefinition {
  key: string;
  label: string;
  description: string;
  tone: string;
}

export interface AgentMessage {
  id: string;
  role: AgentMessageRole;
  content: string;
  createdAt: number;
  toolName?: string;
  status?: 'streaming' | 'done' | 'error';
}

export interface AgentApplyTarget {
  projectId?: string;
  episodeId?: string;
  entityType?: 'episode' | 'shot' | 'character' | 'scene' | 'prop';
  entityId?: string;
}

export interface AgentApplyCandidate {
  id: string;
  operation: AgentApplyOperation;
  title: string;
  summary: string;
  target: AgentApplyTarget;
  payload: Record<string, unknown>;
}

export interface AgentArtifact {
  id: string;
  type: AgentArtifactType;
  title: string;
  mimeType?: string;
  downloadUrl?: string;
  previewText?: string;
  createdAt: number;
  applyCandidates?: AgentApplyCandidate[];
}

export interface AgentUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  toolCalls?: number;
  elapsedMs?: number;
}

interface AgentStreamEventBase {
  seq: number;
  at: number;
}

export type AgentStreamEvent =
  | (AgentStreamEventBase & { type: 'run_status'; status: AgentRunStatus })
  | (AgentStreamEventBase & { type: 'message_start'; message: AgentMessage })
  | (AgentStreamEventBase & { type: 'message_delta'; messageId: string; delta: string })
  | (AgentStreamEventBase & { type: 'message_done'; messageId: string })
  | (AgentStreamEventBase & { type: 'tool_start'; toolCallId: string; toolName: string; summary?: string })
  | (AgentStreamEventBase & { type: 'tool_end'; toolCallId: string; toolName: string; summary?: string })
  | (AgentStreamEventBase & { type: 'artifact_ready'; artifact: AgentArtifact })
  | (AgentStreamEventBase & { type: 'usage'; usage: AgentUsage })
  | (AgentStreamEventBase & { type: 'error'; code?: string; message: string })
  | (AgentStreamEventBase & { type: 'done' });

export interface AgentSessionSummary {
  id: string;
  title: string;
  agentKey: string;
  status: AgentRunStatus;
  scope: AgentScope;
  createdAt: number;
  updatedAt: number;
  lastMessagePreview?: string;
  hasArtifacts: boolean;
}

export interface AgentSessionDetail extends AgentSessionSummary {
  messages: AgentMessage[];
  artifacts: AgentArtifact[];
  timelineEvents: AgentStreamEvent[];
  usage?: AgentUsage;
  errorMessage?: string;
}

export interface AgentRuntimeMetadata {
  executorMode: 'mock' | 'opencode-cli';
}

export interface AgentBootstrapData {
  agents: AgentDefinition[];
  sessions: AgentSessionSummary[];
  runtime?: AgentRuntimeMetadata;
}

export interface AgentSessionListResponse {
  items: AgentSessionSummary[];
  total: number;
}

export interface CreateAgentSessionRequest {
  agentKey: string;
  title?: string;
  scope: AgentScope;
  initialPrompt?: string;
}

export interface CreateAgentSessionResponse {
  session: AgentSessionSummary;
}

export interface GetAgentSessionResponse {
  session: AgentSessionDetail;
}

export interface SendAgentInputRequest {
  content: string;
}

export interface ApplyAgentResultRequest {
  artifactId?: string;
  candidateId?: string;
  operation: AgentApplyOperation | 'apply_candidate';
  target?: AgentApplyTarget;
}

export interface ApplyAgentResultResponse {
  accepted: boolean;
  summary: string;
  candidate?: AgentApplyCandidate;
}
