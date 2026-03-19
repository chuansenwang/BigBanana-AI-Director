import { VideoAnalysisSource } from '../types';
import { fetchMediaWithCorsFallback } from './mediaFetchService';
import { persistVideoBlobWithStatus, persistVideoReferenceWithStatus } from './videoStorageService';

interface AnalysisSourcePersistOptions {
  projectId?: string;
  episodeId?: string;
}

export interface AnalysisSourceInputResult {
  source: VideoAnalysisSource;
  warnings: string[];
}

const DIRECT_VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm', '.m4v', '.ogv'];
const MAX_UPLOAD_BYTES = 1024 * 1024 * 1024;

const WATCH_PAGE_PATTERNS = [
  /youtube\.com\/watch/i,
  /youtu\.be\//i,
  /youtube\.com\/shorts\//i,
  /tiktok\.com\/@/i,
  /tiktok\.com\/t\//i,
];

const generateSourceId = (): string => `analysis_source_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const hasDirectVideoExtension = (value: string): boolean => {
  const normalized = value.toLowerCase();
  return DIRECT_VIDEO_EXTENSIONS.some(ext => normalized.includes(ext));
};

const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const toUserMessage = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) return error.message;
  return fallback;
};

const getFileExtension = (name: string): string => {
  const dotIndex = name.lastIndexOf('.');
  return dotIndex >= 0 ? name.slice(dotIndex).toLowerCase() : '';
};

const isLikelyUnsupportedVideoExtension = (name: string): boolean => {
  const extension = getFileExtension(name);
  return !!extension && !DIRECT_VIDEO_EXTENSIONS.includes(extension);
};

const parseRemoteError = async (response: Response): Promise<string> => {
  let payloadMessage = '';
  try {
    const payload = await response.clone().json() as { error?: string };
    payloadMessage = payload.error || '';
  } catch {
    try {
      payloadMessage = await response.clone().text();
    } catch {
      payloadMessage = '';
    }
  }

  if (response.status === 403 && /not allowed/i.test(payloadMessage)) {
    return '当前媒体代理不允许访问该源站，请改用本地上传，或把目标域名加入媒体代理白名单。';
  }

  if (response.status === 502 && /timed out/i.test(payloadMessage)) {
    return '媒体代理请求超时，请稍后重试或改用本地上传。';
  }

  if (response.status === 400 && /invalid target url/i.test(payloadMessage.toLowerCase())) {
    return '视频直链地址无效，请检查 URL 是否完整。';
  }

  return `无法访问视频资源（HTTP ${response.status}）。${payloadMessage ? ` ${payloadMessage}` : ''}`.trim();
};

export const validateDirectVideoUrl = (value: string): { ok: true; url: string } | { ok: false; message: string } => {
  const url = value.trim();
  if (!url) return { ok: false, message: '请输入可访问的视频直链。' };
  if (!isHttpUrl(url)) return { ok: false, message: '仅支持 http/https 视频直链。' };
  if (WATCH_PAGE_PATTERNS.some(pattern => pattern.test(url))) {
    return { ok: false, message: '暂不支持 YouTube/TikTok 页面链接，请提供可直接访问的视频文件地址。' };
  }
  if (!hasDirectVideoExtension(url)) {
    return { ok: false, message: '该链接看起来不像直接视频文件地址，请提供 mp4/mov/webm 等直链。' };
  }
  return { ok: true, url };
};

const ensureRemoteVideo = async (url: string): Promise<{ mimeType: string; durationMs?: number }> => {
  const response = await fetchMediaWithCorsFallback(url, { method: 'GET' });
  if (!response.ok) {
    throw new Error(await parseRemoteError(response));
  }

  const mimeType = response.headers.get('content-type') || '';
  if (mimeType && !mimeType.toLowerCase().startsWith('video/')) {
    throw new Error(`链接返回的资源不是视频（${mimeType}）。`);
  }

  return { mimeType: mimeType || 'video/mp4' };
};

export const ingestAnalysisVideoUrl = async (
  value: string,
  options?: AnalysisSourcePersistOptions
): Promise<AnalysisSourceInputResult> => {
  const validation = validateDirectVideoUrl(value);
  if (validation.ok === false) {
    return {
      source: {
        id: generateSourceId(),
        kind: 'url',
        originalUrl: value.trim(),
        status: 'failed',
        error: validation.message,
      },
      warnings: [],
    };
  }

  try {
    const remote = await ensureRemoteVideo(validation.url);
    const persistResult = await persistVideoReferenceWithStatus(validation.url, options);
    return {
      source: {
        id: generateSourceId(),
        kind: 'url',
        originalUrl: validation.url,
        persistedVideoRef: persistResult.value,
        mimeType: remote.mimeType,
        title: validation.url.split('/').pop()?.split('?')[0] || 'remote-video',
        status: 'ready',
      },
      warnings: persistResult.message ? [persistResult.message] : persistResult.value === validation.url ? ['视频直链未落盘，后续可能依赖远程资源可用性。'] : [],
    };
  } catch (error) {
    return {
      source: {
        id: generateSourceId(),
        kind: 'url',
        originalUrl: validation.url,
        status: 'failed',
        error: toUserMessage(error, '视频直链校验失败。'),
      },
      warnings: [],
    };
  }
};

export const validateUploadFile = (file: File): { ok: true } | { ok: false; message: string } => {
  if (!file) return { ok: false, message: '请选择一个视频文件。' };
  if (file.size <= 0) return { ok: false, message: '上传文件为空，无法继续分析。' };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, message: '上传文件过大，请控制在 1GB 以内。' };
  if (isLikelyUnsupportedVideoExtension(file.name) && !file.type.toLowerCase().startsWith('video/')) {
    return { ok: false, message: `暂不支持该视频格式（${getFileExtension(file.name)}），请改用 mp4/mov/webm/ogv。` };
  }
  if (file.type && !file.type.toLowerCase().startsWith('video/')) {
    return { ok: false, message: `暂不支持该文件类型（${file.type}）。` };
  }
  if (!file.type && !hasDirectVideoExtension(file.name)) {
    return { ok: false, message: '文件缺少可识别的视频类型信息，请上传 mp4/mov/webm 等视频文件。' };
  }
  return { ok: true };
};

export const ingestAnalysisUpload = async (
  file: File,
  options?: AnalysisSourcePersistOptions
): Promise<AnalysisSourceInputResult> => {
  const validation = validateUploadFile(file);
  if (validation.ok === false) {
    return {
      source: {
        id: generateSourceId(),
        kind: 'upload',
        fileName: file?.name,
        mimeType: file?.type,
        status: 'failed',
        error: validation.message,
      },
      warnings: [],
    };
  }

  try {
    const persistResult = await persistVideoBlobWithStatus(file, options);
    return {
      source: {
        id: generateSourceId(),
        kind: 'upload',
        title: file.name,
        fileName: file.name,
        mimeType: file.type || 'video/mp4',
        durationMs: undefined,
        persistedVideoRef: persistResult.value,
        status: 'ready',
      },
      warnings: persistResult.message ? [persistResult.message] : persistResult.value.startsWith('data:') ? ['浏览器不支持 OPFS，已降级为 data URL 持久化。'] : [],
    };
  } catch (error) {
    return {
      source: {
        id: generateSourceId(),
        kind: 'upload',
        fileName: file.name,
        mimeType: file.type,
        status: 'failed',
        error: toUserMessage(error, '上传视频持久化失败。'),
      },
      warnings: [],
    };
  }
};
