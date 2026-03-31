import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

export const STORE_ROUTE_TO_KEY = {
  'series-projects': 'seriesProjects',
  series: 'series',
  episodes: 'episodes',
  'asset-library': 'assetLibrary',
  'benchmark-videos': 'benchmarkVideos',
};

export const STORE_KEYS = Object.values(STORE_ROUTE_TO_KEY);

const STORE_KEY_TO_ROUTE = Object.fromEntries(
  Object.entries(STORE_ROUTE_TO_KEY).map(([routeName, storeKey]) => [storeKey, routeName])
);

const DEFAULT_SCHEMA_VERSION = 1;

const clone = (value) => JSON.parse(JSON.stringify(value));

const defaultBootstrapData = () => ({
  schemaVersion: DEFAULT_SCHEMA_VERSION,
  migratedAt: null,
  modelRegistry: null,
  stores: {
    seriesProjects: [],
    series: [],
    episodes: [],
    assetLibrary: [],
    benchmarkVideos: [],
  },
});

const ensureArray = (value) => (Array.isArray(value) ? value : []);

const ensureObjectOrNull = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
};

const sanitizeFileName = (value) => {
  const baseName = path.basename(String(value || '').trim() || 'video.bin');
  return baseName.replace(/[^a-zA-Z0-9._-]+/g, '_') || `video_${crypto.randomUUID()}.bin`;
};

const inferVideoContentType = (fileName) => {
  const normalized = String(fileName || '').trim().toLowerCase();
  if (normalized.endsWith('.webm')) return 'video/webm';
  if (normalized.endsWith('.mov')) return 'video/quicktime';
  if (normalized.endsWith('.ogv') || normalized.endsWith('.ogg')) return 'video/ogg';
  return 'video/mp4';
};

const getDefaultPaths = (storageDir) => ({
  storageDir,
  storesDir: path.join(storageDir, 'stores'),
  modelRegistryFile: path.join(storageDir, 'model-registry.json'),
  metaFile: path.join(storageDir, 'meta.json'),
  mediaDir: path.join(storageDir, 'media'),
  videosDir: path.join(storageDir, 'media', 'videos'),
});

