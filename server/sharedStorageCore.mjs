import fs from 'node:fs';
import { Readable } from 'node:stream';
import { createSharedStorageRepository } from './sharedStorageRepository.mjs';

const DEFAULT_ALLOWED_ORIGINS = [
  'http://127.0.0.1:5173',
  'http://localhost:5173',
  'http://127.0.0.1:4173',
  'http://localhost:4173',
];

const BASE_PATH = '/api/shared-storage';

const parseAllowedOrigins = () => {
  const raw = String(process.env.SHARED_STORAGE_CORS_ORIGIN || '').trim();
  if (!raw) return DEFAULT_ALLOWED_ORIGINS;
  if (raw === '*') return ['*'];
  return raw.split(',').map((value) => value.trim()).filter(Boolean);
};

const setCorsHeaders = (req, res, allowedOrigins = parseAllowedOrigins()) => {
  const requestOrigin = String(req.headers.origin || '').trim();
  const allowOrigin = allowedOrigins.includes('*')
    ? '*'
    : (requestOrigin && allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0]);

  res.setHeader('Access-Control-Allow-Origin', allowOrigin || '*');
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Range');
};

const json = (req, res, statusCode, payload, allowedOrigins) => {
  setCorsHeaders(req, res, allowedOrigins);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
};

const readRequestBodyBuffer = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length > 0 ? Buffer.concat(chunks) : Buffer.alloc(0);
};

const readJsonBody = async (req) => {
  const buffer = await readRequestBodyBuffer(req);
  if (buffer.length === 0) return {};
  return JSON.parse(buffer.toString('utf8'));
};

const parseMultipartFormData = (buffer, boundary) => {
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const parts = [];
  let cursor = 0;

  while (cursor < buffer.length) {
    const start = buffer.indexOf(boundaryBuffer, cursor);
    if (start < 0) break;
    const afterBoundary = start + boundaryBuffer.length;
    if (buffer.slice(afterBoundary, afterBoundary + 2).equals(Buffer.from('--'))) break;

    let partStart = afterBoundary;
    if (buffer[partStart] === 13 && buffer[partStart + 1] === 10) partStart += 2;
    const nextBoundary = buffer.indexOf(boundaryBuffer, partStart);
    if (nextBoundary < 0) break;

    let partBuffer = buffer.slice(partStart, nextBoundary);
    if (partBuffer.length >= 2 && partBuffer[partBuffer.length - 2] === 13 && partBuffer[partBuffer.length - 1] === 10) {
      partBuffer = partBuffer.slice(0, -2);
    }

    const headerEnd = partBuffer.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd >= 0) {
      const headerText = partBuffer.slice(0, headerEnd).toString('utf8');
      const content = partBuffer.slice(headerEnd + 4);
      const headers = Object.fromEntries(
        headerText
          .split('\r\n')
          .map((line) => line.split(/:\s*/, 2))
          .filter(([key]) => key)
          .map(([key, value]) => [key.toLowerCase(), value || ''])
      );
      const disposition = headers['content-disposition'] || '';
      const nameMatch = disposition.match(/name="([^"]+)"/i);
      const fileNameMatch = disposition.match(/filename="([^"]*)"/i);
      parts.push({
        name: nameMatch?.[1] || '',
        fileName: fileNameMatch?.[1] || '',
        contentType: headers['content-type'] || 'application/octet-stream',
        data: content,
      });
    }

    cursor = nextBoundary;
  }

  return parts;
};

const parseVideoUpload = async (req) => {
  const contentType = String(req.headers['content-type'] || '');
  const boundaryMatch = contentType.match(/boundary=([^;]+)/i);
  if (!boundaryMatch) {
    throw new Error('multipart/form-data boundary is required.');
  }

  const bodyBuffer = await readRequestBodyBuffer(req);
  const parts = parseMultipartFormData(bodyBuffer, boundaryMatch[1]);
  const filePart = parts.find((part) => part.fileName) || parts.find((part) => part.name === 'file');
  if (!filePart || !filePart.data?.length) {
    throw new Error('No uploaded video file was found.');
  }

  return {
    fileName: filePart.fileName || 'video.bin',
    contentType: filePart.contentType || 'application/octet-stream',
    buffer: filePart.data,
  };
};

const getRange = (rangeHeader, size) => {
  const match = String(rangeHeader || '').match(/^bytes=(\d*)-(\d*)$/i);
  if (!match) return null;
  const [, startText, endText] = match;
  let start = startText ? Number.parseInt(startText, 10) : NaN;
  let end = endText ? Number.parseInt(endText, 10) : NaN;

  if (Number.isNaN(start) && Number.isNaN(end)) return null;
  if (Number.isNaN(start)) {
    const suffixLength = end;
    if (!Number.isFinite(suffixLength) || suffixLength <= 0) return null;
    start = Math.max(size - suffixLength, 0);
    end = size - 1;
  } else if (Number.isNaN(end)) {
    end = size - 1;
  }

  if (start < 0 || end < start || start >= size) return { invalid: true };
  end = Math.min(end, size - 1);
  return { start, end };
};

const streamFileRange = (req, res, { filePath, size, fileName, contentType }, allowedOrigins) => {
  const range = getRange(req.headers.range, size);
  setCorsHeaders(req, res, allowedOrigins);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', contentType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);

  if (range?.invalid) {
    res.statusCode = 416;
    res.setHeader('Content-Range', `bytes */${size}`);
    res.end();
    return;
  }

  if (range) {
    const contentLength = range.end - range.start + 1;
    res.statusCode = 206;
    res.setHeader('Content-Length', String(contentLength));
    res.setHeader('Content-Range', `bytes ${range.start}-${range.end}/${size}`);
    fs.createReadStream(filePath, { start: range.start, end: range.end }).pipe(res);
    return;
  }

  res.statusCode = 200;
  res.setHeader('Content-Length', String(size));
  fs.createReadStream(filePath).pipe(res);
};

