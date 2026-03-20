import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

const DEFAULT_ALLOWED_ORIGINS = [
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:4173',
  'http://localhost:4173',
];
const ALLOWED_ORIGINS = String(process.env.LOCAL_ANALYSIS_PROXY_CORS_ORIGIN || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const MAX_UPLOAD_BYTES = Number.parseInt(process.env.LOCAL_ANALYSIS_MAX_UPLOAD_BYTES || String(1024 * 1024 * 1024), 10);
const REQUEST_TIMEOUT_MS = Number.parseInt(process.env.LOCAL_ANALYSIS_TIMEOUT_MS || '900000', 10);
const TEMP_DIRECTORY = String(process.env.LOCAL_ANALYSIS_TEMP_DIR || path.join(os.tmpdir(), 'bigbanana-local-analysis')).trim();
const SCENE_THRESHOLD = Number.parseFloat(process.env.LOCAL_ANALYSIS_SCENE_THRESHOLD || '27.0');
const DEFAULT_TOOL_CONFIG = {
  whisperBinaryPath: String(process.env.LOCAL_ANALYSIS_WHISPER_BINARY || '').trim(),
  whisperModelPath: String(process.env.LOCAL_ANALYSIS_WHISPER_MODEL || '').trim(),
  pythonBinaryPath: String(process.env.LOCAL_ANALYSIS_SCENEDETECT_PYTHON || 'python').trim(),
};

const PY_SCENE_SCRIPT = String.raw`
import json
import sys

from scenedetect import ContentDetector, SceneManager, open_video

video = open_video(sys.argv[1])
scene_manager = SceneManager()
scene_manager.add_detector(ContentDetector(threshold=float(sys.argv[2])))
scene_manager.detect_scenes(video)
scene_list = scene_manager.get_scene_list()

result = []
for index, (start, end) in enumerate(scene_list, start=1):
    result.append({
        "id": f"scene_{index}",
        "startMs": int(round(start.get_seconds() * 1000)),
        "endMs": int(round(end.get_seconds() * 1000)),
    })

print(json.dumps({"sceneSegments": result}, ensure_ascii=False))
`;

const setCorsHeaders = (req, res) => {
  const requestOrigin = String(req.headers.origin || '').trim();
  const allowlist = ALLOWED_ORIGINS.length > 0 ? ALLOWED_ORIGINS : DEFAULT_ALLOWED_ORIGINS;
  const matchedOrigin = requestOrigin && allowlist.includes(requestOrigin) ? requestOrigin : allowlist[0];

  res.setHeader('Access-Control-Allow-Origin', matchedOrigin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-Local-Analysis-Options,X-Local-Analysis-File-Name,X-Local-Analysis-Config');
};

const json = (req, res, statusCode, payload) => {
  setCorsHeaders(req, res);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
};

const parseEncodedHeader = (req, headerName) => {
  const rawHeader = req.headers[headerName.toLowerCase()];
  const value = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (!value) return '';
  try {
    return decodeURIComponent(String(value));
  } catch {
    return String(value);
  }
};

const parseOptions = (req) => {
  const rawOptions = parseEncodedHeader(req, 'x-local-analysis-options');
  if (!rawOptions) {
    return {
      enableSceneDetection: true,
      language: 'auto',
      whisperModel: '',
      maxDurationMs: REQUEST_TIMEOUT_MS,
    };
  }

  const parsed = JSON.parse(rawOptions);
  return {
    enableSceneDetection: parsed?.enableSceneDetection !== false,
    language: typeof parsed?.language === 'string' && parsed.language.trim() ? parsed.language.trim() : 'auto',
    whisperModel: typeof parsed?.whisperModel === 'string' ? parsed.whisperModel.trim() : '',
    maxDurationMs: Number.isFinite(parsed?.maxDurationMs) ? Number(parsed.maxDurationMs) : REQUEST_TIMEOUT_MS,
  };
};

const parseConfig = (req) => {
  const rawConfig = parseEncodedHeader(req, 'x-local-analysis-config');
  if (!rawConfig) {
    return { ...DEFAULT_TOOL_CONFIG };
  }

  try {
    const parsed = JSON.parse(rawConfig);
    return {
      whisperBinaryPath: typeof parsed?.whisperBinaryPath === 'string' ? parsed.whisperBinaryPath.trim() : DEFAULT_TOOL_CONFIG.whisperBinaryPath,
      whisperModelPath: typeof parsed?.whisperModelPath === 'string' ? parsed.whisperModelPath.trim() : DEFAULT_TOOL_CONFIG.whisperModelPath,
      pythonBinaryPath: typeof parsed?.pythonBinaryPath === 'string' && parsed.pythonBinaryPath.trim()
        ? parsed.pythonBinaryPath.trim()
        : DEFAULT_TOOL_CONFIG.pythonBinaryPath,
    };
  } catch {
    return { ...DEFAULT_TOOL_CONFIG };
  }
};

const ensureTempDirectory = async () => {
  await fs.mkdir(TEMP_DIRECTORY, { recursive: true });
};

const sanitizeFileName = (value) => {
  const baseName = path.basename(String(value || 'analysis-input.mp4')).replace(/[^a-zA-Z0-9._-]+/g, '_');
  if (baseName.includes('.')) return baseName;
  return `${baseName || 'analysis-input'}.mp4`;
};

const inferExtensionFromContentType = (contentType) => {
  const normalized = String(contentType || '').toLowerCase();
  if (normalized.includes('quicktime')) return '.mov';
  if (normalized.includes('webm')) return '.webm';
  if (normalized.includes('ogg')) return '.ogv';
  if (normalized.includes('mpeg')) return '.mp4';
  return '.mp4';
};

const createTempInputPath = (req) => {
  const requestedFileName = sanitizeFileName(parseEncodedHeader(req, 'x-local-analysis-file-name'));
  const extension = path.extname(requestedFileName) || inferExtensionFromContentType(req.headers['content-type']);
  const stem = path.basename(requestedFileName, path.extname(requestedFileName)) || 'analysis-input';
  return path.join(TEMP_DIRECTORY, `${stem}_${crypto.randomUUID()}${extension}`);
};

const writeRequestBodyToFile = async (req, filePath) => {
  const fileHandle = await fs.open(filePath, 'w');
  let totalBytes = 0;

  try {
    for await (const chunk of req) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buffer.byteLength;
      if (totalBytes > MAX_UPLOAD_BYTES) {
        throw new Error(`上传文件过大，请控制在 ${Math.floor(MAX_UPLOAD_BYTES / 1024 / 1024)}MB 以内。`);
      }
      await fileHandle.write(buffer);
    }
  } finally {
    await fileHandle.close();
  }
};

const summarizeText = (value, maxLength = 400) => {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
};

const parseTimestampToMs = (value) => {
  const match = String(value || '').trim().match(/^(\d+):(\d+):(\d+)\.(\d+)$/);
  if (!match) return 0;
  const [, hours, minutes, seconds, milliseconds] = match;
  return (
    Number.parseInt(hours, 10) * 60 * 60 * 1000 +
    Number.parseInt(minutes, 10) * 60 * 1000 +
    Number.parseInt(seconds, 10) * 1000 +
    Number.parseInt(milliseconds.padEnd(3, '0').slice(0, 3), 10)
  );
};

const parseWhisperLines = (output) => {
  const lines = String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  return lines
    .map((line, index) => {
      const match = line.match(/^\[(\d{2}:\d{2}:\d{2}\.\d{3})\s+-->\s+(\d{2}:\d{2}:\d{2}\.\d{3})\]\s+(.*)$/);
      if (!match) return null;
      const [, startText, endText, text] = match;
      const trimmedText = text.trim();
      if (!trimmedText) return null;
      return {
        id: `stt_${index + 1}`,
        startMs: parseTimestampToMs(startText),
        endMs: parseTimestampToMs(endText),
        text: trimmedText,
        source: 'stt',
      };
    })
    .filter(Boolean);
};

const runCommand = (command, args, options = {}) => {
  const { timeoutMs = REQUEST_TIMEOUT_MS, cwd, allowNonZero = false } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      reject(new Error(`本地分析命令执行超时（${timeoutMs}ms）。`));
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString('utf8');
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString('utf8');
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
      if (!allowNonZero && code !== 0) {
        reject(new Error(summarizeText(stderr || stdout || `命令退出码 ${code}`)));
        return;
      }
      resolve({ code: code ?? 0, stdout, stderr });
    });
  });
};

