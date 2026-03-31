import { spawn } from 'node:child_process';
import { findAgentDefinition } from '../agentDefinitions.mjs';

const stripAnsi = (value) => String(value || '').replace(/\u001B\[[0-9;]*m/g, '');

const decodeChunk = (chunk, encoding = 'utf8') => {
  try {
    return new TextDecoder(encoding).decode(chunk);
  } catch {
    return chunk.toString('utf8');
  }
};

export const buildOpenCodeAgentPrompt = ({ agent, input }) => [
  '[OpenCode Agent Routing]',
  `Selected agent: ${agent.cliName || agent.label} (${agent.key})`,
  `Agent role: ${agent.description}`,
  'Use this selected OpenCode agent as the primary execution mode for the task below.',
  'User request:',
  input,
].join('\n\n');

export const createOpenCodeSpawnSpec = ({
  binaryPath,
  args,
  platform = process.platform,
  comspec = process.env.ComSpec || 'cmd.exe',
}) => {
  const isWindowsShim = platform === 'win32' && /\.(cmd|bat)$/i.test(String(binaryPath || ''));
  if (isWindowsShim) {
    return {
      command: comspec,
      args: ['/d', '/s', '/c', binaryPath, ...args],
    };
  }

  return {
    command: binaryPath,
    args,
  };
};

export const createOpenCodeCliExecutor = ({
  binaryPath = 'opencode',
  timeoutMs = 900000,
  extraArgs = [],
  spawnImpl = spawn,
  platform = process.platform,
  comspec = process.env.ComSpec || 'cmd.exe',
} = {}) => ({
  startRun({ session, input, helpers }) {
    const startedAt = helpers.now();
    const assistantMessageId = helpers.createEntityId('msg');
    const toolCallId = helpers.createEntityId('tool');
    const agent = findAgentDefinition(session.agentKey);

    if (!agent) {
      helpers.emit({ type: 'run_status', status: 'queued' });
      helpers.emit({ type: 'run_status', status: 'running' });
      helpers.emit({
        type: 'tool_start',
        toolCallId,
        toolName: 'opencode_cli',
        summary: '通过 OpenCode CLI 执行当前任务',
      });
      helpers.emit({
        type: 'error',
        code: 'OPENCODE_AGENT_UNSUPPORTED',
        message: `Unknown OpenCode agent key: ${session.agentKey}`,
      });
      helpers.emit({ type: 'done' });
      return;
    }

    const routedInput = buildOpenCodeAgentPrompt({ agent, input });
    const spawnSpec = createOpenCodeSpawnSpec({
      binaryPath,
      args: ['run', ...extraArgs, routedInput],
      platform,
      comspec,
    });

    helpers.emit({ type: 'run_status', status: 'queued' });
    helpers.emit({ type: 'run_status', status: 'running' });
    helpers.emit({
      type: 'tool_start',
      toolCallId,
      toolName: 'opencode_cli',
      summary: '通过 OpenCode CLI 执行当前任务',
    });
    helpers.emit({
      type: 'message_start',
      message: {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        createdAt: helpers.now(),
        status: 'streaming',
      },
    });

    const child = spawnImpl(spawnSpec.command, spawnSpec.args, {
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finalizeWithError = (message, code = 'OPENCODE_EXECUTOR_ERROR') => {
      if (settled || helpers.isCancelled()) return;
      settled = true;
      helpers.clearRunResources();
      helpers.emit({
        type: 'tool_end',
        toolCallId,
        toolName: 'opencode_cli',
        summary: message,
      });
      helpers.emit({ type: 'error', code, message });
      helpers.emit({ type: 'done' });
    };

    const timer = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch {
        // Best-effort timeout cleanup.
      }
      finalizeWithError(`OpenCode CLI timed out after ${timeoutMs}ms.`, 'OPENCODE_TIMEOUT');
    }, timeoutMs);

    helpers.registerCleanup(() => clearTimeout(timer));
    helpers.registerCleanup(() => {
      try {
        if (!child.killed) {
          child.kill('SIGTERM');
        }
      } catch {
        // Process may already be gone.
      }
    });

    child.stdout.on('data', (chunk) => {
      if (helpers.isCancelled()) return;
      const delta = stripAnsi(decodeChunk(chunk, 'utf8'));
      stdout += delta;
      if (delta) {
        helpers.emit({ type: 'message_delta', messageId: assistantMessageId, delta });
      }
    });

    child.stderr.on('data', (chunk) => {
      stderr += stripAnsi(decodeChunk(chunk, platform === 'win32' ? 'gbk' : 'utf8'));
    });

    child.on('error', (error) => {
      finalizeWithError(error?.message || 'OpenCode CLI failed to start.');
    });

    child.on('close', (code) => {
      if (helpers.isCancelled()) return;
      if (settled) return;
      settled = true;
      helpers.clearRunResources();

      if (code !== 0) {
        const message = (stderr || stdout || `OpenCode CLI exited with code ${code ?? 'unknown'}.`).trim();
        helpers.emit({
          type: 'tool_end',
          toolCallId,
          toolName: 'opencode_cli',
          summary: message,
        });
        helpers.emit({ type: 'error', code: 'OPENCODE_EXECUTOR_ERROR', message });
        helpers.emit({ type: 'done' });
        return;
      }

      const finalText = (stdout || stderr || '').trim() || 'OpenCode CLI 已完成，但没有返回可展示内容。';
      helpers.emit({
        type: 'tool_end',
        toolCallId,
        toolName: 'opencode_cli',
        summary: 'OpenCode CLI 已完成输出。',
      });
      if (!stdout.trim()) {
        helpers.emit({ type: 'message_delta', messageId: assistantMessageId, delta: finalText });
      }
      helpers.emit({
        type: 'artifact_ready',
        artifact: helpers.createReportArtifact('OpenCode CLI 结果', finalText),
      });
      helpers.emit({ type: 'message_done', messageId: assistantMessageId });
      helpers.emit({
        type: 'usage',
        usage: {
          elapsedMs: helpers.now() - startedAt,
          toolCalls: 1,
        },
      });
      helpers.emit({ type: 'run_status', status: 'completed' });
      helpers.emit({ type: 'done' });
    });
  },
});
