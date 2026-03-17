import http from 'node:http';
import { createModelProxyHandler } from './modelProxyCore.mjs';

const PORT = Number.parseInt(process.env.MODEL_PROXY_PORT || process.env.PORT || '8789', 10);
const HOST = process.env.MODEL_PROXY_HOST || '0.0.0.0';

const handler = createModelProxyHandler();

const server = http.createServer(async (req, res) => {
  const handled = await handler(req, res);
  if (!handled) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Not found.' }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`model proxy server listening on http://${HOST}:${PORT}`);
});
