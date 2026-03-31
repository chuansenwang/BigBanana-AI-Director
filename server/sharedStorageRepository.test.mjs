import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createSharedStorageRepository } from './sharedStorageRepository.mjs';

const createTempDir = async () => fs.mkdtemp(path.join(os.tmpdir(), 'bb-shared-storage-repo-'));

test('repository bootstraps default files and empty stores', async (t) => {
  const tempDir = await createTempDir();
  t.after(async () => fs.rm(tempDir, { recursive: true, force: true }));

  const repository = createSharedStorageRepository({ storageDir: tempDir });
  const bootstrap = await repository.getBootstrap();

  assert.equal(bootstrap.schemaVersion, 1);
  assert.equal(bootstrap.migratedAt, null);
  assert.deepEqual(bootstrap.modelRegistry, null);
  assert.deepEqual(bootstrap.stores.seriesProjects, []);
  assert.deepEqual(bootstrap.stores.benchmarkVideos, []);
  assert.equal(await repository.isEmpty(), true);
});

test('repository supports CRUD and atomic store persistence', async (t) => {
  const tempDir = await createTempDir();
  t.after(async () => fs.rm(tempDir, { recursive: true, force: true }));

  const repository = createSharedStorageRepository({ storageDir: tempDir });
  const saved = await repository.putStoreItem('episodes', 'ep_1', { title: 'Episode 1' });
  assert.equal(saved.id, 'ep_1');

  const readBack = await repository.getStoreItem('episodes', 'ep_1');
  assert.equal(readBack.title, 'Episode 1');

  const rawFile = await fs.readFile(path.join(tempDir, 'stores', 'episodes.json'), 'utf8');
  assert.match(rawFile, /"id": "ep_1"/);

  const deleted = await repository.deleteStoreItem('episodes', 'ep_1');
  assert.equal(deleted, true);
  assert.equal(await repository.getStoreItem('episodes', 'ep_1'), null);
});

test('repository migrates once and rejects migration into non-empty backend', async (t) => {
  const tempDir = await createTempDir();
  t.after(async () => fs.rm(tempDir, { recursive: true, force: true }));

  const repository = createSharedStorageRepository({ storageDir: tempDir });
  await repository.saveVideo({
    fileName: 'bootstrap-preupload.webm',
    buffer: Buffer.from('video-bytes'),
    contentType: 'video/webm',
  });

  const migrated = await repository.migrateBootstrap({
    schemaVersion: 3,
    modelRegistry: { providers: [{ id: 'p1' }] },
    stores: {
      seriesProjects: [{ id: 'sp_1' }],
      series: [{ id: 'series_1' }],
      episodes: [{ id: 'ep_1' }],
      assetLibrary: [{ id: 'asset_1' }],
      benchmarkVideos: [{ id: 'bench_1' }],
    },
  });

  assert.equal(migrated.schemaVersion, 3);
  assert.equal(migrated.stores.benchmarkVideos[0].id, 'bench_1');
  assert.equal(migrated.modelRegistry.providers[0].id, 'p1');
  assert.equal(await repository.isEmpty(), false);
  assert.equal((await repository.getVideo('bootstrap-preupload.webm')).contentType, 'video/webm');

  await assert.rejects(
    repository.migrateBootstrap({ stores: { episodes: [{ id: 'ep_2' }] } }),
    (error) => error?.statusCode === 409
  );
});