const probeWhisper = async (config) => {
  const whisperBinaryPath = config.whisperBinaryPath;
  const whisperModelPath = config.whisperModelPath;
  const warnings = [];
  if (!whisperBinaryPath) warnings.push('未配置 whisper.cpp 可执行文件路径。');
  if (!whisperModelPath) warnings.push('未配置 whisper.cpp 模型文件路径。');

  if (!whisperBinaryPath || !whisperModelPath) {
    return {
      available: false,
      binaryPath: whisperBinaryPath || undefined,
      modelPath: whisperModelPath || undefined,
      warnings,
    };
  }

  try {
    await fs.access(whisperModelPath);
    const versionProbe = await runCommand(whisperBinaryPath, ['--help'], { timeoutMs: 5000, allowNonZero: true });
    return {
      available: true,
      binaryPath: whisperBinaryPath,
      modelPath: whisperModelPath,
      version: summarizeText(versionProbe.stdout || versionProbe.stderr, 160),
      warnings,
    };
  } catch (error) {
    return {
      available: false,
      binaryPath: whisperBinaryPath,
      modelPath: whisperModelPath,
      warnings: [...warnings, `Whisper 不可用：${error?.message || String(error)}`],
    };
  }
};

const probeSceneDetect = async (config) => {
  const pythonBinaryPath = config.pythonBinaryPath;
  try {
    const versionProbe = await runCommand(pythonBinaryPath, ['-c', 'import scenedetect,sys;sys.stdout.write(getattr(scenedetect,"__version__","unknown"))'], {
      timeoutMs: 5000,
    });
    return {
      available: true,
      command: pythonBinaryPath,
      version: summarizeText(versionProbe.stdout || versionProbe.stderr, 160),
      warnings: [],
    };
  } catch (error) {
    return {
      available: false,
      command: pythonBinaryPath,
      warnings: [`PySceneDetect 不可用：${error?.message || String(error)}`],
    };
  }
};

