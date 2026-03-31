import type { AgentStreamEvent } from '../types/agent';

interface SubscribeAgentSessionStreamOptions {
  since?: number;
  onOpen?: () => void;
  onEvent?: (event: AgentStreamEvent) => void;
  onError?: (error: Error) => void;
}

export const subscribeAgentSessionStream = (
  sessionId: string,
  options: SubscribeAgentSessionStreamOptions,
) => {
  const query = typeof options.since === 'number' && options.since > 0 ? `?since=${options.since}` : '';
  const source = new EventSource(`/api/agents/sessions/${encodeURIComponent(sessionId)}/stream${query}`, { withCredentials: true });

  source.onopen = () => {
    options.onOpen?.();
  };

  source.onmessage = (event) => {
    try {
      const payload = JSON.parse(event.data) as AgentStreamEvent;
      options.onEvent?.(payload);
      if (payload.type === 'done' || payload.type === 'error') {
        source.close();
      }
    } catch (error) {
      options.onError?.(error instanceof Error ? error : new Error('Invalid stream event payload.'));
    }
  };

  source.onerror = () => {
    source.close();
    options.onError?.(new Error('Agent stream disconnected.'));
  };

  return () => {
    source.close();
  };
};
