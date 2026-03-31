import { Readable } from 'node:stream';
import { createAgentMockHandler } from '../agents/agentMockHandler.mjs';
import { proxyAgentRuntimeRequest, resolveAgentRuntimeConfig } from './agentRuntimeClient.mjs';

export const createAgentGatewayHandler = (options = {}) => {
  const runtimeConfig = resolveAgentRuntimeConfig(options.runtimeConfig);
  const fetchImpl = options.fetchImpl || fetch;
  const fallbackHandler = createAgentMockHandler();

  const json = (res, statusCode, payload) => {
    res.statusCode = statusCode;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(payload));
  };

  return async (req, res) => {
    const requestUrl = new URL(req.url || '/', 'http://localhost');
    const { pathname, searchParams } = requestUrl;

    try {
      const proxied = await proxyAgentRuntimeRequest({
        req,
        res,
        requestUrl,
        runtimeConfig,
        fetchImpl,
      });
      if (proxied) return true;
    } catch (error) {
      if (error?.responseStarted || res.headersSent) {
        try {
          if (!res.writableEnded) {
            res.end();
          }
        } catch {
          res.destroy?.();
        }
        return true;
      }

      json(res, Number.isFinite(error?.statusCode) ? Number(error.statusCode) : 502, {
        error: error?.message || 'Agent runtime request failed.',
        code: error?.code || 'AGENT_RUNTIME_REQUEST_FAILED',
      });
      return true;
    }

    return fallbackHandler(req, res);
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