const runWhisper = async (inputPath, options, config) => {
  const args = ['-m', config.whisperModelPath, '-f', inputPath, '-l', options.language || 'auto', '-nt', 'false'];
  const startedAt = Date.now();
  const result = await runCommand(config.whisperBinaryPath, args, { timeoutMs: options.maxDurationMs || REQUEST_TIMEOUT_MS });
  const parsedLines = parseWhisperLines(`${result.stdout}\n${result.stderr}`);
  if (!parsedLines.length) {
    throw new Error('whisper.cpp 没有返回可解析的时间轴文本。');
  }
  return {
    transcript: {
      language: options.language || 'auto',
      lines: parsedLines,
      mergedText: parsedLines.map((line) => line.text).join('\n'),
    },
    meta: {
      used: true,
      model: options.whisperModel || path.basename(config.whisperModelPath),
      durationMs: Date.now() - startedAt,
      stderrSummary: summarizeText(result.stderr),
    },
    raw: {
      stdout: result.stdout,
      stderr: result.stderr,
    },
  };
};

const runSceneDetect = async (inputPath, config) => {
  const startedAt = Date.now();
  const result = await runCommand(config.pythonBinaryPath, ['-c', PY_SCENE_SCRIPT, inputPath, String(SCENE_THRESHOLD)], {
    timeoutMs: REQUEST_TIMEOUT_MS,
  });
  const parsed = JSON.parse(result.stdout || '{}');
  return {
    sceneSegments: Array.isArray(parsed?.sceneSegments) ? parsed.sceneSegments : [],
    meta: {
      used: true,
      durationMs: Date.now() - startedAt,
      stderrSummary: summarizeText(result.stderr),
    },
    raw: {
      stdout: result.stdout,
      stderr: result.stderr,
    },
  };
};

