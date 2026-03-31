import http from 'node:http';
import { createAgentRuntimeHandler } from './agentRuntimeCore.mjs';

const PORT = Number.parseInt(process.env.AGENT_RUNTIME_PORT || process.env.PORT || '8796', 10);
const HOST = process.env.AGENT_RUNTIME_HOST || '0.0.0.0';

const handler = createAgentRuntimeHandler();

const server = http.createServer(async (req, res) => {
  const handled = await handler(req, res);
  if (!handled) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Not found.' }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`agent runtime server listening on http://${HOST}:${PORT}`);
});
