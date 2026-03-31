import {
  checkSharedStorageHealth,
  fetchSharedStorageBootstrap,
  isSharedStorageBootstrapEmpty,
  isSharedStorageMode,
  migrateSharedStorageBootstrap,
  SharedStorageBootstrap,
} from './sharedStorageClient';
import { initializeRegistryFromBootstrap, loadBrowserRegistrySnapshot } from './modelRegistry';
import { exportBrowserStorageSnapshotForSharedMigration } from './storageService';

type SharedStorageRuntimeStatus = 'idle' | 'initializing' | 'ready' | 'error';

interface SharedStorageRuntimeState {
  status: SharedStorageRuntimeStatus;
  bootstrap: SharedStorageBootstrap | null;
  error: Error | null;
}

const runtimeState: SharedStorageRuntimeState = {
  status: 'idle',
  bootstrap: null,
  error: null,
};

let initializationPromise: Promise<SharedStorageBootstrap | null> | null = null;

const buildMigrationPayload = async (): Promise<SharedStorageBootstrap> => {
  const browserData = await exportBrowserStorageSnapshotForSharedMigration();
  return {
    schemaVersion: 1,
    migratedAt: null,
    modelRegistry: loadBrowserRegistrySnapshot(),
    stores: browserData,
  };
};

export const initializeSharedStorageRuntime = async (): Promise<SharedStorageBootstrap | null> => {
  if (!isSharedStorageMode()) {
    runtimeState.status = 'ready';
    runtimeState.bootstrap = null;
    runtimeState.error = null;
    return null;
  }

  if (runtimeState.status === 'ready' && runtimeState.bootstrap) {
    return runtimeState.bootstrap;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  runtimeState.status = 'initializing';
  runtimeState.error = null;

  initializationPromise = (async () => {
    try {
      await checkSharedStorageHealth();

      let bootstrap = await fetchSharedStorageBootstrap();
      if (isSharedStorageBootstrapEmpty(bootstrap)) {
        const migrationPayload = await buildMigrationPayload();
        bootstrap = await migrateSharedStorageBootstrap(migrationPayload);
      }

      initializeRegistryFromBootstrap(bootstrap.modelRegistry);
      runtimeState.status = 'ready';
      runtimeState.bootstrap = bootstrap;
      runtimeState.error = null;
      return bootstrap;
    } catch (error) {
      const normalizedError = error instanceof Error ? error : new Error('Shared storage initialization failed.');
      runtimeState.status = 'error';
      runtimeState.error = normalizedError;
      runtimeState.bootstrap = null;
      throw normalizedError;
    } finally {
      initializationPromise = null;
    }
  })();

  return initializationPromise;
};

export const getSharedStorageRuntimeState = (): SharedStorageRuntimeState => ({
  ...runtimeState,
});
