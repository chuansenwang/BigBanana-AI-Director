import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const DEFAULT_MODE = 'mock';

const isPrivateHostname = (hostname) => {
  const lower = String(hostname || '').toLowerCase();
  if (!lower) return false;
  if (lower === 'localhost' || lower === '::1') return true;
  if (/^127\./.test(lower)) return true;
  if (/^10\./.test(lower)) return true;
  if (/^192\.168\./.test(lower)) return true;

  const match172 = lower.match(/^172\.(\d+)\./);
  if (match172) {
    const secondOctet = Number.parseInt(match172[1], 10);
    if (secondOctet >= 16 && secondOctet <= 31) return true;
  }

  return false;
};

const normalizeAllowedHosts = (value) => String(value || '')
  .split(',')
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

const normalizeRuntimeMode = (value) => {
  const normalized = String(value || DEFAULT_MODE).trim().toLowerCase();
  if (['mock', 'forward', 'auto'].includes(normalized)) return normalized;
  if (!String(value || '').trim()) return DEFAULT_MODE;
  throw Object.assign(new Error(`Invalid agent runtime mode: ${String(value)}.`), {
    statusCode: 500,
    code: 'AGENT_RUNTIME_MODE_INVALID',
  });
};

const validateRuntimeBaseUrl = ({ runtimeBaseUrl, allowPrivateHosts, allowedHosts }) => {
  if (!runtimeBaseUrl) {
    throw Object.assign(new Error('Agent runtime base URL is missing.'), { statusCode: 500, code: 'AGENT_RUNTIME_URL_MISSING' });
  }

  let parsed;
  try {
    parsed = new URL(String(runtimeBaseUrl).trim().replace(/\/+$/, ''));
  } catch {
    throw Object.assign(new Error('Agent runtime base URL is invalid.'), { statusCode: 500, code: 'AGENT_RUNTIME_URL_INVALID' });
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw Object.assign(new Error('Agent runtime only supports http/https.'), { statusCode: 500, code: 'AGENT_RUNTIME_URL_INVALID' });
  }

  if (!allowPrivateHosts && isPrivateHostname(parsed.hostname)) {
    throw Object.assign(new Error('Agent runtime private hosts are not allowed.'), { statusCode: 500, code: 'AGENT_RUNTIME_PRIVATE_HOST_BLOCKED' });
  }

  if (allowedHosts.length > 0) {
    const hostname = parsed.hostname.toLowerCase();
    const allowed = allowedHosts.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
    if (!allowed) {
      throw Object.assign(new Error('Agent runtime host is not allowlisted.'), { statusCode: 500, code: 'AGENT_RUNTIME_HOST_NOT_ALLOWED' });
    }
  }

  return parsed.toString().replace(/\/+$/, '');
};

const readRequestBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length ? Buffer.concat(chunks) : null;
};

const copyUpstreamHeaders = (res, upstream) => {
  ['content-type', 'cache-control', 'content-length', 'location'].forEach((key) => {
    const value = upstream.headers.get(key);
    if (value) {
      res.setHeader(key, value);
    }
  });
};

const buildForwardHeaders = (req) => {
  const headers = new Headers();
  Object.entries(req.headers || {}).forEach(([key, value]) => {
    if (!value) return;
    const lower = key.toLowerCase();
    if (['host', 'connection', 'content-length'].includes(lower)) return;
    if (Array.isArray(value)) {
      headers.set(lower, value.join(', '));
      return;
    }
    headers.set(lower, String(value));
  });
  return headers;
};

export const resolveAgentRuntimeConfig = (overrides = {}) => {
  const mode = normalizeRuntimeMode(overrides.mode ?? process.env.AGENT_GATEWAY_RUNTIME_MODE);
  const allowPrivateHosts = String(overrides.allowPrivateHosts ?? (process.env.AGENT_GATEWAY_ALLOW_PRIVATE_HOSTS || '')).toLowerCase() === 'true';
  const allowedHosts = normalizeAllowedHosts(overrides.allowedHosts ?? process.env.AGENT_GATEWAY_ALLOWED_HOSTS);
  const runtimeBaseUrl = String(overrides.runtimeBaseUrl ?? (process.env.AGENT_GATEWAY_RUNTIME_BASE_URL || '')).trim();

  if (mode === 'mock') {
    return { mode, runtimeBaseUrl: '', allowPrivateHosts, allowedHosts };
  }

  if (!runtimeBaseUrl) {
    return { mode, runtimeBaseUrl: '', allowPrivateHosts, allowedHosts };
  }

  return {
    mode,
    runtimeBaseUrl: validateRuntimeBaseUrl({ runtimeBaseUrl, allowPrivateHosts, allowedHosts }),
    allowPrivateHosts,
    allowedHosts,
  };
};

export const proxyAgentRuntimeRequest = async ({ req, res, requestUrl, runtimeConfig, fetchImpl = fetch }) => {
  if (!requestUrl.pathname.startsWith('/api/agents')) return false;
  if (runtimeConfig.mode === 'mock') return false;
  if (!runtimeConfig.runtimeBaseUrl) {
    if (runtimeConfig.mode === 'auto') return false;
    throw Object.assign(new Error('Agent runtime forwarding is enabled but no runtime URL is configured.'), { statusCode: 500, code: 'AGENT_RUNTIME_URL_MISSING' });
  }

  const upstreamUrl = new URL(`${requestUrl.pathname}${requestUrl.search}`, `${runtimeConfig.runtimeBaseUrl}/`);
  const controller = new AbortController();
  if (typeof req.on === 'function') {
    req.on('aborted', () => controller.abort());
  }
  if (typeof res.on === 'function') {
    res.on('close', () => {
      if (!res.writableEnded) {
        controller.abort();
      }
    });
  }

  const body = req.method && ['GET', 'HEAD'].includes(req.method.toUpperCase()) ? undefined : await readRequestBody(req);
  const upstream = await fetchImpl(upstreamUrl.toString(), {
    method: req.method || 'GET',
    headers: buildForwardHeaders(req),
    body,
    redirect: 'follow',
    signal: controller.signal,
    duplex: body ? 'half' : undefined,
  });

  res.statusCode = upstream.status;
  copyUpstreamHeaders(res, upstream);

  if (!upstream.body) {
    res.end();
    return true;
  }

  const contentType = upstream.headers.get('content-type') || '';
  if (contentType.includes('text/event-stream')) {
    if (typeof res.flushHeaders === 'function') {
      res.flushHeaders();
    } else {
      res.headersSent = true;
    }

    try {
      await pipeline(Readable.fromWeb(upstream.body), res);
    } catch (error) {
      throw Object.assign(error instanceof Error ? error : new Error('Agent runtime stream failed.'), {
        responseStarted: true,
      });
    }
    return true;
  }

  const buffer = Buffer.from(await upstream.arrayBuffer());
  res.end(buffer);
  return true;
};
