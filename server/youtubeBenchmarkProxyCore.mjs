import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { spawn } from 'node:child_process';
import { Innertube } from 'youtubei.js';

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_ENV_PATH = path.resolve(MODULE_DIR, '..', '.env');

export const parseEnvFileContent = (content) => {
  const parsed = {};
  const normalizedContent = String(content || '').replace(/^\uFEFF/, '');

  normalizedContent.split(/\r?\n/).forEach((rawLine) => {
    const line = String(rawLine || '').trim();
    if (!line || line.startsWith('#')) return;

    const lineWithoutExport = line.startsWith('export ') ? line.slice(7).trim() : line;
    const separatorIndex = lineWithoutExport.indexOf('=');
    if (separatorIndex <= 0) return;

    const key = lineWithoutExport.slice(0, separatorIndex).trim();
    if (!key) return;

    let value = lineWithoutExport.slice(separatorIndex + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
    } else {
      const commentIndex = value.indexOf(' #');
      if (commentIndex >= 0) {
        value = value.slice(0, commentIndex).trim();
      }
    }

    parsed[key] = value;
  });

  return parsed;
};

export const applyEnvDefaults = (entries, targetEnv = process.env) => {
  Object.entries(entries || {}).forEach(([key, value]) => {
    if (!key || Object.prototype.hasOwnProperty.call(targetEnv, key)) return;
    targetEnv[key] = String(value ?? '');
  });
  return targetEnv;
};

export const loadRootEnvDefaults = (envPath = ROOT_ENV_PATH, targetEnv = process.env) => {
  try {
    const content = fsSync.readFileSync(envPath, 'utf8');
    applyEnvDefaults(parseEnvFileContent(content), targetEnv);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }
  return targetEnv;
};

loadRootEnvDefaults();

const DEFAULT_ARTIFACT_STORAGE_CONFIG = {
  rootFolder: 'artifacts',
  downloadsFolder: 'downloads',
  slicesFolder: 'slices',
  groupByProject: true,
  groupByEpisode: true,
};

const DEFAULT_YTDLP_BIN = String(process.env.YOUTUBE_BENCHMARK_YTDLP_BIN || 'yt-dlp').trim();
const PLATFORM = process.platform;
const ALLOW_PYTHON_FALLBACK = (() => {
  const raw = String(process.env.YOUTUBE_BENCHMARK_ALLOW_PY_FALLBACK || '').trim().toLowerCase();
  if (!raw) return PLATFORM !== 'win32';
  return ['1', 'true', 'yes', 'on'].includes(raw);
})();
const DOWNLOAD_TIMEOUT_MS = Number.parseInt(process.env.YOUTUBE_BENCHMARK_DOWNLOAD_TIMEOUT_MS || '900000', 10);

const json = (res, statusCode, payload) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
};

const sendSseEvent = (res, payload) => {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
};

const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
};

const toWarningMessage = (error) => {
  const message = String(error?.message || error || '').trim();
  if (!message) return '未能获取视频字幕。';
  return `未能获取视频字幕：${message}`;
};

