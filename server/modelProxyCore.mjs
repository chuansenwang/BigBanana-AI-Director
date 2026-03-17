import crypto from 'node:crypto';

const SESSION_COOKIE_NAME = 'bigbanana_model_proxy_sid';
const SESSION_TTL_SECONDS = Number.parseInt(process.env.MODEL_PROXY_SESSION_TTL || '604800', 10);
const ALLOW_PRIVATE_HOSTS = String(process.env.MODEL_PROXY_ALLOW_PRIVATE_HOSTS || '').toLowerCase() === 'true';
const ALLOWED_HOST_SUFFIXES = String(process.env.MODEL_PROXY_ALLOWED_HOSTS || '')
  .split(',')
  .map((value) => value.trim().toLowerCase())
  .filter(Boolean);

const sessions = new Map();

const json = (res, statusCode, payload) => {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
};

const setCorsHeaders = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,X-BigBanana-Proxy-Provider');
};

const parseCookieHeader = (cookieHeader = '') => {
  return cookieHeader
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const index = part.indexOf('=');
      if (index <= 0) return acc;
      acc[part.slice(0, index).trim()] = part.slice(index + 1).trim();
      return acc;
    }, {});
};

const cookieJarToHeader = (jar = {}) => Object.entries(jar)
  .filter(([key, value]) => key && value)
  .map(([key, value]) => `${key}=${value}`)
  .join('; ');

const mergeSetCookieIntoJar = (jar, response) => {
  const getSetCookie = response.headers.getSetCookie?.bind(response.headers);
  const lines = typeof getSetCookie === 'function'
    ? getSetCookie()
    : (response.headers.get('set-cookie') ? [response.headers.get('set-cookie')] : []);

  lines.forEach((line) => {
    if (!line) return;
    const firstPart = String(line).split(';', 1)[0]?.trim();
    const index = firstPart.indexOf('=');
    if (index <= 0) return;
    jar[firstPart.slice(0, index).trim()] = firstPart.slice(index + 1).trim();
  });
};

const getCookieSecureFlag = (req) => {
  const forwardedProto = String(req.headers['x-forwarded-proto'] || '').toLowerCase();
  if (forwardedProto === 'https') return true;
  return Boolean(req.socket?.encrypted);
};

