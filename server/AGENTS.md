# SERVER KNOWLEDGE BASE

## OVERVIEW
`server/` is a tiny Node.js proxy runtime used to protect browser flows and normalize upstream API/media access. It is not a general application backend.

## WHERE TO LOOK
| Task | Location | Notes |
|---|---|---|
| new-api server entry | `newApiProxyServer.mjs` | thin `http.createServer` bootstrap |
| new-api logic | `newApiProxyCore.mjs` | endpoint validation, cookie/session handling, upstream proxying |
| media proxy | `mediaProxyServer.mjs` | host/protocol allowlist, range-header passthrough, CORS |

## CONVENTIONS
- Runtime is plain Node ES modules: `.mjs`, `node:http`, `node:stream`; no TypeScript here.
- Configuration is environment-variable driven (`NEW_API_*`, `MEDIA_PROXY_*`).
- `newApiProxyCore.mjs` keeps sessions in an in-memory `Map`; design for lightweight deployment, not distributed session storage.
- Both proxies are allowlist-oriented and security-conscious by default.

## ANTI-PATTERNS
- Do not turn these services into stateful business backends without reconsidering the architecture.
- Do not relax host/protocol/private-network validation casually; the safety boundary is a core reason these proxies exist.
- Do not assume frontend cookie/session state is canonical; proxy-side session state matters.

## NOTES
- `mediaProxyServer.mjs` intentionally forwards only a narrow set of response headers.
- `newApiProxyCore.mjs` sets `HttpOnly` cookies and clears session state on auth failure paths.