const parseYouTubeUrl = (value) => {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new Error('请输入有效的 YouTube 链接。');
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, '');
  if (!['youtube.com', 'm.youtube.com', 'youtu.be'].includes(hostname)) {
    throw new Error('当前仅支持 YouTube / YouTube Shorts 链接。');
  }

  if (hostname === 'youtu.be') {
    const videoId = url.pathname.replace(/^\//, '').trim();
    if (!videoId) throw new Error('无法从 youtu.be 链接中解析视频 ID。');
    return {
      videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  if (url.pathname.startsWith('/shorts/')) {
    const videoId = url.pathname.split('/').filter(Boolean)[1] || '';
    if (!videoId) throw new Error('无法从 Shorts 链接中解析视频 ID。');
    return {
      videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  if (url.pathname === '/watch') {
    const videoId = String(url.searchParams.get('v') || '').trim();
    if (!videoId) throw new Error('无法从 watch 链接中解析视频 ID。');
    return {
      videoId,
      canonicalUrl: `https://www.youtube.com/watch?v=${videoId}`,
    };
  }

  throw new Error('当前仅支持 youtube.com/watch、youtube.com/shorts 和 youtu.be 链接。');
};

const pickThumbnailUrl = (thumbnails) => {
  if (!Array.isArray(thumbnails) || thumbnails.length === 0) return undefined;
  return [...thumbnails]
    .sort((a, b) => ((b?.width || 0) * (b?.height || 0)) - ((a?.width || 0) * (a?.height || 0)))[0]?.url;
};

const extractTranscriptSegments = (transcriptInfo) => {
  const rawSegments = transcriptInfo?.transcript?.content?.body?.initial_segments || [];
  return rawSegments
    .map((segment) => {
      const text = segment?.snippet?.toString?.() || segment?.snippet?.text || '';
      const startMs = Number.parseInt(segment?.start_ms || '0', 10);
      const endMs = Number.parseInt(segment?.end_ms || String(startMs), 10);
      const startTimeText = segment?.start_time_text?.toString?.() || '';

      if (!text.trim()) return null;
      return {
        startMs: Number.isFinite(startMs) ? startMs : 0,
        endMs: Number.isFinite(endMs) ? endMs : startMs,
        startTimeText: String(startTimeText || '').trim(),
        text: String(text).trim(),
      };
    })
    .filter(Boolean);
};

const buildMetadata = (parsedUrl, info, transcriptInfo, transcriptStatus) => ({
  videoId: parsedUrl.videoId,
  canonicalUrl: parsedUrl.canonicalUrl,
  title: String(info?.basic_info?.title || '').trim() || parsedUrl.videoId,
  description: String(info?.basic_info?.short_description || '').trim(),
  channelTitle: info?.basic_info?.channel?.name || info?.basic_info?.author || undefined,
  channelId: info?.basic_info?.channel?.id || info?.basic_info?.channel_id || undefined,
  thumbnailUrl: pickThumbnailUrl(info?.basic_info?.thumbnail),
  durationSeconds: info?.basic_info?.duration,
  viewCount: info?.basic_info?.view_count,
  likeCount: info?.basic_info?.like_count,
  transcriptStatus,
  transcriptLanguage: transcriptInfo?.selectedLanguage || undefined,
});

const parseJsonBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) {
    const error = new Error('请求体不能为空。');
    error.statusCode = 400;
    throw error;
  }

  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error('请求体不是有效的 JSON。');
    error.statusCode = 400;
    throw error;
  }
};

const normalizeFolderSegment = (value, fallback) => {
  const normalized = String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+?/g, '/');

  const trimmed = normalized.replace(/^\/+|\/+$/g, '');
  return trimmed || fallback;
};

