# AI SERVICES KNOWLEDGE BASE

## OVERVIEW
`services/ai/` is the deepest AI integration layer: API core, script parsing/generation, visual prompt/image generation, video generation, audio dubbing, shot utilities, and prompt compression.

## WHERE TO LOOK
| Task | Location | Notes |
|---|---|---|
| Shared infra / retries / API key | `apiCore.ts` | central plumbing, model resolution, progress logging |
| Script analysis and shot generation prep | `scriptService.ts` | largest hotspot in repo |
| Image / art direction generation | `visualService.ts` | visual prompt + turnaround generation |
| Video generation | `videoService.ts` | Veo/Sora-family behavior |
| Shot helpers / nine-grid | `shotService.ts` | keyframe optimization, action suggestion, storyboard-grid helpers |
| Audio dubbing | `audioService.ts` | dubbing generation options/results |
| Prompt constants | `promptConstants.ts`, `storyboardPromptTemplates.ts` | stable prompt scaffolding |
| Public entry | `index.ts` | preferred boundary for re-exports |

## CONVENTIONS
- External callers should come through `services/aiService.ts` / this folder's `index.ts` barrel, not ad hoc deep imports.
- Cross-cutting infra belongs in `apiCore.ts`; domain files should not reinvent retries, key handling, or generic completion plumbing.
- Script/video flows use callback-style progress reporting; preserve logging hooks when refactoring long-running operations.
- Prompt wording is business logic here. Treat templates and negative constraints as code, not copy.

## ANTI-PATTERNS
- Do not strip `MUST`, `DO NOT`, `FORBIDDEN`, or exact-count constraints out of templates/compression paths.
- Do not bypass retry/progress wrappers for new AI calls.
- Do not add new public exports without wiring them through `index.ts` and checking consumer import style.
- Do not mix account-center proxy concerns into this folder; that belongs to `services/newApiService.ts` + `server/`.

## NOTES
- This folder contains several of the repo's largest files; read neighboring helpers before making “small” AI changes.
- Deprecated model aliases are normalized outside this folder, but generation code still depends on stable resolved model IDs.
