import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createAgentRuntimeHandler, createMockRequest } from './agentRuntimeCore.mjs';

const createMockResponse = () => {
  const chunks = [];
  const res = new PassThrough();
  res.headers = {};
  res.statusCode = 200;
  res.finished = false;
  res.on('data', (chunk) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  res.on('finish', () => {
    res.finished = true;
  });
  res.setHeader = (key, value) => {
    res.headers[String(key).toLowerCase()] = value;
  };
  res.getHeader = (key) => res.headers[String(key).toLowerCase()];
  res.toBuffer = () => Buffer.concat(chunks);
  res.toJson = () => JSON.parse(res.toBuffer().toString('utf8') || '{}');
  return res;
};

const invoke = async (handler, requestOptions) => {
  const req = createMockRequest(requestOptions);
  const res = createMockResponse();
  const handled = await handler(req, res);
  if (!res.finished) {
    await new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      res.once('finish', done);
      res.once('close', done);
    });
  }
  return { handled, req, res, json: () => res.toJson(), body: () => res.toBuffer().toString('utf8') };
};

test('runtime exposes bootstrap and session list routes', async () => {
  const handler = createAgentRuntimeHandler();

  const bootstrap = await invoke(handler, { url: '/api/agents/bootstrap' });
  assert.equal(bootstrap.handled, true);
  assert.equal(bootstrap.res.statusCode, 200);
  assert.equal(Array.isArray(bootstrap.json().agents), true);
  assert.deepEqual(bootstrap.json().agents.map((agent) => agent.key), ['sisyphus', 'hephaestus', 'prometheus', 'atlas']);
  assert.deepEqual(bootstrap.json().runtime, { executorMode: 'mock' });

  const list = await invoke(handler, { url: '/api/agents/sessions' });
  assert.equal(list.res.statusCode, 200);
  assert.deepEqual(list.json(), { items: [], total: 0 });
});

test('runtime bootstrap exposes effective OpenCode executor mode when configured', async () => {
  const handler = createAgentRuntimeHandler({
    executorConfig: {
      mode: 'opencode-cli',
      opencodeBinaryPath: '__missing_opencode_binary__',
    },
  });

  const bootstrap = await invoke(handler, { url: '/api/agents/bootstrap' });
  assert.equal(bootstrap.res.statusCode, 200);
  assert.deepEqual(bootstrap.json().runtime, { executorMode: 'opencode-cli' });
});

test('runtime uses injected executor without changing session contract', async () => {
  const calls = [];
  const handler = createAgentRuntimeHandler({
    executorMode: 'opencode-cli',
    executor: {
      startRun({ session, input, helpers }) {
        calls.push({ sessionId: session.id, input });
        const messageId = helpers.createEntityId('msg');
        helpers.emit({ type: 'run_status', status: 'queued' });
        helpers.emit({ type: 'run_status', status: 'running' });
        helpers.emit({
          type: 'message_start',
          message: {
            id: messageId,
            role: 'assistant',
            content: '',
            createdAt: helpers.now(),
            status: 'streaming',
          },
        });
        helpers.emit({ type: 'message_delta', messageId, delta: 'custom executor output' });
        helpers.emit({
          type: 'artifact_ready',
          artifact: helpers.createReportArtifact('Custom Executor Artifact', 'custom executor output'),
        });
        helpers.emit({ type: 'message_done', messageId });
        helpers.emit({ type: 'run_status', status: 'completed' });
        helpers.emit({ type: 'done' });
      },
    },
  });

  const created = await invoke(handler, {
    method: 'POST',
    url: '/api/agents/sessions',
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify({
      agentKey: 'sisyphus',
      scope: { kind: 'episode', projectId: 'project_custom', episodeId: 'episode_custom' },
      initialPrompt: 'custom executor prompt',
    })),
  });

  const sessionId = created.json().session.id;
  assert.equal(calls.length, 1);
  assert.equal(calls[0].input, 'custom executor prompt');

  const bootstrap = await invoke(handler, { url: '/api/agents/bootstrap' });
  assert.deepEqual(bootstrap.json().runtime, { executorMode: 'opencode-cli' });

  const stream = await invoke(handler, { url: `/api/agents/sessions/${sessionId}/stream` });
  assert.match(stream.body(), /custom executor output/);

  const detail = await invoke(handler, { url: `/api/agents/sessions/${sessionId}` });
  assert.equal(detail.json().session.status, 'completed');
  assert.equal(detail.json().session.artifacts[0].title, 'Custom Executor Artifact');
});

test('runtime auto mode falls back to mock executor by default', async () => {
  const handler = createAgentRuntimeHandler({
    executorConfig: { mode: 'auto', enableOpenCode: false },
  });

  const created = await invoke(handler, {
    method: 'POST',
    url: '/api/agents/sessions',
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify({
      agentKey: 'sisyphus',
      scope: { kind: 'episode', projectId: 'project_auto', episodeId: 'episode_auto' },
      initialPrompt: 'auto fallback prompt',
    })),
  });

  const sessionId = created.json().session.id;
  const stream = await invoke(handler, { url: `/api/agents/sessions/${sessionId}/stream` });
  assert.match(stream.body(), /"type":"artifact_ready"/);
  assert.match(stream.body(), /"type":"done"/);
});