const assertSafeRootFolderRule = (value, label) => {
  const normalized = String(value || '').trim().replace(/\\/g, '/').replace(/\/+?/g, '/');
  const isWindowsAbsolute = /^[a-zA-Z]:\//.test(normalized);
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0) {
    const error = new Error(`${label} 不能为空。`);
    error.statusCode = 400;
    throw error;
  }
  if (parts.some((part) => part === '.' || part === '..')) {
    const error = new Error(`${label} 不能包含相对跳转目录。`);
    error.statusCode = 400;
    throw error;
  }
  if (isWindowsAbsolute) {
    const [drive, ...restParts] = parts;
    if (!/^[a-zA-Z]:$/.test(drive)) {
      const error = new Error(`${label} 不是有效的 Windows 绝对路径。`);
      error.statusCode = 400;
      throw error;
    }
    if (restParts.some((part) => /[:*?"<>|]/.test(part))) {
      const error = new Error(`${label} 包含 Windows 不支持的目录字符。`);
      error.statusCode = 400;
      throw error;
    }
    return;
  }
  if (parts.some((part) => /[:*?"<>|]/.test(part))) {
    const error = new Error(`${label} 包含 Windows 不支持的目录字符。`);
    error.statusCode = 400;
    throw error;
  }
};

const assertSafeRelativeRule = (value, label) => {
  const normalized = String(value || '').trim();
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0) {
    const error = new Error(`${label} 不能为空。`);
    error.statusCode = 400;
    throw error;
  }
  if (parts.some((part) => part === '.' || part === '..')) {
    const error = new Error(`${label} 不能包含相对跳转目录。`);
    error.statusCode = 400;
    throw error;
  }
  if (parts.some((part) => /[:*?"<>|]/.test(part))) {
    const error = new Error(`${label} 包含 Windows 不支持的目录字符。`);
    error.statusCode = 400;
    throw error;
  }
};

export const normalizeArtifactStorageConfig = (value) => {
  const normalized = {
    rootFolder: normalizeFolderSegment(value?.rootFolder, DEFAULT_ARTIFACT_STORAGE_CONFIG.rootFolder),
    downloadsFolder: normalizeFolderSegment(value?.downloadsFolder, DEFAULT_ARTIFACT_STORAGE_CONFIG.downloadsFolder),
    slicesFolder: normalizeFolderSegment(value?.slicesFolder, DEFAULT_ARTIFACT_STORAGE_CONFIG.slicesFolder),
    groupByProject: typeof value?.groupByProject === 'boolean' ? value.groupByProject : DEFAULT_ARTIFACT_STORAGE_CONFIG.groupByProject,
    groupByEpisode: typeof value?.groupByEpisode === 'boolean' ? value.groupByEpisode : DEFAULT_ARTIFACT_STORAGE_CONFIG.groupByEpisode,
  };

  assertSafeRootFolderRule(normalized.rootFolder, '根目录规则');
  assertSafeRelativeRule(normalized.downloadsFolder, '下载目录规则');
  assertSafeRelativeRule(normalized.slicesFolder, '切片目录规则');
  return normalized;
};

const sanitizePathSegment = (value, fallback) => {
  const normalized = String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
};

const resolveDownloadDirectory = (artifactStorageConfig, videoId) => {
  const normalizedConfig = normalizeArtifactStorageConfig(artifactStorageConfig);
  const safeVideoId = sanitizePathSegment(videoId, 'youtube_video');
  const warnings = [];

  if (normalizedConfig.groupByProject || normalizedConfig.groupByEpisode) {
    warnings.push('当前对标下载还未绑定项目/分集上下文，暂时统一落在 youtube-benchmarks/<videoId> 目录下。');
  }

  const outputDirectory = path.resolve(
    process.cwd(),
    normalizedConfig.rootFolder,
    normalizedConfig.downloadsFolder,
    'youtube-benchmarks',
    safeVideoId,
  );

  return { normalizedConfig, outputDirectory, warnings };
};

const runCommand = (command, args, options = {}) => {
  const { cwd, timeoutMs = DOWNLOAD_TIMEOUT_MS, onStdoutLine, onStderrLine } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let stdoutBuffer = '';
    let stderrBuffer = '';
    let settled = false;

    const flushLines = (target, chunkText, callback) => {
      let next = target + chunkText;
      const parts = next.split(/\r?\n/);
      next = parts.pop() || '';
      parts.forEach((line) => {
        const trimmed = line.trim();
        if (trimmed) {
          callback?.(trimmed);
        }
      });
      return next;
    };

    const flushTrailing = (value, callback) => {
      const trimmed = String(value || '').trim();
      if (trimmed) {
        callback?.(trimmed);
      }
    };

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      reject(new Error(`视频下载超时（${timeoutMs}ms）。`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      const chunkText = chunk.toString('utf8');
      stdout += chunkText;
      stdoutBuffer = flushLines(stdoutBuffer, chunkText, onStdoutLine);
    });

    child.stderr.on('data', (chunk) => {
      const chunkText = chunk.toString('utf8');
      stderr += chunkText;
      stderrBuffer = flushLines(stderrBuffer, chunkText, onStderrLine);
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      flushTrailing(stdoutBuffer, onStdoutLine);
      flushTrailing(stderrBuffer, onStderrLine);
      if (code !== 0) {
        reject(new Error(String(stderr || stdout || `yt-dlp exited with code ${code}`).trim()));
        return;
      }
      resolve({ stdout, stderr });
    });
  });
};

const toFiniteNumber = (value) => {
  const parsed = Number.parseFloat(String(value || '').trim());
  return Number.isFinite(parsed) ? parsed : undefined;
};

const clampProgressPercent = (value) => {
  if (!Number.isFinite(value)) return undefined;
  return Math.max(0, Math.min(100, Number(value)));
};

const parseDownloadProgressLine = (line) => {
  const match = String(line || '').match(/^__BB_PROGRESS__:(.*)$/);
  if (!match) return null;

  const [downloadedRaw, totalRaw, estimatedRaw, speedRaw, etaRaw, percentRaw] = match[1].split('|');
  const downloadedBytes = toFiniteNumber(downloadedRaw);
  const totalBytes = toFiniteNumber(totalRaw) ?? toFiniteNumber(estimatedRaw);
  const speedBytesPerSecond = toFiniteNumber(speedRaw);
  const etaSeconds = toFiniteNumber(etaRaw);
  const directPercent = clampProgressPercent(toFiniteNumber(percentRaw));
  const computedPercent = downloadedBytes !== undefined && totalBytes && totalBytes > 0
    ? clampProgressPercent((downloadedBytes / totalBytes) * 100)
    : undefined;

  return {
    downloadedBytes,
    totalBytes,
    speedBytesPerSecond,
    etaSeconds,
    progressPercent: directPercent ?? computedPercent,
  };
};

const isSpawnMissingError = (error) => {
  return error?.code === 'ENOENT' || /spawn .* ENOENT/i.test(String(error?.message || ''));
};

export const getDownloaderCandidates = (preferredBin = DEFAULT_YTDLP_BIN, options = {}) => {
  const platform = String(options.platform || PLATFORM).trim() || PLATFORM;
  const allowPythonFallback =
    typeof options.allowPythonFallback === 'boolean'
      ? options.allowPythonFallback
      : ALLOW_PYTHON_FALLBACK;
  const normalizedPreferred = String(preferredBin || '').trim();
  const candidates = [];

  if (normalizedPreferred) {
    candidates.push({
      command: normalizedPreferred,
      argsPrefix: [],
      label: normalizedPreferred,
    });
  }

  if (!candidates.some((candidate) => candidate.command === 'yt-dlp')) {
    candidates.push({
      command: 'yt-dlp',
      argsPrefix: [],
      label: 'yt-dlp',
    });
  }

  if (allowPythonFallback) {
    candidates.push({
      command: 'py',
      argsPrefix: ['-m', 'yt_dlp'],
      label: 'py -m yt_dlp',
    });
  }

  return candidates;
};

const findDownloadedFile = async (outputDirectory) => {
  const entries = await fs.readdir(outputDirectory, { withFileTypes: true });
  const files = entries.filter((entry) => entry.isFile());
  if (files.length === 0) {
    throw new Error('下载已完成，但未找到生成的视频文件。');
  }

  const withStats = await Promise.all(files.map(async (entry) => ({
    name: entry.name,
    fullPath: path.join(outputDirectory, entry.name),
    stat: await fs.stat(path.join(outputDirectory, entry.name)),
  })));

  withStats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  return withStats[0]?.fullPath;
};

const downloadYouTubeVideo = async ({
  url,
  videoId,
  artifactStorageConfig,
  ytdlpBin = DEFAULT_YTDLP_BIN,
  onEvent,
}) => {
  const parsedUrl = parseYouTubeUrl(url);
  const { outputDirectory, warnings } = resolveDownloadDirectory(artifactStorageConfig, videoId || parsedUrl.videoId);
  await fs.mkdir(outputDirectory, { recursive: true });

  const baseArtifact = {
    status: 'downloading',
    outputDirectory,
    warnings,
  };

  onEvent?.({ type: 'status', artifact: baseArtifact });

  const template = path.join(outputDirectory, '%(title).120B [%(id)s].%(ext)s');
  const args = [
    '--no-playlist',
    '--restrict-filenames',
    '--windows-filenames',
    '--newline',
    '--format',
    'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
    '--merge-output-format',
    'mp4',
    '--progress-template',
    'download:__BB_PROGRESS__:%(progress.downloaded_bytes)s|%(progress.total_bytes)s|%(progress.total_bytes_estimate)s|%(progress.speed)s|%(progress.eta)s|%(progress._percent_str)s',
    '--print',
    'after_move:__BB_PATH__:%(filepath)s',
    '-o',
    template,
    parsedUrl.canonicalUrl,
  ];

  const candidates = getDownloaderCandidates(ytdlpBin);
  let stdout = '';
  let resolvedWithLabel = '';
  let lastError = null;
  let finalPathFromPrint = '';

  for (const candidate of candidates) {
    try {
      const result = await runCommand(candidate.command, [...candidate.argsPrefix, ...args], {
        cwd: outputDirectory,
        onStdoutLine: (line) => {
          if (line.startsWith('__BB_PATH__:')) {
            finalPathFromPrint = line.slice('__BB_PATH__:'.length).trim();
            return;
          }
          const progress = parseDownloadProgressLine(line);
          if (progress) {
            onEvent?.({
              type: 'progress',
              artifact: {
                ...baseArtifact,
                ...progress,
              },
            });
          }
        },
        onStderrLine: (line) => {
          const progress = parseDownloadProgressLine(line);
          if (progress) {
            onEvent?.({
              type: 'progress',
              artifact: {
                ...baseArtifact,
                ...progress,
              },
            });
          }
        },
      });
      stdout = result.stdout;
      resolvedWithLabel = candidate.label;
      break;
    } catch (error) {
      lastError = error;
      if (isSpawnMissingError(error)) {
        continue;
      }
      throw error;
    }
  }

  if (!resolvedWithLabel) {
    const attempted = candidates.map((candidate) => candidate.label).join(', ');
    const pythonFallbackEnabled = candidates.some((candidate) => candidate.label === 'py -m yt_dlp');
    throw new Error(
      `未找到可用的视频下载器。已尝试：${attempted}。请优先安装并配置独立 yt-dlp 可执行文件（例如设置 YOUTUBE_BENCHMARK_YTDLP_BIN 指向 D:\\soft\\yt-dlp.exe）${pythonFallbackEnabled ? '，或确认 Python 环境中的 yt_dlp 模块可用（py -m yt_dlp）' : ''}。最后一次错误：${String(lastError?.message || '未知错误')}`,
    );
  }

  const printedPath = finalPathFromPrint || String(stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => Boolean(line) && !line.startsWith('__BB_PROGRESS__:'))
    .map((line) => line.startsWith('__BB_PATH__:') ? line.slice('__BB_PATH__:'.length).trim() : line)
    .at(-1);

  const localPath = printedPath || await findDownloadedFile(outputDirectory);
  return {
    status: 'ready',
    localPath,
    fileName: path.basename(localPath),
    outputDirectory,
    progressPercent: 100,
    warnings: resolvedWithLabel === 'py -m yt_dlp'
      ? [...warnings, '当前通过 py -m yt_dlp 作为下载后备入口执行。若你希望直接调用 yt-dlp，请把 yt-dlp.exe 加入 PATH 或配置 YOUTUBE_BENCHMARK_YTDLP_BIN。']
      : warnings,
  };
};

export const createMockRequest = ({ method = 'GET', url = '/', headers = {}, body } = {}) => {
  const stream = Readable.from(body ? [body] : []);
  stream.method = method;
  stream.url = url;
  stream.headers = headers;
  stream.socket = { encrypted: false };
  return stream;
};

export const createYouTubeBenchmarkHandler = ({
  createInnertube = () => Innertube.create(),
  downloadVideo = downloadYouTubeVideo,
} = {}) => async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (!requestUrl.pathname.startsWith('/api/youtube-benchmark')) return false;

  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }

  if (requestUrl.pathname === '/api/youtube-benchmark/healthz' && req.method === 'GET') {
    json(res, 200, { ok: true, service: 'youtube-benchmark-proxy' });
    return true;
  }

  if (requestUrl.pathname === '/api/youtube-benchmark/download' && req.method === 'POST') {
    let streamSeq = 0;
    try {
      const body = await parseJsonBody(req);
      const sourceUrl = String(body?.url || '').trim();
      const videoId = String(body?.videoId || '').trim();
      if (!sourceUrl) {
        json(res, 400, { ok: false, error: '缺少下载 url。' });
        return true;
      }
      if (!videoId) {
        json(res, 400, { ok: false, error: '缺少视频 ID。' });
        return true;
      }

      const emit = (payload) => {
        sendSseEvent(res, {
          seq: ++streamSeq,
          at: Date.now(),
          ...payload,
        });
      };

      res.statusCode = 200;
      res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      const artifact = await downloadVideo({
        url: sourceUrl,
        videoId,
        artifactStorageConfig: body?.artifactStorageConfig,
        onEvent: emit,
      });

      emit({ type: 'done', artifact });

      if (!res.writableEnded) {
        res.end();
      }
      return true;
    } catch (error) {
      const statusCode = Number.isFinite(error?.statusCode) ? Number(error.statusCode) : 502;
      if (res.headersSent) {
        sendSseEvent(res, {
          seq: ++streamSeq,
          at: Date.now(),
          type: 'error',
          message: error?.message || '视频下载失败。',
        });
        if (!res.writableEnded) {
          res.end();
        }
      } else {
        json(res, statusCode, {
          ok: false,
          error: error?.message || '视频下载失败。',
        });
      }
      return true;
    }
  }

  if (requestUrl.pathname !== '/api/youtube-benchmark/intake' || req.method !== 'GET') {
    json(res, 404, { ok: false, error: 'Not found.' });
    return true;
  }

  try {
    const sourceUrl = String(requestUrl.searchParams.get('url') || '').trim();
    if (!sourceUrl) {
      json(res, 400, { ok: false, error: '缺少 url 参数。' });
      return true;
    }

    const parsedUrl = parseYouTubeUrl(sourceUrl);
    const yt = await createInnertube();
    const info = await yt.getBasicInfo(parsedUrl.videoId);

    let transcriptInfo = null;
    let transcriptStatus = 'unavailable';
    const warnings = [];

    try {
      transcriptInfo = await info.getTranscript();
      transcriptStatus = 'available';
    } catch (error) {
      transcriptStatus = 'error';
      warnings.push(toWarningMessage(error));
    }

    const metadata = buildMetadata(parsedUrl, info, transcriptInfo, transcriptStatus);
    const transcriptSegments = transcriptInfo ? extractTranscriptSegments(transcriptInfo) : [];
    if (!transcriptSegments.length) {
      warnings.push('当前视频没有返回可用字幕时间轴，后续会退回为元数据层分析。');
    }

    json(res, 200, {
      ok: true,
      data: {
        ...metadata,
        transcriptSegments,
        warnings: Array.from(new Set(warnings.filter(Boolean))),
      },
    });
    return true;
  } catch (error) {
    json(res, 502, {
      ok: false,
      error: error?.message || 'YouTube 数据抓取失败。',
    });
    return true;
  }
};
