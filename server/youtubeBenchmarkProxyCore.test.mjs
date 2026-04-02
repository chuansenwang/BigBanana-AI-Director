import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import {
  applyEnvDefaults,
  createMockRequest,
  createYouTubeBenchmarkHandler,
  getDownloaderCandidates,
  normalizeArtifactStorageConfig,
  parseEnvFileContent,
} from './youtubeBenchmarkProxyCore.mjs';

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
  return { handled, req, res, json: () => res.toJson() };
};

test('download route rejects missing url', async () => {
  const handler = createYouTubeBenchmarkHandler({
    downloadVideo: async () => ({ status: 'ready', localPath: 'C:\\tmp\\video.mp4' }),
  });

  const result = await invoke(handler, {
    method: 'POST',
    url: '/api/youtube-benchmark/download',
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify({ videoId: 'abc123' })),
  });

  assert.equal(result.handled, true);
  assert.equal(result.res.statusCode, 400);
  assert.equal(result.json().ok, false);
});

test('parseEnvFileContent reads root .env style entries', () => {
  const parsed = parseEnvFileContent(`\uFEFF# comment\nYOUTUBE_BENCHMARK_YTDLP_BIN=D:\\soft\\yt-dlp.exe\nexport YOUTUBE_BENCHMARK_ALLOW_PY_FALLBACK=false\nQUOTED_PATH="D:\\tools\\yt-dlp.exe"\n`);

  assert.equal(parsed.YOUTUBE_BENCHMARK_YTDLP_BIN, 'D:\\soft\\yt-dlp.exe');
  assert.equal(parsed.YOUTUBE_BENCHMARK_ALLOW_PY_FALLBACK, 'false');
  assert.equal(parsed.QUOTED_PATH, 'D:\\tools\\yt-dlp.exe');
});

test('applyEnvDefaults does not overwrite existing process-style values', () => {
  const targetEnv = {
    YOUTUBE_BENCHMARK_YTDLP_BIN: 'C:\\existing\\yt-dlp.exe',
  };

  applyEnvDefaults({
    YOUTUBE_BENCHMARK_YTDLP_BIN: 'D:\\soft\\yt-dlp.exe',
    YOUTUBE_BENCHMARK_ALLOW_PY_FALLBACK: 'false',
  }, targetEnv);

  assert.equal(targetEnv.YOUTUBE_BENCHMARK_YTDLP_BIN, 'C:\\existing\\yt-dlp.exe');
  assert.equal(targetEnv.YOUTUBE_BENCHMARK_ALLOW_PY_FALLBACK, 'false');
});

test('download route rejects unsafe artifact directory rules', async () => {
  const handler = createYouTubeBenchmarkHandler();

  const result = await invoke(handler, {
    method: 'POST',
    url: '/api/youtube-benchmark/download',
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify({
      url: 'https://www.youtube.com/watch?v=abc123',
      videoId: 'abc123',
      artifactStorageConfig: {
        rootFolder: '../outside',
      },
    })),
  });

  assert.equal(result.res.statusCode, 200);
  assert.equal(result.res.getHeader('content-type'), 'text/event-stream; charset=utf-8');
  assert.match(result.res.toBuffer().toString('utf8'), /"type":"error"/);
  assert.match(result.res.toBuffer().toString('utf8'), /不能包含相对跳转目录/);
});

test('download route returns downloaded artifact payload', async () => {
  const calls = [];
  const handler = createYouTubeBenchmarkHandler({
    downloadVideo: async (payload) => {
      calls.push(payload);
      payload.onEvent?.({
        type: 'status',
        artifact: {
          status: 'downloading',
          outputDirectory: 'C:\\artifacts\\downloads\\youtube-benchmarks\\abc123',
        },
      });
      payload.onEvent?.({
        type: 'progress',
        artifact: {
          status: 'downloading',
          outputDirectory: 'C:\\artifacts\\downloads\\youtube-benchmarks\\abc123',
          progressPercent: 42,
          downloadedBytes: 4200,
          totalBytes: 10000,
        },
      });
      return {
        status: 'ready',
        localPath: 'C:\\artifacts\\downloads\\youtube-benchmarks\\abc123\\video.mp4',
        fileName: 'video.mp4',
        outputDirectory: 'C:\\artifacts\\downloads\\youtube-benchmarks\\abc123',
        warnings: ['demo'],
      };
    },
  });

  const result = await invoke(handler, {
    method: 'POST',
    url: '/api/youtube-benchmark/download',
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify({
      url: 'https://www.youtube.com/watch?v=abc123',
      videoId: 'abc123',
      artifactStorageConfig: {
        rootFolder: 'artifacts',
        downloadsFolder: 'downloads',
        slicesFolder: 'slices',
        groupByProject: true,
        groupByEpisode: true,
      },
    })),
  });

  assert.equal(result.res.statusCode, 200);
  assert.equal(result.res.getHeader('content-type'), 'text/event-stream; charset=utf-8');
  const body = result.res.toBuffer().toString('utf8');
  assert.match(body, /"type":"status"/);
  assert.match(body, /"type":"progress"/);
  assert.match(body, /"type":"done"/);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].videoId, 'abc123');
});