export const createSharedStorageHandler = ({ repository, allowedOrigins } = {}) => {
  const repo = repository || createSharedStorageRepository();
  const corsOrigins = allowedOrigins || parseAllowedOrigins();

  return async (req, res) => {
    const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (!requestUrl.pathname.startsWith(BASE_PATH)) return false;

    setCorsHeaders(req, res, corsOrigins);

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return true;
    }

    try {
      if (requestUrl.pathname === `${BASE_PATH}/healthz` && req.method === 'GET') {
        await repo.ensureReady();
        json(req, res, 200, { ok: true, service: 'shared-storage', storageDir: repo.storageDir }, corsOrigins);
        return true;
      }

      if (requestUrl.pathname === `${BASE_PATH}/bootstrap` && req.method === 'GET') {
        json(req, res, 200, { ok: true, data: await repo.getBootstrap() }, corsOrigins);
        return true;
      }

      if (requestUrl.pathname === `${BASE_PATH}/bootstrap/migrate` && req.method === 'POST') {
        const payload = await readJsonBody(req);
        const data = await repo.migrateBootstrap(payload);
        json(req, res, 200, { ok: true, data }, corsOrigins);
        return true;
      }

      if (requestUrl.pathname === `${BASE_PATH}/model-registry`) {
        if (req.method === 'GET') {
          json(req, res, 200, { ok: true, data: await repo.getModelRegistry() }, corsOrigins);
          return true;
        }
        if (req.method === 'PUT') {
          const payload = await readJsonBody(req);
          json(req, res, 200, { ok: true, data: await repo.putModelRegistry(payload) }, corsOrigins);
          return true;
        }
      }

      if (requestUrl.pathname === `${BASE_PATH}/media/videos` && req.method === 'POST') {
        const upload = await parseVideoUpload(req);
        const saved = await repo.saveVideo(upload);
        json(req, res, 201, {
          ok: true,
          data: {
            fileName: saved.fileName,
            size: saved.size,
            contentType: saved.contentType,
            url: `${BASE_PATH}/media/videos/${encodeURIComponent(saved.fileName)}`,
          },
        }, corsOrigins);
        return true;
      }

      const mediaMatch = requestUrl.pathname.match(/^\/api\/shared-storage\/media\/videos\/([^/]+)$/);
      if (mediaMatch && req.method === 'GET') {
        const fileName = decodeURIComponent(mediaMatch[1]);
        const file = await repo.getVideo(fileName);
        streamFileRange(req, res, file, corsOrigins);
        return true;
      }

      const storeItemMatch = requestUrl.pathname.match(/^\/api\/shared-storage\/stores\/([^/]+)\/([^/]+)$/);
      if (storeItemMatch) {
        const [, routeName, itemId] = storeItemMatch;
        const storeKey = repo.resolveStoreKey(routeName);
        if (!storeKey) {
          json(req, res, 404, { ok: false, error: 'Unknown store.' }, corsOrigins);
          return true;
        }

        if (req.method === 'GET') {
          const item = await repo.getStoreItem(storeKey, decodeURIComponent(itemId));
          if (!item) {
            json(req, res, 404, { ok: false, error: 'Not found.' }, corsOrigins);
            return true;
          }
          json(req, res, 200, { ok: true, data: item }, corsOrigins);
          return true;
        }

        if (req.method === 'PUT') {
          const payload = await readJsonBody(req);
          const normalizedId = decodeURIComponent(itemId);
          if (payload?.id != null && String(payload.id) !== normalizedId) {
            json(req, res, 400, { ok: false, error: 'Item id does not match route id.' }, corsOrigins);
            return true;
          }
          const data = await repo.putStoreItem(storeKey, normalizedId, payload);
          json(req, res, 200, { ok: true, data }, corsOrigins);
          return true;
        }

        if (req.method === 'DELETE') {
          const deleted = await repo.deleteStoreItem(storeKey, decodeURIComponent(itemId));
          if (!deleted) {
            json(req, res, 404, { ok: false, error: 'Not found.' }, corsOrigins);
            return true;
          }
          json(req, res, 200, { ok: true, deleted: true }, corsOrigins);
          return true;
        }
      }

      const storeMatch = requestUrl.pathname.match(/^\/api\/shared-storage\/stores\/([^/]+)$/);
      if (storeMatch && req.method === 'GET') {
        const routeName = storeMatch[1];
        const storeKey = repo.resolveStoreKey(routeName);
        if (!storeKey) {
          json(req, res, 404, { ok: false, error: 'Unknown store.' }, corsOrigins);
          return true;
        }
        json(req, res, 200, { ok: true, data: await repo.listStore(storeKey) }, corsOrigins);
        return true;
      }

      json(req, res, 404, { ok: false, error: 'Not found.' }, corsOrigins);
      return true;
    } catch (error) {
      const statusCode = Number.isFinite(error?.statusCode)
        ? Number(error.statusCode)
        : (error?.code === 'ENOENT' ? 404 : 400);
      json(req, res, statusCode, { ok: false, error: error?.message || 'Shared storage request failed.' }, corsOrigins);
      return true;
    }
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