test('runtime explicit OpenCode CLI mode fails in-band when binary is unavailable', async () => {
  const handler = createAgentRuntimeHandler({
    executorConfig: {
      mode: 'opencode-cli',
      opencodeBinaryPath: '__missing_opencode_binary__',
      opencodeTimeoutMs: 500,
    },
  });

  const created = await invoke(handler, {
    method: 'POST',
    url: '/api/agents/sessions',
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify({
      agentKey: 'sisyphus',
      scope: { kind: 'episode', projectId: 'project_real', episodeId: 'episode_real' },
      initialPrompt: 'real executor should fail safely',
    })),
  });

  const sessionId = created.json().session.id;
  const stream = await invoke(handler, { url: `/api/agents/sessions/${sessionId}/stream` });
  assert.match(stream.body(), /"type":"error"/);
  assert.match(stream.body(), /"type":"done"/);

  const detail = await invoke(handler, { url: `/api/agents/sessions/${sessionId}` });
  assert.equal(detail.json().session.status, 'failed');
});

test('runtime live failure stream includes error then done for OpenCode executor errors', async () => {
  const handler = createAgentRuntimeHandler({
    executorConfig: {
      mode: 'opencode-cli',
      opencodeBinaryPath: '__missing_opencode_binary__',
      opencodeTimeoutMs: 500,
    },
  });

  const created = await invoke(handler, {
    method: 'POST',
    url: '/api/agents/sessions',
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify({
      agentKey: 'sisyphus',
      scope: { kind: 'episode', projectId: 'project_live_fail', episodeId: 'episode_live_fail' },
      initialPrompt: 'live failure please',
    })),
  });

  const sessionId = created.json().session.id;
  const stream = await invoke(handler, { url: `/api/agents/sessions/${sessionId}/stream?since=0` });
  assert.match(stream.body(), /"type":"error"/);
  assert.match(stream.body(), /"type":"done"/);
});

test('runtime failed sessions do not retain streaming message state after OpenCode errors', async () => {
  const handler = createAgentRuntimeHandler({
    executorConfig: {
      mode: 'opencode-cli',
      opencodeBinaryPath: '__missing_opencode_binary__',
      opencodeTimeoutMs: 500,
    },
  });

  const created = await invoke(handler, {
    method: 'POST',
    url: '/api/agents/sessions',
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify({
      agentKey: 'sisyphus',
      scope: { kind: 'episode', projectId: 'project_fail_detail', episodeId: 'episode_fail_detail' },
      initialPrompt: 'detail failure cleanup please',
    })),
  });

  const sessionId = created.json().session.id;
  await invoke(handler, { url: `/api/agents/sessions/${sessionId}/stream` });
  const detail = await invoke(handler, { url: `/api/agents/sessions/${sessionId}` });

  assert.equal(detail.json().session.status, 'failed');
  assert.equal(detail.json().session.messages.some((message) => message.status === 'streaming'), false);
});

test('runtime rejects invalid executor mode values explicitly', async () => {
  assert.throws(
    () => createAgentRuntimeHandler({ executorConfig: { mode: 'broken-mode' } }),
    /Invalid agent runtime executor mode/
  );
});

test('runtime creates a session and streams deterministic events', async () => {
  const handler = createAgentRuntimeHandler();

  const created = await invoke(handler, {
    method: 'POST',
    url: '/api/agents/sessions',
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify({
      agentKey: 'sisyphus',
      title: 'Runtime Run',
      scope: { kind: 'episode', projectId: 'project_1', episodeId: 'episode_1' },
      initialPrompt: '请检查当前分集节奏。',
    })),
  });

  const sessionId = created.json().session.id;
  assert.ok(sessionId);

  const stream = await invoke(handler, { url: `/api/agents/sessions/${sessionId}/stream` });
  assert.equal(stream.res.statusCode, 200);
  assert.equal(stream.res.getHeader('content-type'), 'text/event-stream; charset=utf-8');
  assert.match(stream.body(), /"type":"message_delta"/);
  assert.match(stream.body(), /"type":"artifact_ready"/);
  assert.match(stream.body(), /"type":"done"/);

  const detail = await invoke(handler, { url: `/api/agents/sessions/${sessionId}` });
  assert.equal(detail.res.statusCode, 200);
  assert.equal(detail.json().session.status, 'completed');
  assert.equal(detail.json().session.artifacts.length, 1);
});