const setSessionCookie = (req, res, sessionId) => {
  const secure = getCookieSecureFlag(req);
  const parts = [
    `${SESSION_COOKIE_NAME}=${sessionId}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ];
  if (secure) parts.push('Secure');
  res.setHeader('Set-Cookie', parts.join('; '));
};

const cleanupExpiredSessions = () => {
  const now = Date.now();
  for (const [key, session] of sessions.entries()) {
    if (!session?.expiresAt || session.expiresAt <= now) {
      sessions.delete(key);
    }
  }
};

const getLocalSession = (req) => {
  cleanupExpiredSessions();
  const cookies = parseCookieHeader(req.headers.cookie || '');
  const sessionId = cookies[SESSION_COOKIE_NAME];
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session) return null;
  session.expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  return { sessionId, session };
};

const saveLocalSession = (session) => {
  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, { ...session, expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000 });
  return sessionId;
};

const updateLocalSession = (sessionId, patch) => {
  const current = sessions.get(sessionId);
  if (!current) return;
  sessions.set(sessionId, { ...current, ...patch, expiresAt: Date.now() + SESSION_TTL_SECONDS * 1000 });
};

const isPrivateHostname = (hostname) => {
  const lower = hostname.toLowerCase();
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

const validateTargetUrl = (value) => {
  let url;
  try {
    url = new URL(String(value || '').trim());
  } catch {
    throw new Error('目标地址格式不正确');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('仅支持 http/https 协议');
  }

  if (!ALLOW_PRIVATE_HOSTS && isPrivateHostname(url.hostname)) {
    throw new Error('不允许访问私网或本地地址');
  }

  if (ALLOWED_HOST_SUFFIXES.length > 0) {
    const hostname = url.hostname.toLowerCase();
    const allowed = ALLOWED_HOST_SUFFIXES.some((suffix) => hostname === suffix || hostname.endsWith(`.${suffix}`));
    if (!allowed) {
      throw new Error('目标地址不在允许列表中');
    }
  }

  return url;
};

const readRequestPayload = async (req) => {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

const collectUpstreamBody = async ({ bodyType, body, contentType }) => {
  if (!bodyType || body == null) return undefined;

  if (bodyType === 'json') {
    return JSON.stringify(body);
  }

  if (bodyType === 'text') {
    return String(body);
  }

  if (bodyType === 'form-data') {
    const formData = new FormData();
    for (const entry of body || []) {
      if (entry?.kind === 'file') {
        const bytes = Uint8Array.from(atob(entry.base64), (c) => c.charCodeAt(0));
        formData.append(entry.name, new Blob([bytes], { type: entry.mimeType || 'application/octet-stream' }), entry.filename || 'upload.bin');
      } else {
        formData.append(entry.name, entry.value ?? '');
      }
    }
    return formData;
  }

  if (bodyType === 'binary-base64') {
    return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  }

  if (contentType?.includes('application/json')) {
    return JSON.stringify(body);
  }

  return body;
};

export const createModelProxyHandler = () => async (req, res) => {
  const requestUrl = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
  if (!requestUrl.pathname.startsWith('/api/model-proxy')) return false;

  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return true;
  }

  if (requestUrl.pathname === '/api/model-proxy/healthz' && req.method === 'GET') {
    json(res, 200, { ok: true, service: 'model-proxy', allowedHostSuffixes: ALLOWED_HOST_SUFFIXES });
    return true;
  }

  if (requestUrl.pathname !== '/api/model-proxy/request' || req.method !== 'POST') {
    json(res, 404, { error: 'Not found.' });
    return true;
  }

  try {
    const payload = await readRequestPayload(req);
    const targetUrl = validateTargetUrl(payload.targetUrl);
    const providerKey = String(payload.providerKey || targetUrl.origin);
    const sessionInfo = getLocalSession(req);
    const cookieJar = { ...(sessionInfo?.session?.cookieJars?.[providerKey] || {}) };

    const headers = new Headers(payload.headers || {});
    if (Object.keys(cookieJar).length > 0) {
      headers.set('cookie', cookieJarToHeader(cookieJar));
    }

    if (!payload.headers?.['Content-Type'] && payload.contentType && payload.bodyType !== 'form-data') {
      headers.set('Content-Type', payload.contentType);
    }

    const body = await collectUpstreamBody({
      bodyType: payload.bodyType,
      body: payload.body,
      contentType: payload.contentType,
    });

    const upstream = await fetch(targetUrl.toString(), {
      method: payload.method || 'POST',
      headers,
      body,
      redirect: 'follow',
    });

    mergeSetCookieIntoJar(cookieJar, upstream);
    if (Object.keys(cookieJar).length > 0) {
      if (sessionInfo?.sessionId) {
        updateLocalSession(sessionInfo.sessionId, {
          cookieJars: { ...(sessionInfo.session.cookieJars || {}), [providerKey]: cookieJar },
        });
      } else {
        const sessionId = saveLocalSession({ cookieJars: { [providerKey]: cookieJar } });
        setSessionCookie(req, res, sessionId);
      }
    }

    const responseHeaders = {};
    upstream.headers.forEach((value, key) => {
      if (['content-type', 'content-length', 'cache-control'].includes(key.toLowerCase())) {
        responseHeaders[key] = value;
      }
    });

    const arrayBuffer = await upstream.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const isJson = contentType.includes('application/json');

    json(res, upstream.status, {
      ok: upstream.ok,
      status: upstream.status,
      contentType,
      headers: responseHeaders,
      bodyType: isJson ? 'json' : 'base64',
      body: isJson ? JSON.parse(buffer.toString('utf8') || 'null') : buffer.toString('base64'),
    });
    return true;
  } catch (error) {
    json(res, 502, {
      ok: false,
      error: error?.message || 'Model proxy request failed.',
    });
    return true;
  }
};
