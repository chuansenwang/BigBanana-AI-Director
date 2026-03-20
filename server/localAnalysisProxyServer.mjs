import http from 'node:http';
import { createLocalAnalysisProxyHandler } from './localAnalysisProxyCore.mjs';

const PORT = Number.parseInt(process.env.LOCAL_ANALYSIS_PROXY_PORT || process.env.PORT || '8791', 10);
const HOST = process.env.LOCAL_ANALYSIS_PROXY_HOST || '127.0.0.1';

const handler = createLocalAnalysisProxyHandler();

const server = http.createServer(async (req, res) => {
  const handled = await handler(req, res);
  if (!handled) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'Not found.' }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`local analysis proxy server listening on http://${HOST}:${PORT}`);
});