test('runtime supports apply and since-replay', async () => {
  const handler = createAgentRuntimeHandler();

  const created = await invoke(handler, {
    method: 'POST',
    url: '/api/agents/sessions',
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify({
      agentKey: 'sisyphus',
      scope: { kind: 'episode', projectId: 'project_1', episodeId: 'episode_1' },
      initialPrompt: '再次分析当前分集。',
    })),
  });

  const sessionId = created.json().session.id;
  await invoke(handler, { url: `/api/agents/sessions/${sessionId}/stream` });

  const detail = await invoke(handler, { url: `/api/agents/sessions/${sessionId}` });
  const events = detail.json().session.timelineEvents;
  const since = events[1]?.seq || 0;

  const replay = await invoke(handler, { url: `/api/agents/sessions/${sessionId}/stream?since=${since}` });
  assert.equal(replay.res.statusCode, 200);
  assert.equal(replay.body().includes(`"seq":${since}`), false);

  const artifact = detail.json().session.artifacts[0];
  const candidate = artifact.applyCandidates[0];
  const apply = await invoke(handler, {
    method: 'POST',
    url: `/api/agents/sessions/${sessionId}/apply`,
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify({ artifactId: artifact.id, candidateId: candidate.id, operation: 'apply_candidate' })),
  });
  assert.equal(apply.res.statusCode, 200);
  assert.equal(apply.json().accepted, true);
  assert.equal(apply.json().candidate.id, candidate.id);
});

test('runtime returns controlled 400 for malformed json bodies', async () => {
  const handler = createAgentRuntimeHandler();

  const response = await invoke(handler, {
    method: 'POST',
    url: '/api/agents/sessions',
    headers: { 'content-type': 'application/json' },
    body: Buffer.from('{invalid-json'),
  });

  assert.equal(response.res.statusCode, 400);
  assert.deepEqual(response.json(), {
    error: 'Invalid JSON request body.',
    code: 'INVALID_JSON_REQUEST',
  });
});

test('runtime cancel sends cancelled then done to live and replay streams', async () => {
  const handler = createAgentRuntimeHandler();

  const created = await invoke(handler, {
    method: 'POST',
    url: '/api/agents/sessions',
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify({
      agentKey: 'sisyphus',
      scope: { kind: 'episode', projectId: 'project_1', episodeId: 'episode_1' },
      initialPrompt: '请立即开始执行并等待取消。',
    })),
  });

  const sessionId = created.json().session.id;
  const streamReq = createMockRequest({ url: `/api/agents/sessions/${sessionId}/stream` });
  const streamRes = createMockResponse();
  const streamPromise = handler(streamReq, streamRes);

  await invoke(handler, {
    method: 'POST',
    url: `/api/agents/sessions/${sessionId}/cancel`,
  });

  await streamPromise;
  if (!streamRes.finished) {
    await new Promise((resolve) => {
      let settled = false;
      const done = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      streamRes.once('finish', done);
      streamRes.once('close', done);
    });
  }

  const liveBody = streamRes.toBuffer().toString('utf8');
  assert.match(liveBody, /"status":"cancelled"/);
  assert.match(liveBody, /"type":"done"/);

  const replay = await invoke(handler, { url: `/api/agents/sessions/${sessionId}/stream?since=0` });
  assert.match(replay.body(), /"status":"cancelled"/);
  assert.match(replay.body(), /"type":"done"/);

  const detail = await invoke(handler, { url: `/api/agents/sessions/${sessionId}` });
  assert.equal(detail.json().session.status, 'cancelled');
  assert.equal(detail.json().session.messages.some((message) => message.status === 'streaming'), false);
});

test('runtime rejects cancel after completion and preserves terminal history', async () => {
  const handler = createAgentRuntimeHandler();

  const created = await invoke(handler, {
    method: 'POST',
    url: '/api/agents/sessions',
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify({
      agentKey: 'sisyphus',
      scope: { kind: 'episode', projectId: 'project_1', episodeId: 'episode_1' },
      initialPrompt: '完成后再取消',
    })),
  });

  const sessionId = created.json().session.id;
  await invoke(handler, { url: `/api/agents/sessions/${sessionId}/stream` });

  const before = await invoke(handler, { url: `/api/agents/sessions/${sessionId}` });
  const beforeEvents = before.json().session.timelineEvents.length;

  const cancel = await invoke(handler, {
    method: 'POST',
    url: `/api/agents/sessions/${sessionId}/cancel`,
  });

  assert.equal(cancel.res.statusCode, 409);
  assert.equal(cancel.json().code, 'SESSION_STATE_CONFLICT');

  const after = await invoke(handler, { url: `/api/agents/sessions/${sessionId}` });
  assert.equal(after.json().session.status, 'completed');
  assert.equal(after.json().session.timelineEvents.length, beforeEvents);
});

test('runtime returns false for unknown routes', async () => {
  const handler = createAgentRuntimeHandler();
  const req = createMockRequest({ url: '/api/agents/unknown' });
  const res = createMockResponse();
  const handled = await handler(req, res);
  assert.equal(handled, false);
});
