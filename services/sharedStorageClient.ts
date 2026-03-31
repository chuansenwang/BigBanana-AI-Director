import { ModelRegistryState } from '../types/model';

export type SharedStorageMode = 'browser' | 'shared';
export type SharedStorageStoreKey = 'seriesProjects' | 'series' | 'episodes' | 'assetLibrary' | 'benchmarkVideos';

export interface SharedStorageBootstrap {
  schemaVersion: number;
  migratedAt: number | null;
  modelRegistry: ModelRegistryState | null;
  stores: Record<SharedStorageStoreKey, any[]>;
}

const DEFAULT_SHARED_STORAGE_ENDPOINT = '/api/shared-storage';

const SHARED_STORE_ROUTES: Record<SharedStorageStoreKey, string> = {
  seriesProjects: 'series-projects',
  series: 'series',
  episodes: 'episodes',
  assetLibrary: 'asset-library',
  benchmarkVideos: 'benchmark-videos',
};

const normalizeEndpoint = (value: string): string => value.replace(/\/+$/, '');

export const getSharedStorageMode = (): SharedStorageMode => {
  const configuredMode = String(import.meta.env.VITE_SHARED_STORAGE_MODE ?? 'browser').trim().toLowerCase();
  return configuredMode === 'shared' ? 'shared' : 'browser';
};

export const isSharedStorageMode = (): boolean => getSharedStorageMode() === 'shared';

export const getSharedStorageEndpoint = (): string => {
  const configuredEndpoint = String(import.meta.env.VITE_SHARED_STORAGE_ENDPOINT ?? '').trim();
  return normalizeEndpoint(configuredEndpoint || DEFAULT_SHARED_STORAGE_ENDPOINT);
};

export const resolveSharedStorageUrl = (pathOrUrl: string): string => {
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;

  const endpoint = getSharedStorageEndpoint();
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost';
  const endpointUrl = new URL(endpoint, origin);

  if (!pathOrUrl) {
    return endpointUrl.toString();
  }

  if (pathOrUrl.startsWith('/')) {
    const endpointPath = endpointUrl.pathname.replace(/\/+$/, '');
    const normalizedPath = pathOrUrl.startsWith(endpointPath)
      ? pathOrUrl
      : `${endpointPath}${pathOrUrl}`;
    return new URL(normalizedPath, endpointUrl.origin).toString();
  }

  return new URL(pathOrUrl, `${endpointUrl.toString().replace(/\/+$/, '')}/`).toString();
};

const createJsonHeaders = (): HeadersInit => ({
  'Content-Type': 'application/json',
});

const parseJsonResponse = async <T>(response: Response): Promise<T> => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload?.error || `Shared storage request failed: HTTP ${response.status}`);
  }
  return (payload?.data ?? payload) as T;
};

const requestSharedStorageJson = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(resolveSharedStorageUrl(path), {
    credentials: 'same-origin',
    ...init,
  });
  return parseJsonResponse<T>(response);
};

const requestSharedStorageJsonSync = <T>(path: string, method: 'GET' | 'PUT', body?: unknown): T => {
  const xhr = new XMLHttpRequest();
  xhr.open(method, resolveSharedStorageUrl(path), false);
  xhr.withCredentials = true;
  xhr.setRequestHeader('Content-Type', 'application/json');
  xhr.send(body === undefined ? null : JSON.stringify(body));

  if (xhr.status < 200 || xhr.status >= 300) {
    let message = `Shared storage request failed: HTTP ${xhr.status}`;
    try {
      const payload = JSON.parse(xhr.responseText || '{}');
      if (typeof payload?.error === 'string' && payload.error.trim()) {
        message = payload.error;
      }
    } catch {
      if (xhr.responseText?.trim()) {
        message = xhr.responseText.trim();
      }
    }
    throw new Error(message);
  }

  const payload = JSON.parse(xhr.responseText || '{}');
  return (payload?.data ?? payload) as T;
};

export const isSharedStorageBootstrapEmpty = (bootstrap: SharedStorageBootstrap | null | undefined): boolean => {
  if (!bootstrap) return true;
  const hasModelRegistry = !!bootstrap.modelRegistry;
  const hasStoreData = (Object.values(bootstrap.stores || {}) as any[][]).some((items) => Array.isArray(items) && items.length > 0);
  return !hasModelRegistry && !hasStoreData;
};

export const checkSharedStorageHealth = async (): Promise<{ ok: true; service: string; storageDir: string }> => {
  return requestSharedStorageJson('/healthz');
};

export const fetchSharedStorageBootstrap = async (): Promise<SharedStorageBootstrap> => {
  return requestSharedStorageJson('/bootstrap');
};

export const migrateSharedStorageBootstrap = async (payload: SharedStorageBootstrap): Promise<SharedStorageBootstrap> => {
  return requestSharedStorageJson('/bootstrap/migrate', {
    method: 'POST',
    headers: createJsonHeaders(),
    body: JSON.stringify(payload),
  });
};

export const fetchSharedModelRegistry = async (): Promise<ModelRegistryState | null> => {
  return requestSharedStorageJson('/model-registry');
};

export const putSharedModelRegistry = async (state: ModelRegistryState): Promise<ModelRegistryState> => {
  return requestSharedStorageJson('/model-registry', {
    method: 'PUT',
    headers: createJsonHeaders(),
    body: JSON.stringify(state),
  });
};

export const putSharedModelRegistrySync = (state: ModelRegistryState): ModelRegistryState => {
  return requestSharedStorageJsonSync('/model-registry', 'PUT', state);
};

const getStoreRoute = (storeKey: SharedStorageStoreKey): string => SHARED_STORE_ROUTES[storeKey];

export const listSharedStore = async <T>(storeKey: SharedStorageStoreKey): Promise<T[]> => {
  return requestSharedStorageJson(`/stores/${getStoreRoute(storeKey)}`);
};

export const getSharedStoreItem = async <T>(storeKey: SharedStorageStoreKey, id: string): Promise<T> => {
  return requestSharedStorageJson(`/stores/${getStoreRoute(storeKey)}/${encodeURIComponent(id)}`);
};

export const putSharedStoreItem = async <T>(storeKey: SharedStorageStoreKey, id: string, value: T): Promise<T> => {
  return requestSharedStorageJson(`/stores/${getStoreRoute(storeKey)}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: createJsonHeaders(),
    body: JSON.stringify(value),
  });
};

export const deleteSharedStoreItem = async (storeKey: SharedStorageStoreKey, id: string): Promise<void> => {
  await requestSharedStorageJson(`/stores/${getStoreRoute(storeKey)}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
};

export const uploadSharedVideo = async (blob: Blob, fileName: string): Promise<string> => {
  const form = new FormData();
  form.append('file', blob, fileName);

  const result = await requestSharedStorageJson<{ url: string }>('/media/videos', {
    method: 'POST',
    body: form,
  });

  return resolveSharedStorageUrl(result.url);
};
