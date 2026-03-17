# PROJECT KNOWLEDGE BASE

**Generated:** 2026-03-16 Asia/Shanghai
**Commit:** bbd6c08
**Branch:** main

## OVERVIEW
BigBanana AI Director is a local-first React 19 + Vite workbench for AI motion-comic production. The core product flow is episode-stage driven: `script -> assets -> director -> export -> prompts`.

## STRUCTURE
```text
./
├── App.tsx                 # route shell, stage switching, autosave, API-key bootstrap
├── index.tsx               # React mount + BrowserRouter + Theme/Alert providers
├── types.ts                # primary domain model: project/episode/shot/asset/prompt types
├── components/             # UI domains and stage workspaces
├── services/               # business logic, storage, model registry, AI facades
├── server/                 # Node proxy services for media + new-api
├── contexts/               # ProjectContext, ThemeContext
├── hooks/                  # small focused hooks; parent docs are enough
├── docs/                   # feature notes, changelogs, checklists; not source of truth
└── scripts/check-utf8.mjs  # mandatory build guard
```

## WHERE TO LOOK
| Task | Location | Notes |
|---|---|---|
| App entry / routes | `index.tsx`, `App.tsx` | `/project/:projectId/episode/:episodeId` is the main workspace route |
| Episode-wide state | `contexts/ProjectContext.tsx` | project / series / episode / asset sync live here |
| Domain model | `types.ts`, `types/model.ts` | read before changing storage or AI payloads |
| Persistence | `services/storageService.ts` | IndexedDB v3 + migration-on-open |
| Video persistence | `services/videoStorageService.ts` | OPFS-backed refs for large video blobs |
| AI entrypoints | `services/aiService.ts`, `services/modelService.ts` | prefer facades over deep imports |
| Prompt rules / lint | `services/promptTemplateService.ts`, `services/promptLintService.ts` | many hard constraints live here |
| Render/debug logs | `services/renderLogService.ts` | callback-based logging helpers |
| UI stage internals | `components/Stage*/README.md` | stage folders already carry detailed local docs |
| Account center | `components/NewApiConsole.tsx`, `components/account-center/` | separate domain from creative workflow |
| Proxy behavior | `server/` | distinct runtime: Node `.mjs`, env-driven config |

## CONVENTIONS
- No `src/` directory. Root files (`App.tsx`, `index.tsx`, `types.ts`) are intentional.
- Stage wrapper files (`components/StageScript.tsx`, etc.) are compatibility re-exports; actual work lives in `components/Stage*/index.tsx`.
- Existing `components/Stage*/README.md` files are high-signal architecture docs; update them when changing stage-local structure.
- Import AI capabilities through `services/aiService.ts` or `services/modelService.ts` unless you are editing the AI layer itself.
- `ProjectContext` is the coordination layer for episode/project mutations; do not bypass it casually in UI work.

## ANTI-PATTERNS (THIS PROJECT)
- Do not introduce deprecated video model IDs (`veo`, `veo-r2v`, older `veo_3_1_*` aliases). `services/modelRegistry.ts` already migrates them.
- Do not put placeholder text (`TODO`, `TBD`, `未设置`, `待补充`, `待填写`) into prompts that can reach generation; `services/promptLintService.ts` flags these.
- Do not break backward-compatible stage imports; top-level Stage files must keep re-export behavior.
- Do not assume docs are canonical. Many `docs/*.md` files are feature notes/checklists; code wins when docs drift.

## UNIQUE STYLES
- Local-first architecture: IndexedDB for structured data, OPFS for heavier video payloads, localStorage for model/API key settings.
- Facade-heavy service layout: root-level service entrypoints hide deeper module splits.
- Stage modules tend to follow `index.tsx + constants.ts + utils.ts + focused child components` after refactors.
- The product is desktop-first; `App.tsx` explicitly gates mobile users behind a warning screen.

## COMMANDS
```bash
npm run dev
npm run build
npm run preview
npm run media-proxy
docker-compose up -d --build
```

## GUARDRAILS
- `npm run build` always runs `scripts/check-utf8.mjs` first.
- UTF-8 checker excludes planning files like `task_plan.md` / `notes.md` and has a legacy BOM allowlist for `components/StageAssets.tsx`.
- No formal test suite or CI pipeline exists today; build + targeted manual verification are the available baseline checks.

## NOTES
- Dev README examples mention port `3000`; Docker serves the app on `3005`.
- `docs/` is large and useful for feature history, but it is not implementation-safe by itself.
- TypeScript LSP is unavailable in this environment; use direct reads, grep, and AST search for structural discovery.