const createHealthPayload = async (config) => {
  await ensureTempDirectory();
  const [whisper, sceneDetect] = await Promise.all([probeWhisper(config), probeSceneDetect(config)]);
  return {
    ok: true,
    data: {
      whisper,
      sceneDetect,
      tempDir: TEMP_DIRECTORY,
      platform: process.platform,
      warnings: [...whisper.warnings, ...sceneDetect.warnings],
    },
  };
};

const validateRunRequest = async (req, config) => {
  const contentType = String(req.headers['content-type'] || '').toLowerCase();
  if (req.method !== 'POST') {
    throw new Error('Method not allowed.');
  }
  if (!(contentType.startsWith('video/') || contentType.startsWith('application/octet-stream'))) {
    throw new Error('仅支持 video/* 或 application/octet-stream 请求体。');
  }

  const whisperStatus = await probeWhisper(config);
  if (!whisperStatus.available) {
    throw new Error(whisperStatus.warnings[0] || '本地 Whisper 未就绪。');
  }

  return whisperStatus;
};

const runLocalAnalysis = async (req, config) => {
  const options = parseOptions(req);
  const warnings = [];
  await ensureTempDirectory();
  await validateRunRequest(req, config);
  const inputPath = createTempInputPath(req);

  try {
    await writeRequestBodyToFile(req, inputPath);
    const whisperResult = await runWhisper(inputPath, options, config);

    const response = {
      transcript: whisperResult.transcript,
      sceneSegments: [],
      warnings,
      toolMeta: {
        whisper: whisperResult.meta,
      },
      rawResponse: {
        whisperStdout: whisperResult.raw.stdout,
        whisperStderr: whisperResult.raw.stderr,
      },
    };

    if (options.enableSceneDetection) {
      const sceneDetectStatus = await probeSceneDetect(config);
      if (sceneDetectStatus.available) {
        try {
          const sceneResult = await runSceneDetect(inputPath, config);
          response.sceneSegments = sceneResult.sceneSegments;
          response.toolMeta.sceneDetect = sceneResult.meta;
          response.rawResponse.sceneDetectStdout = sceneResult.raw.stdout;
          response.rawResponse.sceneDetectStderr = sceneResult.raw.stderr;
        } catch (error) {
          warnings.push(`场景检测失败，已跳过：${error?.message || String(error)}`);
          response.toolMeta.sceneDetect = {
            used: false,
            durationMs: 0,
            stderrSummary: summarizeText(error?.message || String(error)),
          };
        }
      } else {
        warnings.push(sceneDetectStatus.warnings[0] || 'PySceneDetect 不可用，已跳过场景检测。');
        response.toolMeta.sceneDetect = {
          used: false,
          durationMs: 0,
          stderrSummary: summarizeText(sceneDetectStatus.warnings[0]),
        };
      }
    }

    return response;
  } finally {
    await fs.rm(inputPath, { force: true }).catch(() => undefined);
  }
};

export const createLocalAnalysisProxyHandler = () => async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (!requestUrl.pathname.startsWith('/api/local-analysis')) return false;

  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }

  if (requestUrl.pathname === '/api/local-analysis/healthz' && req.method === 'GET') {
    try {
      json(req, res, 200, await createHealthPayload(parseConfig(req)));
    } catch (error) {
      json(req, res, 500, { ok: false, error: error?.message || '本地分析健康检查失败。' });
    }
    return true;
  }

  if (requestUrl.pathname === '/api/local-analysis/run' && req.method === 'POST') {
    try {
      const data = await runLocalAnalysis(req, parseConfig(req));
      json(req, res, 200, { ok: true, data });
    } catch (error) {
      const message = error?.message || '本地分析执行失败。';
      const statusCode = message.includes('上传文件过大') || message.includes('仅支持') ? 400 : 502;
      json(req, res, statusCode, { ok: false, error: message });
    }
    return true;
  }

  json(req, res, 404, { ok: false, error: 'Not found.' });
  return true;
};
