import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import {
  buildOpenCodeAgentPrompt,
  createOpenCodeCliExecutor,
  createOpenCodeSpawnSpec,
} from './openCodeCliExecutor.mjs';

const createHelpers = () => {
  const events = [];
  const cleanups = [];
  return {
    events,
    emit(payload) {
      events.push(payload);
      return payload;
    },
    createEntityId(prefix) {
      return `${prefix}_test`;
    },
    createReportArtifact(title, previewText, mimeType = 'application/json') {
      return {
        id: 'artifact_test',
        type: 'report',
        title,
        mimeType,
        previewText,
        createdAt: Date.now(),
        applyCandidates: [],
      };
    },
    registerCleanup(cleanup) {
      cleanups.push(cleanup);
      return cleanup;
    },
    clearRunResources() {
      while (cleanups.length) {
        const cleanup = cleanups.pop();
        cleanup?.();
      }
    },
    isCancelled() {
      return false;
    },
    now() {
      return Date.now();
    },
  };
};

test('buildOpenCodeAgentPrompt routes the selected real agent into the prompt body', () => {
  const prompt = buildOpenCodeAgentPrompt({
    agent: {
      key: 'hephaestus',
      label: 'Hephaestus',
      cliName: 'Hephaestus',
      description: 'Deep Agent，适合需要深挖上下文和自主推进的任务。',
    },
    input: '请分析当前项目结构。',
  });

  assert.match(prompt, /Selected agent: Hephaestus \(hephaestus\)/);
  assert.match(prompt, /请分析当前项目结构/);
});

test('createOpenCodeSpawnSpec uses cmd.exe for Windows npm .cmd shims', () => {
  const spec = createOpenCodeSpawnSpec({
    binaryPath: 'C:\\Users\\ASDWERT\\AppData\\Roaming\\npm\\opencode.cmd',
    args: ['run', 'hello'],
    platform: 'win32',
    comspec: 'C:\\Windows\\System32\\cmd.exe',
  });

  assert.equal(spec.command, 'C:\\Windows\\System32\\cmd.exe');
  assert.deepEqual(spec.args.slice(0, 3), ['/d', '/s', '/c']);
  assert.equal(spec.args[3], 'C:\\Users\\ASDWERT\\AppData\\Roaming\\npm\\opencode.cmd');
  assert.equal(spec.args[4], 'run');
  assert.equal(spec.args[5], 'hello');
});

test('executor fails cleanly for unknown agent keys without spawning', async () => {
  let spawnCalls = 0;
  const executor = createOpenCodeCliExecutor({
    spawnImpl() {
      spawnCalls += 1;
      throw new Error('should not spawn');
    },
  });
  const helpers = createHelpers();

  executor.startRun({
    session: { agentKey: 'unknown-agent' },
    input: 'hello',
    helpers,
  });

  assert.equal(spawnCalls, 0);
  assert.equal(helpers.events.some((event) => event.type === 'error' && event.code === 'OPENCODE_AGENT_UNSUPPORTED'), true);
  assert.equal(helpers.events.some((event) => event.type === 'done'), true);
});

test('executor routes selected agent into spawned OpenCode input', async () => {
  const calls = [];
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = () => {
    child.killed = true;
  };

  const executor = createOpenCodeCliExecutor({
    binaryPath: 'opencode',
    spawnImpl(command, args) {
      calls.push({ command, args });
      queueMicrotask(() => child.emit('close', 0));
      return child;
    },
  });
  const helpers = createHelpers();

  executor.startRun({
    session: { agentKey: 'prometheus' },
    input: '帮我先做规划。',
    helpers,
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].command, 'opencode');
  assert.equal(calls[0].args[0], 'run');
  assert.match(calls[0].args[calls[0].args.length - 1], /Selected agent: Prometheus \(prometheus\)/);
  assert.match(calls[0].args[calls[0].args.length - 1], /帮我先做规划/);
});

test('executor preserves stderr text from Windows cmd shim failures', async () => {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = () => {
    child.killed = true;
  };

  const executor = createOpenCodeCliExecutor({
    binaryPath: 'C:\\Users\\ASDWERT\\AppData\\Roaming\\npm\\opencode.cmd',
    platform: 'win32',
    spawnImpl() {
      queueMicrotask(() => {
        child.stderr.emit('data', Buffer.from('The system cannot find the path specified.', 'utf8'));
        child.emit('close', 1);
      });
      return child;
    },
  });
  const helpers = createHelpers();

  executor.startRun({
    session: { agentKey: 'sisyphus' },
    input: 'hello',
    helpers,
  });

  await new Promise((resolve) => setTimeout(resolve, 0));

  const errorEvent = helpers.events.find((event) => event.type === 'error');
  assert.ok(errorEvent);
  assert.match(errorEvent.message, /The system cannot find the path specified\./);
});
