# Video Style Analysis Stage

## TL;DR

> **Quick Summary**: Add a new stage to ingest a direct video URL or local upload, automatically analyze one YouTube/TikTok-style video into shots/script/viral patterns, persist reusable template artifacts, and derive a brand-new episode draft for downstream Script and Director work.
>
> **Deliverables**:
> - New analysis stage in the existing stage navigation
> - Media ingestion + persisted analysis record flow
> - Structured analysis pipeline and editable review UI
> - Viral template library with multi-layer artifacts
> - “Create new episode draft” handoff into Script + Director
>
> **Estimated Effort**: XL
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: T1 → T5 → T8 → T11 → F1-F4

---

## Context

### Original Request
Add a feature to study YouTube/TikTok video styles and production workflows, visually decompose each video into shots / viral elements / script shape, build a reusable “viral library,” and feed analysis output back into creation.

### Interview Summary
**Key Discussions**:
- Product shape: this is a **new Stage**, not a side panel or passive reference library.
- Input modes: support **direct-access media URL** and **local video upload**.
- Scope: first release focuses on **single-video deep analysis**.
- Required outputs: shot segmentation, OCR / subtitle / speech-to-text extraction, script summary, viral element tagging, viral scoring, automatic template ingestion.
- Editing policy: AI outputs must remain **user-editable**.
- Creation handoff: analysis must produce a **new episode draft** for Script and Director, never overwrite the current episode.
- Platform scope: **YouTube + TikTok** only.
- Verification: **no automated test infrastructure** added in this phase.

**Research Findings**:
- `components/StageScript/README.md` already documents script / scene / shot decomposition patterns that can be reused for structured analysis output.
- `components/StageDirector/README.md` already documents shot-card / shot-workbench patterns suited to visual shot breakdown review.
- `components/StagePrompts/README.md` already documents searchable categorized library/editor patterns suitable for viral template storage.
- `App.tsx:192-240` and `components/Sidebar.tsx:8-26` show stage navigation is hard-coded and must be extended explicitly.
- `types.ts:434-457`, `contexts/ProjectContext.tsx:338-344`, and `services/storageService.ts:354-379` show episode creation / persistence are local-first and must remain backward-compatible.

### Metis + Oracle Review
**Identified Gaps** (addressed in this plan):
- Hard-coded stage system means navigation, episode stage typing, and render switching must be updated as one coordinated slice.
- Ingestion, analysis, library persistence, and episode derivation must be separated into distinct domains to avoid a monolithic stage.
- v1 must avoid scope creep into platform scraping/downloading, cross-video benchmarking, model training, and overwrite-style episode mutation.
- Acceptance criteria must verify editability, persistence, draft creation safety, and graceful failure on invalid / unreachable media.

---

## Work Objectives

### Core Objective
Introduce a maintainable new analysis stage that turns one user-provided video into editable structured knowledge and reusable creation artifacts without breaking the project’s existing stage-based local-first workflow.

### Concrete Deliverables
- New stage entry in app navigation and stage renderer
- Analysis-specific domain types and persisted storage shape
- Ingestion flow for URL + upload
- Structured analysis pipeline orchestration service
- Review UI for shots, script extraction, viral labels, and scores
- Viral template library views and save/edit flows
- New-episode derivation flow compatible with Script + Director data expectations

### Definition of Done
- [ ] A user can open the new stage from the sidebar.
- [ ] A user can submit either a direct video URL or a local upload.
- [ ] The app stores and reloads analysis records locally.
- [ ] The app visualizes shot-by-shot breakdown and script/viral annotations.
- [ ] The user can edit tags/scores/structured fields before saving.
- [ ] The user can create a brand-new episode draft from analysis output.
- [ ] Existing Script / Assets / Director / Export / Prompts flows still render normally.

### Must Have
- New stage integrated into current episode stage system
- Direct URL + local upload support
- Editable AI-derived analysis artifacts
- Viral template persistence at multiple abstraction levels
- Draft generation that creates a new episode instead of mutating the current one

### Must NOT Have (Guardrails)
- No scraping or downloading from platform pages
- No multi-video comparison / benchmarking in v1
- No model training / recommendation engine / trend crawler work
- No overwrite of current episode content during derivation
- No automated test framework setup in this plan

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — all verification is agent-executed.

### Test Decision
- **Infrastructure exists**: NO formal automated suite
- **Automated tests**: None in this phase
- **Framework**: none

### QA Policy
Every task includes agent-executed QA scenarios. Evidence saved under `.sisyphus/evidence/`.

- **Frontend/UI**: Playwright for navigation, form entry, editable review flows, and screenshot evidence
- **Media / persistence / derived data**: Bash commands plus app run/build logs and captured JSON / screenshots
- **CLI / dev runtime**: tmux only if a long-lived dev server interaction is needed

---

## Execution Strategy

### Parallel Execution Waves

Wave 1 (Start Immediately — schema, nav, boundaries):
├── T1: Stage integration surface
├── T2: Analysis domain types + storage contract
├── T3: Ingestion service boundary for URL/upload
├── T4: Viral library domain model
└── T5: Episode derivation contract