const atomicWriteJson = async (filePath, value) => {
  const directory = path.dirname(filePath);
  await fs.mkdir(directory, { recursive: true });
  const tempPath = path.join(directory, `${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  await fs.writeFile(tempPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await fs.rename(tempPath, filePath);
};

const readJsonFile = async (filePath, fallbackValue) => {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    if (!raw.trim()) return clone(fallbackValue);
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === 'ENOENT') return clone(fallbackValue);
    throw error;
  }
};

const readDirectoryNames = async (directoryPath) => {
  try {
    return await fs.readdir(directoryPath);
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
};

export const normalizeBootstrapPayload = (payload) => {
  const source = payload && typeof payload === 'object' ? payload : {};
  const stores = source.stores && typeof source.stores === 'object' ? source.stores : {};
  return {
    schemaVersion: Number.isFinite(source.schemaVersion) ? Number(source.schemaVersion) : DEFAULT_SCHEMA_VERSION,
    migratedAt: typeof source.migratedAt === 'number' ? source.migratedAt : null,
    modelRegistry: ensureObjectOrNull(source.modelRegistry),
    stores: {
      seriesProjects: ensureArray(stores.seriesProjects),
      series: ensureArray(stores.series),
      episodes: ensureArray(stores.episodes),
      assetLibrary: ensureArray(stores.assetLibrary),
      benchmarkVideos: ensureArray(stores.benchmarkVideos),
    },
  };
};

export const createSharedStorageRepository = ({ storageDir } = {}) => {
  const resolvedStorageDir = path.resolve(storageDir || process.env.SHARED_STORAGE_DIR || path.join(process.cwd(), '.shared-storage'));
  const paths = getDefaultPaths(resolvedStorageDir);

  const getStoreFilePath = (storeKey) => path.join(paths.storesDir, `${STORE_KEY_TO_ROUTE[storeKey]}.json`);

  const ensureReady = async () => {
    await fs.mkdir(paths.storesDir, { recursive: true });
    await fs.mkdir(paths.videosDir, { recursive: true });

    const ensureIfMissing = async (filePath, fallbackValue) => {
      try {
        await fs.access(filePath);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
        await atomicWriteJson(filePath, fallbackValue);
      }
    };

    const bootstrap = defaultBootstrapData();
    await ensureIfMissing(paths.metaFile, { schemaVersion: DEFAULT_SCHEMA_VERSION, migratedAt: null });
    await ensureIfMissing(paths.modelRegistryFile, null);
    await Promise.all(STORE_KEYS.map((storeKey) => ensureIfMissing(getStoreFilePath(storeKey), bootstrap.stores[storeKey])));
  };

  const readMeta = async () => {
    await ensureReady();
    const meta = await readJsonFile(paths.metaFile, { schemaVersion: DEFAULT_SCHEMA_VERSION, migratedAt: null });
    return {
      schemaVersion: Number.isFinite(meta?.schemaVersion) ? Number(meta.schemaVersion) : DEFAULT_SCHEMA_VERSION,
      migratedAt: typeof meta?.migratedAt === 'number' ? meta.migratedAt : null,
    };
  };

  const writeMeta = async (meta) => {
    await ensureReady();
    await atomicWriteJson(paths.metaFile, {
      schemaVersion: Number.isFinite(meta?.schemaVersion) ? Number(meta.schemaVersion) : DEFAULT_SCHEMA_VERSION,
      migratedAt: typeof meta?.migratedAt === 'number' ? meta.migratedAt : null,
    });
  };

  const readStore = async (storeKey) => {
    await ensureReady();
    return ensureArray(await readJsonFile(getStoreFilePath(storeKey), []));
  };

  const writeStore = async (storeKey, items) => {
    await ensureReady();
    await atomicWriteJson(getStoreFilePath(storeKey), ensureArray(items));
  };

  return {
    storageDir: resolvedStorageDir,
    paths,
    ensureReady,
    resolveStoreKey(routeName) {
      return STORE_ROUTE_TO_KEY[routeName] || null;
    },
    listStoreRouteNames() {
      return Object.keys(STORE_ROUTE_TO_KEY);
    },
    async getBootstrap() {
      const meta = await readMeta();
      const [modelRegistry, ...stores] = await Promise.all([
        readJsonFile(paths.modelRegistryFile, null),
        ...STORE_KEYS.map((storeKey) => readStore(storeKey)),
      ]);

      const storePayload = STORE_KEYS.reduce((acc, storeKey, index) => {
        acc[storeKey] = stores[index];
        return acc;
      }, {});

      return {
        schemaVersion: meta.schemaVersion,
        migratedAt: meta.migratedAt,
        modelRegistry: ensureObjectOrNull(modelRegistry),
        stores: storePayload,
      };
    },
    async isEmpty() {
      const bootstrap = await this.getBootstrap();
      const hasRecords = STORE_KEYS.some((storeKey) => bootstrap.stores[storeKey].length > 0);
      const modelRegistry = bootstrap.modelRegistry;
      const hasModelRegistry = !!(modelRegistry && Object.keys(modelRegistry).length > 0);
      return !hasRecords && !hasModelRegistry;
    },
    async getModelRegistry() {
      await ensureReady();
      return ensureObjectOrNull(await readJsonFile(paths.modelRegistryFile, null));
    },
    async putModelRegistry(value) {
      await ensureReady();
      const normalized = ensureObjectOrNull(value) || {};
      await atomicWriteJson(paths.modelRegistryFile, normalized);
      return normalized;
    },
    async listStore(storeKey) {
      return readStore(storeKey);
    },
    async getStoreItem(storeKey, id) {
      const items = await readStore(storeKey);
      return items.find((item) => item && String(item.id) === String(id)) || null;
    },
    async putStoreItem(storeKey, id, value) {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Store item body must be an object.');
      }
      const items = await readStore(storeKey);
      const normalized = { ...value, id: String(id) };
      const index = items.findIndex((item) => item && String(item.id) === String(id));
      if (index >= 0) {
        items[index] = normalized;
      } else {
        items.push(normalized);
      }
      await writeStore(storeKey, items);
      return normalized;
    },
    async deleteStoreItem(storeKey, id) {
      const items = await readStore(storeKey);
      const index = items.findIndex((item) => item && String(item.id) === String(id));
      if (index < 0) return false;
      items.splice(index, 1);
      await writeStore(storeKey, items);
      return true;
    },
    async migrateBootstrap(payload) {
      await ensureReady();
      if (!(await this.isEmpty())) {
        const error = new Error('Shared storage already contains data.');
        error.statusCode = 409;
        throw error;
      }

      const normalized = normalizeBootstrapPayload(payload);
      const migratedAt = Date.now();
      await writeMeta({ schemaVersion: normalized.schemaVersion, migratedAt });
      await atomicWriteJson(paths.modelRegistryFile, normalized.modelRegistry);
      await Promise.all(STORE_KEYS.map((storeKey) => writeStore(storeKey, normalized.stores[storeKey])));
      return this.getBootstrap();
    },
    async saveVideo({ fileName, buffer, contentType }) {
      await ensureReady();
      if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new Error('Video upload is empty.');
      }
      const safeFileName = sanitizeFileName(fileName);
      const targetPath = path.join(paths.videosDir, safeFileName);
      await fs.writeFile(targetPath, buffer);
      return {
        fileName: safeFileName,
        filePath: targetPath,
        contentType: String(contentType || '').trim() || 'application/octet-stream',
        size: buffer.length,
      };
    },
    async getVideo(fileName) {
      await ensureReady();
      const safeFileName = sanitizeFileName(fileName);
      const filePath = path.join(paths.videosDir, safeFileName);
      const stats = await fs.stat(filePath);
      return {
        fileName: safeFileName,
        filePath,
        contentType: inferVideoContentType(safeFileName),
        size: stats.size,
      };
    },
  };
};
