import { createMockExecutor } from './mockExecutor.mjs';
import { createOpenCodeCliExecutor } from './openCodeCliExecutor.mjs';

const DEFAULT_MODE = 'mock';

const normalizeExecutorMode = (value) => {
  const normalized = String(value || DEFAULT_MODE).trim().toLowerCase();
  if (['mock', 'opencode-cli', 'auto'].includes(normalized)) return normalized;
  if (!String(value || '').trim()) return DEFAULT_MODE;
  throw Object.assign(new Error(`Invalid agent runtime executor mode: ${String(value)}.`), {
    code: 'AGENT_RUNTIME_EXECUTOR_MODE_INVALID',
  });
};

export const resolveAgentExecutorConfig = (overrides = {}) => ({
  mode: normalizeExecutorMode(overrides.mode ?? process.env.AGENT_RUNTIME_EXECUTOR),
  enableOpenCode: String(overrides.enableOpenCode ?? (process.env.AGENT_RUNTIME_OPENCODE_ENABLE || '')).toLowerCase() === 'true',
  opencodeBinaryPath: String(overrides.opencodeBinaryPath ?? (process.env.AGENT_RUNTIME_OPENCODE_BINARY || 'opencode')).trim() || 'opencode',
  opencodeTimeoutMs: Number.parseInt(String(overrides.opencodeTimeoutMs ?? (process.env.AGENT_RUNTIME_OPENCODE_TIMEOUT_MS || '900000')), 10),
});

export const resolveEffectiveAgentExecutorMode = (overrides = {}) => {
  const config = resolveAgentExecutorConfig(overrides);
  if (config.mode === 'mock') return 'mock';
  if (config.mode === 'auto' && !config.enableOpenCode) return 'mock';
  return 'opencode-cli';
};

export const createAgentExecutor = (overrides = {}) => {
  const config = resolveAgentExecutorConfig(overrides);

  if (config.mode === 'mock') {
    return createMockExecutor();
  }

  if (config.mode === 'auto' && !config.enableOpenCode) {
    return createMockExecutor();
  }

  return createOpenCodeCliExecutor({
    binaryPath: config.opencodeBinaryPath,
    timeoutMs: Number.isFinite(config.opencodeTimeoutMs) ? config.opencodeTimeoutMs : 900000,
  });
};

export const createAgentExecutorRuntime = (overrides = {}) => ({
  executor: createAgentExecutor(overrides),
  executorMode: resolveEffectiveAgentExecutorMode(overrides),
});
