import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { Writable } from 'node:stream';
import { createSharedStorageRepository } from './sharedStorageRepository.mjs';
import { createMockRequest, createSharedStorageHandler } from './sharedStorageCore.mjs';

const createTempDir = async () => fs.mkdtemp(path.join(os.tmpdir(), 'bb-shared-storage-core-'));

const createMockResponse = () => {
  const chunks = [];
  const res = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      callback();
    },
  });
  res.headers = {};
  res.statusCode = 200;
  res.setHeader = (key, value) => {
    res.headers[String(key).toLowerCase()] = value;
  };
  res.getHeader = (key) => res.headers[String(key).toLowerCase()];
  res.end = (chunk) => {
    if (chunk) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    res.finished = true;
    res.emit('finish');
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
    await new Promise((resolve) => res.once('finish', resolve));
  }
  return { handled, req, res, json: () => res.toJson(), body: () => res.toBuffer() };
};

test('handler exposes health/bootstrap/store/model routes', async (t) => {
  const tempDir = await createTempDir();
  t.after(async () => fs.rm(tempDir, { recursive: true, force: true }));

  const repository = createSharedStorageRepository({ storageDir: tempDir });
  const handler = createSharedStorageHandler({ repository, allowedOrigins: ['*'] });

  const health = await invoke(handler, { url: '/api/shared-storage/healthz' });
  assert.equal(health.handled, true);
  assert.equal(health.res.statusCode, 200);
  assert.equal(health.json().ok, true);

  const putModel = await invoke(handler, {
    method: 'PUT',
    url: '/api/shared-storage/model-registry',
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify({ providers: [{ id: 'provider_1' }] })),
  });
  assert.equal(putModel.res.statusCode, 200);

  const putEpisode = await invoke(handler, {
    method: 'PUT',
    url: '/api/shared-storage/stores/episodes/ep_1',
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify({ title: 'Episode One' })),
  });
  assert.equal(putEpisode.res.statusCode, 200);
  assert.equal(putEpisode.json().data.id, 'ep_1');

  const getStore = await invoke(handler, { url: '/api/shared-storage/stores/episodes' });
  assert.deepEqual(getStore.json().data.map((item) => item.id), ['ep_1']);

  const bootstrap = await invoke(handler, { url: '/api/shared-storage/bootstrap' });
  assert.equal(bootstrap.res.statusCode, 200);
  assert.equal(bootstrap.json().data.modelRegistry.providers[0].id, 'provider_1');
  assert.equal(bootstrap.json().data.stores.episodes[0].id, 'ep_1');

  const deleted = await invoke(handler, { method: 'DELETE', url: '/api/shared-storage/stores/episodes/ep_1' });
  assert.equal(deleted.res.statusCode, 200);
});

test('handler migrates bootstrap payload once', async (t) => {
  const tempDir = await createTempDir();
  t.after(async () => fs.rm(tempDir, { recursive: true, force: true }));

  const repository = createSharedStorageRepository({ storageDir: tempDir });
  const handler = createSharedStorageHandler({ repository, allowedOrigins: ['*'] });
  const migrateBody = Buffer.from(JSON.stringify({
    schemaVersion: 3,
    stores: {
      seriesProjects: [{ id: 'sp_1' }],
      benchmarkVideos: [{ id: 'bench_1' }],
    },
  }));

  const first = await invoke(handler, {
    method: 'POST',
    url: '/api/shared-storage/bootstrap/migrate',
    headers: { 'content-type': 'application/json' },
    body: migrateBody,
  });
  assert.equal(first.res.statusCode, 200);
  assert.equal(first.json().data.stores.benchmarkVideos[0].id, 'bench_1');

  const second = await invoke(handler, {
    method: 'POST',
    url: '/api/shared-storage/bootstrap/migrate',
    headers: { 'content-type': 'application/json' },
    body: migrateBody,
  });
  assert.equal(second.res.statusCode, 409);
});

test('handler uploads and streams media with range support', async (t) => {
  const tempDir = await createTempDir();
  t.after(async () => fs.rm(tempDir, { recursive: true, force: true }));

  const repository = createSharedStorageRepository({ storageDir: tempDir });
  const handler = createSharedStorageHandler({ repository, allowedOrigins: ['*'] });

  const boundary = '----bigbanana-boundary';
  const multipartBody = Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="clip.mp4"\r\nContent-Type: video/mp4\r\n\r\nhello-video\r\n--${boundary}--\r\n`,
    'utf8'
  );

  const upload = await invoke(handler, {
    method: 'POST',
    url: '/api/shared-storage/media/videos',
    headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
    body: multipartBody,
  });
  assert.equal(upload.res.statusCode, 201);
  assert.equal(upload.json().data.fileName, 'clip.mp4');

  const ranged = await invoke(handler, {
    url: '/api/shared-storage/media/videos/clip.mp4',
    headers: { range: 'bytes=0-4' },
  });
  assert.equal(ranged.res.statusCode, 206);
  assert.equal(ranged.body().toString('utf8'), 'hello');
  assert.equal(ranged.res.getHeader('content-range'), 'bytes 0-4/11');
});
