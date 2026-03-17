# SERVICES KNOWLEDGE BASE

## OVERVIEW
`services/` is the business-logic layer: persistence, migration, model registry, prompt governance, export, media fetching, asset sync, and AI facades all live here.

## STRUCTURE
```text
services/
├── ai/                     # deep AI integrations; see child AGENTS
├── adapters/               # chat/image/video adapter facade layer
├── storageService.ts       # IndexedDB schema + CRUD + import/export
├── videoStorageService.ts  # OPFS-backed video persistence
├── modelRegistry.ts        # provider/model state in localStorage
├── modelService.ts         # high-level generation facade
├── promptTemplateService.ts / promptLintService.ts
├── renderLogService.ts     # callback-based logging helpers
├── migrationService.ts     # DB/data migrations
└── newApiService.ts        # frontend client for account-center proxy endpoints
```

## WHERE TO LOOK
| Task | Location | Notes |
|---|---|---|
| IndexedDB CRUD | `storageService.ts` | source of truth for DB shape and import/export |
| DB migration | `migrationService.ts` | runs on DB open; do not forget compatibility |
| Video refs / OPFS | `videoStorageService.ts` | handles `opfs://video/...` refs and fallbacks |
| Model/provider state | `modelRegistry.ts`, `modelConfigService.ts` | persisted in localStorage |
| High-level generation | `modelService.ts`, `aiService.ts` | facade-first imports |
| Prompt constraints | `promptTemplateService.ts`, `promptLintService.ts`, `promptVersionService.ts` | hard business rules live here |
| Export pipeline | `exportService.ts`, `renderLogService.ts` | export payloads + observability |
| Asset sync/matching | `characterSyncService.ts`, `assetMatchService.ts`, `assetLibraryService.ts` | project/episode library linkage |
| Account center API client | `newApiService.ts` | pairs with `server/newApiProxyCore.mjs` |

## CONVENTIONS
- Prefer service facades (`aiService.ts`, `modelService.ts`) for consumers; use deep module imports only when editing internals.
- `storageService.ts` normalizes and persists on the way in; schema-side safety lives there, not in UI.
- Many services are local-first and browser-only (`indexedDB`, `localStorage`, OPFS); keep environment assumptions explicit.
- Migration and fallback behavior is intentional and common in this layer.

## ANTI-PATTERNS
- Do not bypass normalization/migration code when changing stored episode/project shapes.
- Do not hardcode deprecated model IDs; registry migration already handles legacy aliases.
- Do not weaken prompt hard-constraints in templates/compression/lint flows without checking downstream video/keyframe generation.
- Do not assume remote URLs are stable for video persistence; OPFS migration exists because blob/data URLs expire or bloat.

## NOTES
- Heavy `any` usage exists in this layer; preserve behavior carefully when tightening types.
- `newApiService.ts` is account-console specific even though it sits in the shared services folder.
