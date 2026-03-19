## 2026-03-17T11:34:00Z Task: T1
- Existing stage routing is hard-coded across App.tsx, Sidebar.tsx, and types.ts; all three must be updated together for a new stage to compile.
- Thin wrapper stage files follow the re-export pattern used by StageScript.tsx, so StageAnalysis.tsx should remain a simple export shell.

## 2026-03-17T11:38:00Z Task: T2
- Analysis persistence fits best as a dedicated episode-level analysisData document rather than overloading scriptData or shots.
- Storage normalization must backfill nested arrays and review defaults so legacy episodes without analysis data continue loading safely.

## 2026-03-17T11:44:00Z Task: T3
- Direct URL validation should explicitly reject YouTube/TikTok watch/share URLs before any fetch attempt, while still allowing raw video file URLs.
- Upload ingestion can reuse OPFS persistence by exporting a blob-based helper from videoStorageService; browsers without OPFS can fall back to data URLs.

## 2026-03-17T11:48:00Z Task: T4
- Viral templates fit best at the project scope, with a source trace object that points back to project/episode/source/shot provenance.
- A single template payload can stay text-first (`summary`, `cues`, `tags`) while still supporting multiple abstraction layers through a typed `type` field.

## 2026-03-17T11:52:00Z Task: T5
- Draft derivation needs both the latest derived payload and a persistent applyHistory list so later UI flows can trace which draft episode was created from which analysis.
- Keeping the apply target explicit (`script`, `director`, or `script+director`) avoids future ambiguity when handoff actions diverge.

## 2026-03-17T11:58:00Z Task: T6
- The analysis stage benefits from a four-panel layout immediately, even before the later analysis logic exists; this keeps the stage navigable and future tasks scoped cleanly.
- Reusing a shared card/style constant file makes it easier to keep the new stage visually consistent with the rest of the desktop-first UI.

## 2026-03-17T12:00:00Z Task: T7
- URL/file ingestion can persist straight into episode.analysisData and rely on the existing episode autosave path; no separate save flow is needed for v1.
- Keeping the ingest panel responsible only for source persistence and validation avoids coupling it to later analysis-orchestration work.

## 2026-03-17T12:12:00Z Task: T8
- A deterministic orchestration layer is enough for v1 shell progress as long as it returns normalized shots, transcript, signals, score, template candidates, and a separate rawResponse snapshot.
- The orchestration service should validate that a ready source exists first, then generate user-facing structures independently from any later AI-provider-specific response shape.

## 2026-03-17T12:12:00Z Task: T9
- Editable review flows can piggyback on the episode autosave already present in App.tsx; marking dirtyFields inside analysisData.review is sufficient to track user edits for now.
- The score UI should render named factors and explanations directly in the panel instead of hiding them behind a separate modal.

## 2026-03-17T12:12:00Z Task: T10
- Candidate templates should live on the episode analysis record until explicitly saved, while the reusable project library lives on SeriesProject. This keeps episode drafts and project assets separate.
- Project-scoped template metadata edits persist cleanly through ProjectContext.updateProject without needing a separate library service in this slice.

## 2026-03-17T12:18:00Z Task: T11
- Draft creation can safely reuse ProjectContext.createEpisode for numbering, then immediately persist a fully populated derived episode through saveEpisode before navigation.
- Keeping the current episode’s applyHistory and derivedDraft metadata updated in-place provides a non-destructive provenance trail after the user jumps into the new draft.

## 2026-03-17T13:41:00Z Task: T12
- Recovery works best if interrupted analysis is treated as a failed-but-recoverable state while preserving partial artifacts; the breakdown panel can then surface a clear retry affordance after reload.
- Reusing the existing App-level generation guard is sufficient for navigation safety during active analysis, as long as the analysis run lasts long enough to trigger the warning path and in-flight cleanup marks stale analysis as failed on forced leave.

## 2026-03-17T14:02:00Z Task: T13
- Validation UX needs to distinguish between hard failures (watch/share page links, unsupported file formats) and soft persistence degradations (storage quota / OPFS fallback) so users know whether they can continue.
- A small simulated storage-failure switch in browser localStorage is useful for QA because real quota exhaustion is hard to trigger deterministically in agent runs.

## 2026-03-17T14:02:00Z Task: T14
- The stage README should describe episode-scoped analysis state vs project-scoped viral library state explicitly; otherwise future contributors will mix temporary candidates with reusable assets.
- Documenting unsupported YouTube/TikTok page links in the README is important because users naturally expect pasted platform URLs to work even though v1 intentionally excludes scraping/downloading.

## 2026-03-17T14:08:00Z Task: T15
- A public direct MP4 URL with permissive access is enough to exercise the full end-to-end direct-link flow without adding downloader behavior.
- Verifying the derived episode directly in IndexedDB after navigation gives stronger evidence than only asserting the route changed.

## 2026-03-17T14:08:00Z Task: T16
- Upload-path QA can be driven through browser-side File objects and service-backed persistence when full OS file-picker control is unreliable in automation.
- Reload verification is essential: it catches whether edits are really flowing through the autosave/persistence path instead of only living in component state.