test('download route surfaces downloader errors', async () => {
  const handler = createYouTubeBenchmarkHandler({
    downloadVideo: async () => {
      throw new Error('yt-dlp missing');
    },
  });

  const result = await invoke(handler, {
    method: 'POST',
    url: '/api/youtube-benchmark/download',
    headers: { 'content-type': 'application/json' },
    body: Buffer.from(JSON.stringify({
      url: 'https://www.youtube.com/watch?v=abc123',
      videoId: 'abc123',
      artifactStorageConfig: {
        rootFolder: 'artifacts',
        downloadsFolder: 'downloads',
        slicesFolder: 'slices',
      },
    })),
  });

  assert.equal(result.res.statusCode, 200);
  assert.equal(result.res.getHeader('content-type'), 'text/event-stream; charset=utf-8');
  assert.match(result.res.toBuffer().toString('utf8'), /"type":"error"/);
  assert.match(result.res.toBuffer().toString('utf8'), /yt-dlp missing/);
});

test('downloader candidates on Windows prefer executable resolution without python fallback by default', () => {
  const candidates = getDownloaderCandidates('custom-ytdlp.exe', { platform: 'win32' });
  assert.equal(candidates[0].label, 'custom-ytdlp.exe');
  assert.equal(candidates.some((candidate) => candidate.label === 'yt-dlp'), true);
  assert.equal(candidates.some((candidate) => candidate.label === 'py -m yt_dlp'), false);
});

test('downloader candidates can opt into python fallback on Windows', () => {
  const candidates = getDownloaderCandidates('custom-ytdlp.exe', {
    platform: 'win32',
    allowPythonFallback: true,
  });

  assert.equal(candidates[0].label, 'custom-ytdlp.exe');
  assert.equal(candidates.some((candidate) => candidate.label === 'yt-dlp'), true);
  assert.equal(candidates.at(-1)?.label, 'py -m yt_dlp');
});

test('downloader candidates can enable python fallback on non-Windows platforms', () => {
  const candidates = getDownloaderCandidates('custom-ytdlp', {
    platform: 'linux',
    allowPythonFallback: true,
  });

  assert.equal(candidates[0].label, 'custom-ytdlp');
  assert.equal(candidates.at(-1)?.label, 'py -m yt_dlp');
});

test('downloader candidates honor explicit python-fallback disable on non-Windows platforms', () => {
  const candidates = getDownloaderCandidates('custom-ytdlp', {
    platform: 'linux',
    allowPythonFallback: false,
  });

  assert.equal(candidates[0].label, 'custom-ytdlp');
  assert.equal(candidates.some((candidate) => candidate.label === 'py -m yt_dlp'), false);
});

test('artifact storage accepts absolute Windows root folder', () => {
  const normalized = normalizeArtifactStorageConfig({
    rootFolder: 'D:\\soft\\video-downloader',
    downloadsFolder: 'downloads',
    slicesFolder: 'slices',
  });

  assert.equal(normalized.rootFolder, 'D:/soft/video-downloader');
  assert.equal(normalized.downloadsFolder, 'downloads');
});

test('artifact storage still rejects absolute child folders', () => {
  assert.throws(
    () => normalizeArtifactStorageConfig({
      rootFolder: 'D:\\soft\\video-downloader',
      downloadsFolder: 'D:\\downloads',
      slicesFolder: 'slices',
    }),
    /下载目录规则 包含 Windows 不支持的目录字符/,
  );
});
