import { ArtifactStorageUserConfig } from '../types';

const STORAGE_KEY = 'bb.artifactStorage.userConfig';

export const DEFAULT_ARTIFACT_STORAGE_USER_CONFIG: ArtifactStorageUserConfig = {
  rootFolder: 'artifacts',
  downloadsFolder: 'downloads',
  slicesFolder: 'slices',
  groupByProject: true,
  groupByEpisode: true,
};

const normalizeFolderSegment = (value: unknown, fallback: string): string => {
  const normalized = String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/+/g, '')
    .replace(/\/+$/g, '');

  return normalized || fallback;
};

export const normalizeArtifactStorageUserConfig = (
  value: Partial<ArtifactStorageUserConfig> | null | undefined,
): ArtifactStorageUserConfig => {
  return {
    rootFolder: normalizeFolderSegment(value?.rootFolder, DEFAULT_ARTIFACT_STORAGE_USER_CONFIG.rootFolder),
    downloadsFolder: normalizeFolderSegment(value?.downloadsFolder, DEFAULT_ARTIFACT_STORAGE_USER_CONFIG.downloadsFolder),
    slicesFolder: normalizeFolderSegment(value?.slicesFolder, DEFAULT_ARTIFACT_STORAGE_USER_CONFIG.slicesFolder),
    groupByProject:
      typeof value?.groupByProject === 'boolean'
        ? value.groupByProject
        : DEFAULT_ARTIFACT_STORAGE_USER_CONFIG.groupByProject,
    groupByEpisode:
      typeof value?.groupByEpisode === 'boolean'
        ? value.groupByEpisode
        : DEFAULT_ARTIFACT_STORAGE_USER_CONFIG.groupByEpisode,
  };
};

export const loadArtifactStorageUserConfig = (): ArtifactStorageUserConfig => {
  if (typeof window === 'undefined' || !window.localStorage) {
    return DEFAULT_ARTIFACT_STORAGE_USER_CONFIG;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return DEFAULT_ARTIFACT_STORAGE_USER_CONFIG;
    }

    return normalizeArtifactStorageUserConfig(JSON.parse(raw) as Partial<ArtifactStorageUserConfig>);
  } catch {
    return DEFAULT_ARTIFACT_STORAGE_USER_CONFIG;
  }
};

export const saveArtifactStorageUserConfig = (
  value: Partial<ArtifactStorageUserConfig>,
): ArtifactStorageUserConfig => {
  const normalized = normalizeArtifactStorageUserConfig(value);

  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  }

  return normalized;
};

export const clearArtifactStorageUserConfig = (): void => {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.removeItem(STORAGE_KEY);
  }
};
