import http from 'node:http';
import { createSharedStorageHandler } from './sharedStorageCore.mjs';

const PORT = Number.parseInt(process.env.SHARED_STORAGE_PORT || process.env.PORT || '8792', 10);
const HOST = process.env.SHARED_STORAGE_HOST || '0.0.0.0';

const handler = createSharedStorageHandler();

const server = http.createServer(async (req, res) => {
  const handled = await handler(req, res);
  if (!handled) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Not found.' }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`shared-storage server listening on http://${HOST}:${PORT}`);
});
