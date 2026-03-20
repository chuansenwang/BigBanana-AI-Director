import http from 'node:http';
import { createYouTubeBenchmarkHandler } from './youtubeBenchmarkProxyCore.mjs';

const PORT = Number.parseInt(process.env.YOUTUBE_BENCHMARK_PROXY_PORT || process.env.PORT || '8790', 10);
const HOST = process.env.YOUTUBE_BENCHMARK_PROXY_HOST || '0.0.0.0';

const handler = createYouTubeBenchmarkHandler();

const server = http.createServer(async (req, res) => {
  const handled = await handler(req, res);
  if (!handled) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ ok: false, error: 'Not found.' }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`youtube benchmark proxy server listening on http://${HOST}:${PORT}`);
});
