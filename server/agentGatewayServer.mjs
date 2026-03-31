import http from 'node:http';
import { createAgentGatewayHandler } from './agentGatewayCore.mjs';

// Optional envs for a real runtime seam:
// AGENT_GATEWAY_RUNTIME_MODE=mock|forward|auto
// AGENT_GATEWAY_RUNTIME_BASE_URL=https://runtime.example.com
const PORT = Number.parseInt(process.env.AGENT_GATEWAY_PORT || process.env.PORT || '8795', 10);
const HOST = process.env.AGENT_GATEWAY_HOST || '0.0.0.0';

const handler = createAgentGatewayHandler();

const server = http.createServer(async (req, res) => {
  const handled = await handler(req, res);
  if (!handled) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: 'Not found.' }));
  }
});

server.listen(PORT, HOST, () => {
  console.log(`agent gateway server listening on http://${HOST}:${PORT}`);
});