Wave 2 (After Wave 1 — core services):
├── T6: Stage shell + workspace layout (depends: T1, T2)
├── T7: Ingestion UI + persisted source handling (depends: T2, T3)
├── T8: Analysis orchestration pipeline (depends: T2, T3, T4, T5)
├── T9: Editable review panels for shots/script/viral outputs (depends: T2, T6, T8)
└── T10: Viral library management UI (depends: T4, T6, T8)

Wave 3 (After Wave 2 — handoff + polish):
├── T11: New episode draft creation flow (depends: T5, T8, T9)
├── T12: Stage-to-stage navigation and recovery states (depends: T1, T6, T7, T11)
├── T13: Error/empty/loading UX hardening (depends: T7, T8, T9, T10)
└── T14: Docs + local operator guidance for the new stage (depends: T6-T13)

Wave 4 (After Wave 3 — verification):
├── T15: End-to-end manual QA pass for URL flow (depends: T11, T12, T13)
├── T16: End-to-end manual QA pass for upload flow (depends: T11, T12, T13)

Wave FINAL (After ALL tasks — independent review):
├── F1: Plan compliance audit
├── F2: Code quality review
├── F3: Real QA replay
└── F4: Scope fidelity check

**Dependency Matrix**
- T1: — → T6, T12
- T2: — → T6, T7, T8, T9
- T3: — → T7, T8
- T4: — → T8, T10
- T5: — → T8, T11
- T6: T1,T2 → T9, T10, T12, T14
- T7: T2,T3 → T12, T13
- T8: T2,T3,T4,T5 → T9, T10, T11, T13
- T9: T2,T6,T8 → T11, T13
- T10: T4,T6,T8 → T13
- T11: T5,T8,T9 → T12, T15, T16
- T12: T1,T6,T7,T11 → T15, T16
- T13: T7,T8,T9,T10 → T15, T16
- T14: T6-T13 → F1-F4
- T15: T11,T12,T13 → F1-F4
- T16: T11,T12,T13 → F1-F4

### Agent Dispatch Summary
- **Wave 1**: T1 `quick`, T2 `unspecified-high`, T3 `unspecified-high`, T4 `quick`, T5 `deep`
- **Wave 2**: T6 `visual-engineering`, T7 `visual-engineering`, T8 `deep`, T9 `visual-engineering`, T10 `visual-engineering`
- **Wave 3**: T11 `deep`, T12 `quick`, T13 `unspecified-high`, T14 `writing`
- **Wave 4**: T15 `unspecified-high`, T16 `unspecified-high`
- **FINAL**: F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [x] T1. Integrate the new stage into the current stage system

  **What to do**:
  - Extend the hard-coded stage union, stage switcher, and sidebar navigation to include the new analysis stage.
  - Ensure stage transitions preserve the current in-flight protection behavior already used by existing stages.
  - Keep wrapper/re-export compatibility conventions intact.

  **Must NOT do**:
  - Do not break existing stage IDs or reorder existing stages in a way that corrupts persisted episodes.
  - Do not add logic to wrapper re-export files.

  **Recommended Agent Profile**:
  - **Category**: `quick` — narrow routing and navigation slice.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T6, T12
  - **Blocked By**: None

  **References**:
  - `App.tsx:192-240` - current stage union, setter, and render switch that must be extended safely.
  - `components/Sidebar.tsx:8-26` - current sidebar stage list and setter typing.
  - `AGENTS.md` - wrapper stage files are compatibility shells; real work belongs under stage directories.

  **Acceptance Criteria**:
  - [ ] New analysis stage appears in sidebar navigation.
  - [ ] Stage switch renders a stage shell instead of “未知阶段”.
  - [ ] Existing stages still render from the same routes after the change.

  **QA Scenarios**:
  ```
  Scenario: Sidebar exposes analysis stage
    Tool: Playwright
    Preconditions: App running with an existing episode open
    Steps:
      1. Open the main episode workspace.
      2. Inspect the left sidebar stage list.
      3. Click the new analysis stage item.
      4. Assert the main workspace changes to the analysis stage shell.
    Expected Result: New stage is visible and selectable; workspace content changes without crashing.
    Failure Indicators: Missing nav item, blank page, "未知阶段" text, console overlay error.
    Evidence: .sisyphus/evidence/task-T1-stage-nav.png

  Scenario: Existing stage switching remains intact
    Tool: Playwright
    Preconditions: Same workspace session
    Steps:
      1. Switch from analysis back to Script, Director, and Prompts.
      2. Assert each stage loads its expected primary heading/panel.
    Expected Result: Existing stages remain reachable and functional.
    Evidence: .sisyphus/evidence/task-T1-stage-regression.png
  ```

  **Commit**: YES
  - Message: `feat(stage): add analysis stage routing shell`

