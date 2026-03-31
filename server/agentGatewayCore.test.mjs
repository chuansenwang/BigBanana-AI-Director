import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { createAgentGatewayHandler, createMockRequest } from './agentGatewayCore.mjs';

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
  res.flushHeaders = () => {
    res.headersSent = true;
  };
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

test('handler exposes bootstrap and session list routes', async () => {
  const handler = createAgentGatewayHandler();

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

test('handler creates a session and streams deterministic mock events', async () => {
  const handler = createAgentGatewayHandler();

  const created = await invoke(handler, {
    method: 'POST',
    url: '/api/agents/sessions',
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify({
      agentKey: 'sisyphus',
      title: 'Mock Run',
      scope: { kind: 'episode', projectId: 'project_1', episodeId: 'episode_1' },
      initialPrompt: '请检查当前分集节奏。',
    })),
  });

  assert.equal(created.res.statusCode, 200);
  const sessionId = created.json().session.id;
  assert.ok(sessionId);

  const stream = await invoke(handler, {
    url: `/api/agents/sessions/${sessionId}/stream`,
  });

  assert.equal(stream.res.statusCode, 200);
  assert.equal(stream.res.getHeader('content-type'), 'text/event-stream; charset=utf-8');
  assert.match(stream.body(), /"type":"run_status"/);
  assert.match(stream.body(), /"type":"tool_start"/);
  assert.match(stream.body(), /"type":"message_delta"/);
  assert.match(stream.body(), /"type":"artifact_ready"/);
  assert.match(stream.body(), /"type":"done"/);

  const detail = await invoke(handler, { url: `/api/agents/sessions/${sessionId}` });
  assert.equal(detail.res.statusCode, 200);
  assert.equal(detail.json().session.status, 'completed');
  assert.equal(detail.json().session.artifacts.length, 1);
  assert.equal(detail.json().session.timelineEvents.length > 0, true);
});

test('handler returns false for unknown routes', async () => {
  const handler = createAgentGatewayHandler();
  const req = createMockRequest({ url: '/api/agents/unknown' });
  const res = createMockResponse();
  const handled = await handler(req, res);
  assert.equal(handled, false);
});

test('handler falls back to mock mode when auto runtime config has no URL', async () => {
  const handler = createAgentGatewayHandler({ runtimeConfig: { mode: 'auto' } });

  const created = await invoke(handler, {
    method: 'POST',
    url: '/api/agents/sessions',
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify({
      agentKey: 'sisyphus',
      scope: { kind: 'episode', projectId: 'project_1', episodeId: 'episode_1' },
      initialPrompt: 'auto fallback',
    })),
  });

  assert.equal(created.res.statusCode, 200);
  assert.ok(created.json().session.id);
});

test('handler forwards json routes to external runtime when configured', async () => {
  const calls = [];
  const handler = createAgentGatewayHandler({
    runtimeConfig: { mode: 'forward', runtimeBaseUrl: 'https://runtime.example.com' },
    fetchImpl: async (url, init) => {
      calls.push({ url, method: init?.method || 'GET' });
      return new Response(JSON.stringify({ agents: [{ key: 'runtime', label: 'Runtime' }], sessions: [], runtime: { executorMode: 'opencode-cli' } }), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    },
  });

  const bootstrap = await invoke(handler, { url: '/api/agents/bootstrap?projectId=project_1' });
  assert.equal(bootstrap.res.statusCode, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://runtime.example.com/api/agents/bootstrap?projectId=project_1');
  assert.deepEqual(bootstrap.json(), { agents: [{ key: 'runtime', label: 'Runtime' }], sessions: [], runtime: { executorMode: 'opencode-cli' } });
});

test('handler forwards SSE streams to external runtime when configured', async () => {
  const streamPayload = 'event: message\ndata: {"type":"done"}\n\n';
  const handler = createAgentGatewayHandler({
    runtimeConfig: { mode: 'forward', runtimeBaseUrl: 'https://runtime.example.com' },
    fetchImpl: async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(streamPayload));
        controller.close();
      },
    }), {
      status: 200,
      headers: {
        'content-type': 'text/event-stream; charset=utf-8',
        'cache-control': 'no-cache',
      },
    }),
  });

  const stream = await invoke(handler, { url: '/api/agents/sessions/runtime_1/stream?since=2' });
  assert.equal(stream.res.statusCode, 200);
  assert.equal(stream.res.getHeader('content-type'), 'text/event-stream; charset=utf-8');
  assert.match(stream.body(), /"type":"done"/);
});

test('handler rejects invalid runtime mode values explicitly', async () => {
  assert.throws(
    () => createAgentGatewayHandler({ runtimeConfig: { mode: 'forwad', runtimeBaseUrl: 'https://runtime.example.com' } }),
    /Invalid agent runtime mode/
  );
});

test('handler does not write json after forwarding errors once response has started', async () => {
  const handler = createAgentGatewayHandler({
    runtimeConfig: { mode: 'forward', runtimeBaseUrl: 'https://runtime.example.com' },
    fetchImpl: async () => {
      throw Object.assign(new Error('stream exploded'), { responseStarted: true });
    },
  });

  const req = createMockRequest({ url: '/api/agents/sessions/runtime_1/stream' });
  const res = createMockResponse();
  res.headersSent = true;

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

  assert.equal(handled, true);
  assert.equal(res.toBuffer().toString('utf8'), '');
});

test('handler fallback cancel sends cancelled then done to live and replay streams', async () => {
  const handler = createAgentGatewayHandler();

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
});

test('handler fallback rejects cancel after completion and keeps terminal history stable', async () => {
  const handler = createAgentGatewayHandler();

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
