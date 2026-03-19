# StageAnalysis Architecture

## Overview

`StageAnalysis/` is the dedicated workspace for studying reference videos and turning the result into reusable creation assets. It is intentionally structured as a staged funnel:

1. **Ingest** — accept a direct-access video URL or a local upload.
2. **Breakdown** — generate/edit shot structure, transcript summary, viral signals, and explainable scoring.
3. **Template** — keep candidate templates at episode scope, then explicitly save reusable records into the project-scoped viral library.
4. **Apply** — derive a brand-new episode draft for downstream Script and Director workflows.

The stage is local-first: episode analysis state is stored on `episode.analysisData`, while reusable library items live on `SeriesProject.viralTemplateLibrary`.

## Module Layout

```text
components/StageAnalysis/
├── index.tsx                # Stage shell composition
├── constants.ts             # Shared class strings / visual tokens
├── IngestPanel.tsx          # URL/upload input, validation, source persistence
├── BreakdownPanel.tsx       # Analysis run, edit/retry/resume UI
├── TemplatePanel.tsx        # Candidate save flow + project library editing
└── ApplyPanel.tsx           # New-episode draft preview and creation
```

Top-level compatibility is preserved through `components/StageAnalysis.tsx`, which must remain a thin re-export wrapper.

## Data Flow

### 1. Source ingestion
- `services/analysisIngestionService.ts`
- `services/videoStorageService.ts`
- `services/mediaFetchService.ts`

The ingest panel validates the source first:
- **Allowed**: direct media URLs (`.mp4`, `.mov`, `.webm`, `.m4v`, `.ogv`) and local uploads.
- **Rejected**: YouTube/TikTok watch/share/shorts page URLs.

Successful inputs are persisted into `episode.analysisData.source` and reused after reload.

### 2. Analysis orchestration
- `services/analysisOrchestrationService.ts`

The breakdown panel invokes one orchestration facade that returns normalized user-facing structures:
- `shots`
- `transcript`
- `viralSignals`
- `score`
- `templateCandidates`
- `rawResponse`

The raw response is stored separately from the normalized structures so later provider-specific changes do not leak directly into the UI contract.

### 3. Review and edit
- `BreakdownPanel.tsx`

User edits are saved back into `episode.analysisData` and tracked via `analysisData.review.dirtyFields`. The stage relies on the existing autosave behavior in `App.tsx`, so there is no separate manual save button for basic review edits.

### 4. Template library handoff
- `TemplatePanel.tsx`

`templateCandidates` remain episode-local until the user explicitly saves them. Once saved, they are moved into `SeriesProject.viralTemplateLibrary`, making them visible across other episodes in the same project.

### 5. Draft creation handoff
- `services/analysisDraftService.ts`
- `ApplyPanel.tsx`

Apply never overwrites the current episode. Instead it:
1. builds a derived draft structure,
2. creates a brand-new episode,
3. writes Script/Director seed data into that new episode,
4. appends provenance to `analysisData.applyHistory`,
5. navigates the user into the new draft.

## Persistence Boundaries

### Episode-scoped (`Episode.analysisData`)
- current source media
- generated shots/transcript/signals/score
- review state and dirty fields
- template candidates
- derived draft metadata
- apply history

### Project-scoped (`SeriesProject.viralTemplateLibrary`)
- reusable saved viral template records
- cross-episode template metadata edits
- source trace metadata for provenance

## Input Boundaries (Important)

### Supported in v1
- Direct-access media file URLs
- Local uploads

### Explicitly out of scope in v1
- YouTube Shorts page URLs
- TikTok share/watch page URLs
- automatic platform scraping/downloading
- trend crawling / multi-video benchmarking
- model training

If the input is a platform page URL, the stage should reject it and instruct the user to provide either a direct file URL or a local upload.

## Failure and Recovery Rules

- In-flight analysis uses the same navigation guard pattern as other generating flows.
- Interrupted analysis is converted to `failed` rather than remaining stuck on `analyzing`.
- Partial analysis output must remain available after downstream failure.
- Retry should be available from the breakdown panel when a partial or failed result exists.
- Storage fallbacks (for example, quota issues or OPFS unavailability) must be surfaced to the user as warnings, not silently swallowed.

## QA Expectations

Minimum verification for this stage:

```bash
npm run build
```

Manual/agent QA should cover:
- watch/share URL rejection
- direct URL success path
- upload success path
- editable review persistence after reload
- template save/edit visibility
- new episode draft creation
- interrupted/failed analysis retry path

Evidence for execution tasks should be stored under `.sisyphus/evidence/`.
