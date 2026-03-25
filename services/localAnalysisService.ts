import {
  LocalAnalysisHealthData,
  LocalAnalysisHealthResponse,
  LocalAnalysisRunData,
  LocalAnalysisRunOptions,
  LocalAnalysisRunResponse,
  LocalAnalysisUserConfig,
  VideoAnalysisSource,
} from '../types';
import { loadLocalAnalysisUserConfig, normalizeLocalAnalysisUserConfig } from './localAnalysisConfigService';
import { resolveVideoToBlob } from './videoStorageService';

const DEFAULT_LOCAL_ANALYSIS_HEALTH_ENDPOINT = '/api/local-analysis/healthz';
const DEFAULT_LOCAL_ANALYSIS_RUN_ENDPOINT = '/api/local-analysis/run';

const configuredHealthEndpoint = String(import.meta.env.VITE_LOCAL_ANALYSIS_HEALTH_ENDPOINT ?? '').trim();
const configuredRunEndpoint = String(import.meta.env.VITE_LOCAL_ANALYSIS_RUN_ENDPOINT ?? '').trim();

const localAnalysisHealthEndpoint = configuredHealthEndpoint || DEFAULT_LOCAL_ANALYSIS_HEALTH_ENDPOINT;
const localAnalysisRunEndpoint = configuredRunEndpoint || DEFAULT_LOCAL_ANALYSIS_RUN_ENDPOINT;

const toErrorMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

const inferFileName = (source: VideoAnalysisSource, blob: Blob): string => {
  const baseName = source.fileName || source.title || 'analysis-input';
  if (baseName.includes('.')) return baseName;

  const mimeType = (blob.type || source.mimeType || '').toLowerCase();
  if (mimeType.includes('quicktime')) return `${baseName}.mov`;
  if (mimeType.includes('webm')) return `${baseName}.webm`;
  if (mimeType.includes('ogg')) return `${baseName}.ogv`;
  return `${baseName}.mp4`;
};

const getSourceReference = (source: VideoAnalysisSource): string => {
  const reference = source.persistedVideoRef || source.originalUrl;
  if (!reference) {
    throw new Error('当前分析源缺少可读取的视频引用。');
  }
  return reference;
};

const parseJsonResponse = async <T>(response: Response): Promise<T> => {
  const text = await response.text();
  if (!text.trim()) {
    throw new Error('本地分析服务返回了空响应。');
  }
  return JSON.parse(text) as T;
};

const buildConfigHeader = (config?: Partial<LocalAnalysisUserConfig>): string => {
  const normalized = normalizeLocalAnalysisUserConfig(config ?? loadLocalAnalysisUserConfig());
  return encodeURIComponent(JSON.stringify({
    whisperBinaryPath: normalized.whisperBinaryPath,
    whisperModelPath: normalized.whisperModelPath,
    pythonBinaryPath: normalized.pythonBinaryPath,
  }));
};

export const fetchLocalAnalysisHealth = async (config?: Partial<LocalAnalysisUserConfig>): Promise<LocalAnalysisHealthData> => {
  const response = await fetch(localAnalysisHealthEndpoint, {
    method: 'GET',
    headers: {
      'X-Local-Analysis-Config': buildConfigHeader(config),
    },
  });
  const payload = await parseJsonResponse<LocalAnalysisHealthResponse>(response);
  if (!response.ok || !payload.ok || !payload.data) {
    throw new Error(payload.error || `本地分析健康检查失败（HTTP ${response.status}）。`);
  }
  return payload.data;
};

export const runLocalAnalysis = async (
  source: VideoAnalysisSource,
  options?: LocalAnalysisRunOptions,
  config?: Partial<LocalAnalysisUserConfig>,
): Promise<LocalAnalysisRunData> => {
  const reference = getSourceReference(source);
  const blob = await resolveVideoToBlob(reference);
  const fileName = inferFileName(source, blob);
  const requestOptions: LocalAnalysisRunOptions = {
    enableSceneDetection: options?.enableSceneDetection !== false,
    language: options?.language || 'auto',
    whisperModel: options?.whisperModel || '',
    maxDurationMs: options?.maxDurationMs,
  };

  const response = await fetch(localAnalysisRunEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': blob.type || source.mimeType || 'application/octet-stream',
      'X-Local-Analysis-Options': encodeURIComponent(JSON.stringify(requestOptions)),
      'X-Local-Analysis-File-Name': encodeURIComponent(fileName),
      'X-Local-Analysis-Config': buildConfigHeader(config),
    },
    body: blob,
  });

  let payload: LocalAnalysisRunResponse;
  try {
    payload = await parseJsonResponse<LocalAnalysisRunResponse>(response);
  } catch (error) {
    throw new Error(toErrorMessage(error, `本地分析服务请求失败（HTTP ${response.status}）。`));
  }

  if (!response.ok || !payload.ok || !payload.data) {
    throw new Error(payload.error || `本地分析执行失败（HTTP ${response.status}）。`);
  }

  return payload.data;
};