- [x] T2. Define analysis domain types and local persistence contract

  **What to do**:
  - Introduce analysis-specific types for source media, shot segments, transcript/script artifacts, viral signals, review state, and derivation payloads.
  - Extend the persisted episode/project model carefully so analysis records can be saved and reloaded in the local-first storage layer.
  - Include migration-safe defaults for older data.

  **Must NOT do**:
  - Do not bypass storage normalization or assume old episodes contain the new fields.
  - Do not overload existing `Shot` or `ScriptData` with unrelated raw analysis blobs if a separate analysis domain is cleaner.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high` — schema and persistence safety.
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T6, T7, T8, T9
  - **Blocked By**: None

  **References**:
  - `types.ts:434-457` - current `Episode` shape and stage union.
  - `services/storageService.ts:274-304` - episode load/normalize path.
  - `services/storageService.ts:354-379` - episode creation defaults.
  - `services/AGENTS.md` - storage normalization/migration guardrails.

  **Acceptance Criteria**:
  - [ ] Types exist for source media, analysis output, editable review state, and derived draft mapping.
  - [ ] Persisted episodes with no analysis data still load successfully.
  - [ ] Newly saved analysis data reloads without shape loss.

  **QA Scenarios**:
  ```
  Scenario: Analysis data persists across reload
    Tool: Playwright
    Preconditions: Dev app running with a sample episode
    Steps:
      1. Open analysis stage.
      2. Save a minimal analysis record (source, one shot, one viral tag).
      3. Reload the browser.
      4. Re-open the same episode and analysis stage.
    Expected Result: Saved analysis record reloads with the same values.
    Failure Indicators: Missing fields, reset state, JSON parse/runtime errors.
    Evidence: .sisyphus/evidence/task-T2-persistence.png

  Scenario: Legacy episode loads without analysis data
    Tool: Playwright
    Preconditions: Existing episode created before schema change
    Steps:
      1. Open a pre-existing episode.
      2. Navigate between Script and Analysis stages.
    Expected Result: App loads legacy data without migration crash or undefined-field UI breakage.
    Evidence: .sisyphus/evidence/task-T2-legacy-load.png
  ```

  **Commit**: YES
  - Message: `feat(storage): add analysis and template persistence models`

- [x] T3. Create a media ingestion service boundary for direct URL and local upload

  **What to do**:
  - Create a dedicated ingestion boundary that accepts either a direct-access URL or uploaded file and normalizes it into a single analysis-source representation.
  - Reuse existing blob/URL/OPFS patterns where practical so video persistence remains local-first.
  - Add validation for unsupported media, inaccessible URLs, and oversized/empty files.

  **Must NOT do**:
  - Do not add platform scraping/downloading logic.
  - Do not couple ingestion logic directly to UI components.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T7, T8
  - **Blocked By**: None

  **References**:
  - `services/videoStorageService.ts:89-186` - blob/data URL/object URL persistence and resolution patterns.
  - `services/storageService.ts:274-304` - save/load flow for persisted episode data.
  - `services/AGENTS.md` - remote URLs are unstable; OPFS migration exists for a reason.

  **Acceptance Criteria**:
  - [ ] Service accepts both direct URL and local file input.
  - [ ] Invalid, empty, or unreachable inputs surface structured errors.
  - [ ] Persisted source media can be reopened after reload.

  **QA Scenarios**:
  ```
  Scenario: Direct media URL normalizes successfully
    Tool: Playwright
    Preconditions: App running; accessible sample MP4 URL available
    Steps:
      1. Paste the direct MP4 URL into the analysis source form.
      2. Submit ingestion.
      3. Wait for the source preview/state badge.
    Expected Result: Source is accepted and displayed as ready for analysis.
    Failure Indicators: URL rejected incorrectly, fetch failure without user-facing message.
    Evidence: .sisyphus/evidence/task-T3-url-source.png

  Scenario: Invalid URL fails gracefully
    Tool: Playwright
    Preconditions: Same page
    Steps:
      1. Paste `https://example.com/not-a-video.txt` or an unreachable URL.
      2. Submit ingestion.
    Expected Result: Clear error state with no crash and no corrupted saved state.
    Evidence: .sisyphus/evidence/task-T3-url-error.png
  ```

  **Commit**: YES
  - Message: `feat(analysis): add media ingestion boundary`

- [x] T4. Design the viral template library model

  **What to do**:
  - Define library entities for whole-video templates, hooks, shot patterns, script patterns, and rhythm/emotion patterns.
  - Ensure a single analysis run can contribute artifacts at multiple abstraction layers.
  - Add metadata for source traceability so templates remain explainable.

  **Must NOT do**:
  - Do not treat the library as a flat blob dump with no provenance.
  - Do not add multi-video ranking logic beyond per-video extraction and save.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T8, T10
  - **Blocked By**: None

  **References**:
  - `components/StagePrompts/README.md:16-30` - modular searchable library/editor structure.
  - `components/StagePrompts/README.md:160-176` - main-state shape for category/search/edit patterns.
  - `types.ts:336-430` - existing structured creative data patterns to mirror, not flatten.

  **Acceptance Criteria**:
  - [ ] Template model supports multi-layer artifacts from one analysis run.
  - [ ] Each saved template can point back to source video and source segment context.
  - [ ] Library entities are editable without re-running the full analysis.

  **QA Scenarios**:
  ```
  Scenario: One analysis saves multiple template layers
    Tool: Playwright
    Preconditions: Completed analysis result available
    Steps:
      1. Save one hook pattern, one shot pattern, and one full-video template from the same analysis.
      2. Open the template library filters.
    Expected Result: All three artifacts appear in their categories with source trace metadata.
    Failure Indicators: Only one layer saves, category mismatch, missing provenance.
    Evidence: .sisyphus/evidence/task-T4-template-layers.png

  Scenario: Template edit does not rerun analysis
    Tool: Playwright
    Preconditions: Existing saved template
    Steps:
      1. Edit a tag/title/description in the library.
      2. Save and reload the page.
    Expected Result: Template updates persist without triggering a new analysis job.
    Evidence: .sisyphus/evidence/task-T4-template-edit.png
  ```

  **Commit**: YES
  - Message: `feat(storage): add viral template model`

- [x] T5. Define the episode-derivation contract and apply history

  **What to do**:
  - Define how structured analysis maps into downstream `rawScript`, `scriptData`, and `shots` for a newly created episode draft.
  - Record provenance/apply history so users can trace which analysis/template seeded which draft.
  - Keep creation explicit and additive.

  **Must NOT do**:
  - Do not overwrite the current episode.
  - Do not make the analysis stage the canonical source of truth for production data.

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T8, T11
  - **Blocked By**: None

  **References**:
  - `types.ts:336-457` - current `ScriptData`, `Episode`, and `Shot` expectations that derived drafts must satisfy.
  - `contexts/ProjectContext.tsx:338-344` - current episode creation entry point.
  - `services/storageService.ts:354-379` - default episode creation behavior still anchored on `stage: 'script'`.
  - Oracle review - keep Script/Director canonical and use explicit apply/create actions.

  **Acceptance Criteria**:
  - [ ] Derived draft mapping is defined for both Script seed and Director shot seed.
  - [ ] Created drafts carry provenance to the source analysis/template.
  - [ ] Current episode remains unchanged after draft creation.

  **QA Scenarios**:
  ```
  Scenario: Create new draft without mutating source episode
    Tool: Playwright
    Preconditions: Completed analysis with editable outputs saved
    Steps:
      1. Trigger “Create new episode draft”.
      2. Confirm creation.
      3. Navigate to the newly created episode and inspect Script/Director content.
      4. Return to the source episode.
    Expected Result: New episode contains derived content; source episode analysis remains unchanged.
    Failure Indicators: Source episode fields overwritten, no new episode created, missing provenance marker.
    Evidence: .sisyphus/evidence/task-T5-derive-safe.png

  Scenario: Cancel draft creation
    Tool: Playwright
    Preconditions: Same analysis screen
    Steps:
      1. Start draft creation.
      2. Cancel at the confirmation step.
    Expected Result: No new episode is created and no source data changes.
    Evidence: .sisyphus/evidence/task-T5-derive-cancel.png
  ```

  **Commit**: YES
  - Message: `feat(episode): define analysis draft derivation contract`

- [x] T6. Build the new stage shell and four-panel workspace layout

  **What to do**:
  - Create the new stage module directory and stage shell using the project’s established stage refactor pattern.
  - Structure the stage into panels aligned with Oracle guidance: Ingest, Breakdown, Template, Apply.
  - Keep child components focused and modular rather than building a new monolith.

  **Must NOT do**:
  - Do not create a single 1000+ line stage file.
  - Do not duplicate styles/patterns already established by StageScript/StageDirector/StagePrompts.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T9, T10, T12, T14
  - **Blocked By**: T1, T2

  **References**:
  - `components/StageScript/README.md:15-31` - canonical modular stage directory shape.
  - `components/StageDirector/README.md:15-31` - modular stage + workbench composition pattern.
  - `components/StagePrompts/README.md:16-30` - searchable/editor-friendly submodule split.
  - Oracle review - recommended 4-panel shape: Ingest / Breakdown / Template / Apply.

  **Acceptance Criteria**:
  - [ ] Stage folder exists with modular subcomponents and README.
  - [ ] Workspace exposes the four main panels.
  - [ ] Layout supports empty/loading/completed states without overlap or dead space.

  **QA Scenarios**:
  ```
  Scenario: Empty state workspace renders correctly
    Tool: Playwright
    Preconditions: New episode open, analysis stage selected, no analysis yet
    Steps:
      1. Inspect the full stage layout.
      2. Verify all four panel regions or tabs are visible.
    Expected Result: User sees clear entry points for ingest, breakdown, templates, and apply.
    Failure Indicators: Missing panels, layout collapse, inaccessible primary action.
    Evidence: .sisyphus/evidence/task-T6-empty-layout.png

  Scenario: Completed workspace remains navigable
    Tool: Playwright
    Preconditions: Saved analysis exists
    Steps:
      1. Open each panel/tab in the stage.
      2. Verify content swaps without full-page crash or scroll trap.
    Expected Result: Panel navigation works and remains readable.
    Evidence: .sisyphus/evidence/task-T6-panel-nav.png
  ```

  **Commit**: YES
  - Message: `feat(ui): add analysis stage workspace shell`

- [x] T7. Implement the ingestion UI and persisted source handling

  **What to do**:
  - Build the source-entry UI for direct URL paste and local file upload.
  - Persist source metadata and stable media references after successful ingestion.
  - Surface validation, progress, and retry affordances.

  **Must NOT do**:
  - Do not let users submit platform page URLs that require scraping/downloading.
  - Do not keep large transient video payloads only in volatile memory if the stage expects reload-safe resume.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T12, T13
  - **Blocked By**: T2, T3

  **References**:
  - `services/videoStorageService.ts:115-186` - OPFS persistence and object URL recovery patterns.
  - `components/StageScript/README.md:138-151` - config panel structure for left-hand primary input controls.
  - Oracle review - use direct URL + upload only; store refs, not giant base64 blobs.

  **Acceptance Criteria**:
  - [ ] User can provide a direct-access media URL.
  - [ ] User can upload a local video file.
  - [ ] Successfully accepted sources are restorable after page reload.
  - [ ] Invalid sources produce clear non-blocking errors.

  **QA Scenarios**:
  ```
  Scenario: Upload flow accepts local video
    Tool: Playwright
    Preconditions: Local sample MP4 available to the browser automation environment
    Steps:
      1. Open analysis stage ingest panel.
      2. Use the file picker to upload the sample MP4.
      3. Wait for ready state and persisted source summary.
    Expected Result: Upload succeeds and source metadata is shown.
    Failure Indicators: File input ignored, ready state never arrives, reload loses source.
    Evidence: .sisyphus/evidence/task-T7-upload-source.png

  Scenario: Unsupported file type fails gracefully
    Tool: Playwright
    Preconditions: Same page
    Steps:
      1. Attempt to upload a `.txt` or empty file.
      2. Observe validation result.
    Expected Result: User receives a specific error and analysis does not start.
    Evidence: .sisyphus/evidence/task-T7-upload-error.png
  ```

  **Commit**: YES
  - Message: `feat(ui): add analysis ingestion workflows`

- [x] T8. Implement the structured analysis orchestration pipeline

  **What to do**:
  - Add an orchestration service/facade that turns one accepted source into structured analysis JSON covering shots, transcript/script, viral signals, and template candidates.
  - Validate/repair unstable AI outputs before persistence.
  - Separate raw model outputs from user-facing normalized structures.

  **Must NOT do**:
  - Do not leak opaque raw AI JSON directly into the UI as the only saved artifact.
  - Do not bind orchestration to one specific rendering component.

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T9, T10, T11, T13
  - **Blocked By**: T2, T3, T4, T5

  **References**:
  - `services/AGENTS.md` - consume AI via facades and keep normalization in services.
  - `services/aiService.ts` / `services/modelService.ts` - existing facade-first AI integration convention.
  - Oracle review - one facade returning structured analysis JSON; validate/repair before save.
  - `components/StageDirector/README.md:78-99` - utility extraction pattern for complex prompt/build logic.

  **Acceptance Criteria**:
  - [ ] Pipeline produces normalized shot, script, viral tag, score, and template-candidate structures.
  - [ ] Malformed or partial AI responses are either repaired or surfaced as recoverable failures.
  - [ ] Saved normalized output is decoupled from raw model response shape.

  **QA Scenarios**:
  ```
  Scenario: Successful analysis populates all major sections
    Tool: Playwright
    Preconditions: Valid source media already accepted
    Steps:
      1. Trigger analysis.
      2. Wait for completion state.
      3. Inspect breakdown, tags/scores, and template candidate areas.
    Expected Result: All major structured sections are populated and editable.
    Failure Indicators: Only partial data appears, endless loading, unhandled exception.
    Evidence: .sisyphus/evidence/task-T8-analysis-success.png

  Scenario: Pipeline failure surfaces recoverably
    Tool: Playwright
    Preconditions: Configure or simulate a source expected to fail analysis
    Steps:
      1. Trigger analysis on the failing source.
      2. Observe the error and retry controls.
    Expected Result: Stage shows failed/retry state without corrupting prior saved data.
    Evidence: .sisyphus/evidence/task-T8-analysis-error.png
  ```

  **Commit**: YES
  - Message: `feat(analysis): add structured analysis orchestration`

- [x] T9. Build editable breakdown review panels for shots, transcript, tags, and scores

  **What to do**:
  - Present normalized analysis results as editable review surfaces rather than immutable AI output.
  - Support shot-by-shot browsing, transcript/script inspection, viral tag editing, and score explanation display.
  - Preserve edit state before save and after reload.

  **Must NOT do**:
  - Do not present score outputs as opaque numbers with no factor explanations.
  - Do not make editing dependent on re-running the full pipeline.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T11, T13
  - **Blocked By**: T2, T6, T8

  **References**:
  - `components/StageScript/README.md:200-220` - shot-row and structured breakdown editing patterns.
  - `components/StageDirector/README.md:143-201` - shot cards / scene context patterns for shot-by-shot review.
  - `components/StagePrompts/README.md:64-102` - reusable editor and collapsible section interaction patterns.
  - `services/qualityAssessmentV2Service.ts:163-249` - explainable weighted scoring pattern to mirror.
  - Metis review - viral scoring must not be a black box.

  **Acceptance Criteria**:
  - [ ] User can inspect and edit shot-level analysis fields.
  - [ ] User can edit transcript/script-derived text fields.
  - [ ] Score explanations name contributing factors instead of showing a number only.
  - [ ] Saved edits persist across reload.

  **QA Scenarios**:
  ```
  Scenario: Edit a shot and viral tag after analysis
    Tool: Playwright
    Preconditions: Completed saved analysis exists
    Steps:
      1. Open the breakdown panel.
      2. Select shot 1.
      3. Edit its description and add/remove one viral tag.
      4. Save and reload.
    Expected Result: Edited shot fields and viral tags persist.
    Failure Indicators: Edits disappear, save fails silently, wrong shot updated.
    Evidence: .sisyphus/evidence/task-T9-edit-breakdown.png

  Scenario: Score explanation is inspectable
    Tool: Playwright
    Preconditions: Analysis result with at least one viral score
    Steps:
      1. Open the score explanation UI for one score card.
      2. Assert at least one named factor/check and explanation text are visible.
    Expected Result: Score is explainable, not just numeric.
    Evidence: .sisyphus/evidence/task-T9-score-explain.png
  ```

  **Commit**: YES
  - Message: `feat(ui): add editable breakdown review panels`

- [x] T10. Build viral template library save, browse, and edit workflows

  **What to do**:
  - Add category-based save/browse/edit UI for extracted templates.
  - Provide source traceability, searchable categories, and lightweight metadata displays.
  - Make templates reusable without requiring the original analysis screen to remain open.

  **Must NOT do**:
  - Do not hide templates only inside the current episode.
  - Do not save templates as inaccessible raw JSON only.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T13
  - **Blocked By**: T4, T6, T8

  **References**:
  - `components/StagePrompts/README.md:103-176` - category sections, search, and editing model.
  - `contexts/ProjectContext.tsx:98-107` - project-scoped update patterns.
  - Oracle review - store reusable library at project scope while keeping per-video draft state at episode scope.

  **Acceptance Criteria**:
  - [ ] Template artifacts are browsable by category.
  - [ ] Template records show source linkage.
  - [ ] Users can edit library metadata without re-analyzing the source.
  - [ ] Templates are available across episodes in the same project.

  **QA Scenarios**:
  ```
  Scenario: Template library is reusable across episodes
    Tool: Playwright
    Preconditions: Project with two episodes; template saved from episode A
    Steps:
      1. Open episode A and save a template.
      2. Navigate to episode B in the same project.
      3. Open the analysis/template library view.
    Expected Result: Saved template is visible from episode B because library is project-scoped.
    Failure Indicators: Template only visible in source episode, missing project-wide state.
    Evidence: .sisyphus/evidence/task-T10-cross-episode-library.png

  Scenario: Template search/filter works
    Tool: Playwright
    Preconditions: Multiple templates exist across categories
    Steps:
      1. Enter a search term.
      2. Filter to one category such as hook patterns.
    Expected Result: Only matching templates remain visible.
    Evidence: .sisyphus/evidence/task-T10-template-filter.png
  ```

  **Commit**: YES
  - Message: `feat(ui): add viral template library workflows`

- [x] T11. Implement explicit “create new episode draft” handoff into Script and Director

  **What to do**:
  - Add explicit Apply actions that generate a brand-new episode draft seeded for downstream Script and Director use.
  - Show users what will be applied before creation.
  - Route the created draft into the existing canonical episode flow starting from Script stage.

  **Must NOT do**:
  - Do not auto-apply analysis results with no user confirmation.
  - Do not create a draft with empty `scriptData` and empty `shots` while claiming success.

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: T12, T15, T16
  - **Blocked By**: T5, T8, T9

  **References**:
  - `contexts/ProjectContext.tsx:338-344` - existing create-episode path.
  - `services/storageService.ts:354-379` - new episodes default to script stage.
  - `types.ts:434-457` - target episode fields that must be populated.
  - Oracle + Metis review - draft import must be explicit, previewable, and non-destructive.

  **Acceptance Criteria**:
  - [ ] User can preview and confirm draft creation.
  - [ ] Created episode opens with seeded Script/Director-compatible data.
  - [ ] Source analysis retains apply history/provenance.

  **QA Scenarios**:
  ```
  Scenario: Draft creation seeds Script and Director structures
    Tool: Playwright
    Preconditions: Saved analysis with transcript/shots/tags exists
    Steps:
      1. Open Apply panel.
      2. Preview draft creation.
      3. Confirm creation.
      4. Open the created episode in Script and Director stages.
    Expected Result: Script stage shows seeded script content and Director shows non-empty shot list.
    Failure Indicators: Draft opens empty, director has zero shots, source episode altered.
    Evidence: .sisyphus/evidence/task-T11-draft-created.png

  Scenario: Apply history is recorded
    Tool: Playwright
    Preconditions: Draft already created once
    Steps:
      1. Return to the source episode analysis stage.
      2. Inspect apply history/provenance area.
    Expected Result: User can see that a derived draft was created from this analysis.
    Evidence: .sisyphus/evidence/task-T11-apply-history.png
  ```

  **Commit**: YES
  - Message: `feat(episode): create drafts from analysis stage`

- [x] T12. Harden stage navigation, resume, and recovery behavior

  **What to do**:
  - Ensure the new stage follows the app’s existing guarded navigation behavior during in-flight generation/analysis.
  - Support restoring the stage after reload with saved source and saved artifacts.
  - Add clear resume/retry affordances for interrupted work.

  **Must NOT do**:
  - Do not leave the stage in an unrecoverable “loading forever” state.
  - Do not lose already-completed artifacts when one step fails.

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: T15, T16
  - **Blocked By**: T1, T6, T7, T11

  **References**:
  - `App.tsx:192-223` - existing guarded stage-switch and exit behavior during generation.
  - Oracle review - mirror existing stuck-generating to failed/retry recovery behavior.
  - Metis review - partial pipeline success must preserve completed artifacts.

  **Acceptance Criteria**:
  - [ ] Navigation lock/recovery behavior matches existing stage expectations during active analysis.
  - [ ] Reload restores last saved source/artifacts.
  - [ ] Partial failures preserve successful prior outputs and expose retry.

  **QA Scenarios**:
  ```
  Scenario: Leaving during active analysis is guarded
    Tool: Playwright
    Preconditions: Analysis currently running
    Steps:
      1. Attempt to switch to another stage.
      2. Observe warning dialog.
      3. Cancel once, then confirm once.
    Expected Result: User gets the same leave/continue pattern as existing generating stages.
    Failure Indicators: Silent loss of work, no warning, app crash.
    Evidence: .sisyphus/evidence/task-T12-nav-guard.png

  Scenario: Partial results survive one-step failure
    Tool: Playwright
    Preconditions: A controlled run where one sub-step fails after others succeed
    Steps:
      1. Run analysis until segmentation/transcript succeed.
      2. Force or simulate scoring/template failure.
      3. Reload the page.
    Expected Result: Successful artifacts remain visible and failed step shows retry path.
    Evidence: .sisyphus/evidence/task-T12-partial-recovery.png
  ```

  **Commit**: YES
  - Message: `feat(stage): add analysis recovery and resume behavior`

- [x] T13. Harden validation, failure handling, and quota/performance UX

  **What to do**:
  - Add explicit validation and user feedback for watch-page URLs, proxy-disallowed hosts, unsupported files/codecs, empty/no-audio media, and storage failures.
  - Surface clear loading, empty, retry, and storage-limit states.
  - Keep partial successes reusable even when later steps fail.

  **Must NOT do**:
  - Do not silently accept watch/share URLs that are out of scope.
  - Do not collapse all failures into one generic “analysis failed” message.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: T15, T16
  - **Blocked By**: T7, T8, T9, T10

  **References**:
  - `services/mediaFetchService.ts:14-31` - browser/proxy media fetch boundary.
  - `server/mediaProxyServer.mjs:11-19,85-109` - allowlist restrictions and proxy safety concerns.
  - `services/videoStorageService.ts:141-168` - stable local persistence path for heavy video.
  - Metis review - required failure paths: invalid watch-page URL, disallowed host, unsupported format, storage failure, partial pipeline failure.

  **Acceptance Criteria**:
  - [ ] Watch/share page URLs are rejected with specific guidance.
  - [ ] Unsupported hosts/formats show precise actionable errors.
  - [ ] Storage quota/persistence failure is surfaced clearly.
  - [ ] Successful prior artifacts remain available after downstream failure.

  **QA Scenarios**:
  ```
  Scenario: Watch-page URL is rejected correctly
    Tool: Playwright
    Preconditions: Analysis ingest form open
    Steps:
      1. Paste a normal YouTube or TikTok watch/share page URL.
      2. Submit.
    Expected Result: App rejects the input and explains that only direct-access media URLs or uploads are supported.
    Failure Indicators: Input accepted incorrectly, vague error, analysis starts on out-of-scope URL.
    Evidence: .sisyphus/evidence/task-T13-watch-url-reject.png

  Scenario: Storage failure is surfaced without data corruption
    Tool: Playwright
    Preconditions: Environment configured to simulate persistence/storage failure
    Steps:
      1. Save or persist a large source/artifact.
      2. Observe failure state.
    Expected Result: User sees a specific persistence/storage message and existing saved data remains intact.
    Evidence: .sisyphus/evidence/task-T13-storage-failure.png
  ```

  **Commit**: YES
  - Message: `feat(stage): harden analysis validation and failure UX`

- [x] T14. Document the new stage architecture and operator workflow

  **What to do**:
  - Add a stage-local README describing module layout, data flow, panel responsibilities, and handoff into Script/Director.
  - Document source-input boundaries, persistence expectations, and known v1 exclusions.
  - Record QA commands / evidence expectations for future execution agents.

  **Must NOT do**:
  - Do not leave the stage undocumented when existing stage folders already use README as architecture source of truth.
  - Do not document unsupported watch-page ingestion as if it were available.

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: T6, T7, T8, T9, T10, T11, T12, T13

  **References**:
  - `components/StageScript/README.md`, `components/StageDirector/README.md`, `components/StagePrompts/README.md` - stage-local documentation standard.
  - `AGENTS.md` - stage-local README files are the best source for intended decomposition.

  **Acceptance Criteria**:
  - [ ] Stage README documents structure, responsibilities, and data flow.
  - [ ] README lists in-scope vs out-of-scope ingestion behavior.
  - [ ] README includes downstream handoff explanation and QA expectations.

  **QA Scenarios**:
  ```
  Scenario: Stage README covers operator-critical topics
    Tool: Bash (read/grep verification by executor)
    Preconditions: Documentation task completed
    Steps:
      1. Open the new stage README.
      2. Verify sections for architecture, input boundaries, persistence, apply flow, and exclusions.
    Expected Result: All operator-critical topics are documented.
    Failure Indicators: Missing handoff flow, missing exclusions, missing module overview.
    Evidence: .sisyphus/evidence/task-T14-readme-check.txt

  Scenario: README matches actual UI panel shape
    Tool: Playwright + file read
    Preconditions: New stage implemented
    Steps:
      1. Compare README panel description against running UI.
      2. Assert panel names/roles align.
    Expected Result: Documentation reflects the shipped stage accurately.
    Evidence: .sisyphus/evidence/task-T14-readme-ui-match.png
  ```

  **Commit**: YES
  - Message: `docs(stage): document analysis stage architecture and flow`

- [x] T15. Execute end-to-end QA for the direct-URL flow

  **What to do**:
  - Run the full happy-path and failure-path QA for direct-access media URLs.
  - Verify ingestion, analysis, editability, template save, and draft creation.
  - Capture evidence for final verification wave.

  **Must NOT do**:
  - Do not rely solely on live third-party watch pages.
  - Do not mark done without evidence for both happy and failure cases.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: F1-F4
  - **Blocked By**: T11, T12, T13

  **References**:
  - All prior URL-related tasks, especially T3, T7, T8, T11, T13.
  - Metis review - verify direct media URL succeeds while watch/share URLs fail safely.

  **Acceptance Criteria**:
  - [ ] Direct media URL flow works end-to-end.
  - [ ] User edits persist before template save and draft creation.
  - [ ] Watch/share URL rejection is confirmed as a negative path.

  **QA Scenarios**:
  ```
  Scenario: Full direct-URL happy path
    Tool: Playwright
    Preconditions: Accessible direct MP4 URL fixture available
    Steps:
      1. Submit direct MP4 URL.
      2. Run analysis.
      3. Edit one shot field and one viral tag.
      4. Save one template.
      5. Create a new episode draft.
    Expected Result: Entire direct-URL workflow completes successfully.
    Failure Indicators: Any stage fails, edits do not persist, template missing, draft empty.
    Evidence: .sisyphus/evidence/task-T15-url-happy-path.png

  Scenario: Direct-URL negative path
    Tool: Playwright
    Preconditions: Same environment
    Steps:
      1. Submit a watch/share page URL.
      2. Assert rejection message.
    Expected Result: Out-of-scope URL is rejected clearly and safely.
    Evidence: .sisyphus/evidence/task-T15-url-negative.png
  ```

  **Commit**: NO

- [x] T16. Execute end-to-end QA for the upload flow

  **What to do**:
  - Run the full happy-path and failure-path QA for local upload.
  - Verify persistence across reload and the same downstream apply flow.
  - Capture evidence for final verification wave.

  **Must NOT do**:
  - Do not skip reload/persistence checks.
  - Do not claim upload success without verifying the created draft content.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: F1-F4
  - **Blocked By**: T11, T12, T13

  **References**:
  - All prior upload-related tasks, especially T3, T7, T8, T11, T12, T13.
  - `services/videoStorageService.ts:115-186` - persisted upload/media-ref expectations.

  **Acceptance Criteria**:
  - [ ] Upload flow works end-to-end.
  - [ ] Source and edits survive reload.
  - [ ] New episode draft contains seeded Script/Director data.

  **QA Scenarios**:
  ```
  Scenario: Full upload happy path with reload
    Tool: Playwright
    Preconditions: Local sample MP4 fixture available
    Steps:
      1. Upload the local video file.
      2. Run analysis.
      3. Save one edit in transcript or tag data.
      4. Reload the page.
      5. Confirm source + edits persist.
      6. Create a new episode draft.
    Expected Result: Upload flow persists across reload and produces a usable draft.
    Failure Indicators: Lost source, lost edits, failed draft creation, empty downstream content.
    Evidence: .sisyphus/evidence/task-T16-upload-happy-path.png

  Scenario: Unsupported upload negative path
    Tool: Playwright
    Preconditions: Same page
    Steps:
      1. Upload an unsupported file type or empty file.
      2. Observe validation and blocked analysis state.
    Expected Result: Invalid file is rejected with a clear error and no corrupted state.
    Evidence: .sisyphus/evidence/task-T16-upload-negative.png
  ```

  **Commit**: NO

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Verify the delivered implementation against this plan’s must-have / must-not-have list, confirm evidence files exist, and reject any missing stage integration, derivation safety issues, or out-of-scope scope creep.

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run build/lint-equivalent project checks available in repo, inspect changed files for dead code / unsafe casts / placeholder logic / accidental coupling, and reject if the new stage weakens existing stage flows.

- [ ] F3. **Real QA Replay** — `unspecified-high`
  Re-run all task QA scenarios end-to-end for both URL and upload paths, including edit-before-save and new-episode derivation behavior, with evidence under `.sisyphus/evidence/final-qa/`.

- [ ] F4. **Scope Fidelity Check** — `deep`
  Confirm implementation stays within single-video analysis, no scraping/downloading, no overwrite of current episode, and no hidden multi-video benchmarking work.

---

## Commit Strategy

- **1**: `feat(stage): add analysis stage routing shell`
- **2**: `feat(storage): add analysis and template persistence models`
- **3**: `feat(analysis): add media ingestion and orchestration services`
- **4**: `feat(ui): add analysis review and library workflows`
- **5**: `feat(episode): derive new draft from analysis output`
- **6**: `docs(stage): document analysis stage architecture and QA flow`

---

## Success Criteria

### Verification Commands
```bash
npm run build  # Expected: production build succeeds without breaking existing stages
```

### Final Checklist
- [ ] All must-have capabilities present
- [ ] All must-not-have items absent
- [ ] URL and upload flows both work
- [ ] Analysis artifacts persist and reload correctly
- [ ] Edits to AI outputs persist correctly
- [ ] New episode draft creation is additive and safe
- [ ] Existing stages still function normally
