# Homepage Video Analysis Agent

## TL;DR

> **Quick Summary**: Add a Lovart-style homepage creative agent that works before project creation, accepts publicly accessible YouTube/TikTok page URLs, analyzes them in a multi-turn chat flow, and optionally hands off into the existing Analysis Stage for deeper structured review.
>
> **Deliverables**:
> - Homepage chat-first agent entry on `Dashboard`
> - Public YouTube/TikTok page-URL ingestion and validation boundary
> - Multi-turn pre-project analysis conversation state
> - Chat-first video analysis rendering
> - Explicit handoff into the existing Analysis Stage / project flow
>
> **Estimated Effort**: XL
> **Parallel Execution**: YES - 4 waves
> **Critical Path**: T1 → T4 → T7 → T10 → F1-F4

---

## Context

### Original Request
The user wants homepage-first video analysis, not Analysis-Stage-first UX. They expect a Lovart / Google AI Studio style creative agent chat box on the homepage where they can paste a YouTube/TikTok link and immediately get analysis results in chat.

### Interview Summary
**Key Discussions**:
- The agent must be available **before project creation**.
- Video analysis is a **mode** inside a homepage creative agent.
- Input must support **publicly accessible YouTube/TikTok page URLs**, not only direct MP4 links.
- Results should appear **first in chat**.
- Interaction must support **multi-turn dialogue**.
- The homepage agent and existing **Analysis Stage coexist**.
- Test strategy remains **build + agent QA**, no new broad test infra mandate.

**Research Findings**:
- `components/Dashboard.tsx` is the natural homepage insertion point.
- `App.tsx` currently centers project/episode/stage flow, so homepage agent should live above that flow, not inside `EpisodeWorkspace`.
- Existing editor/input patterns exist, but there is no current homepage chat agent.
- Existing Analysis Stage should become the deeper structured review destination after explicit handoff.

### Metis Review
**Identified Gaps** (addressed):
- MVP must define an exact supported URL matrix and reject unsupported page types deterministically.
- Pre-project chat state must stay separate from `ProjectContext` until explicit handoff.
- Homepage agent must not duplicate the long-term role of Analysis Stage.
- Acceptance criteria must verify multi-turn continuity, page-link rejection/acceptance, and non-destructive handoff.

---

## Work Objectives

### Core Objective
Introduce a homepage-level creative agent for video analysis that lets users paste a public YouTube/TikTok page URL and converse about the analysis before ever creating a project, while preserving the existing Analysis Stage as the structured follow-up workspace.

### Concrete Deliverables
- Homepage agent shell embedded into Dashboard
- Video-analysis mode selector and chat composer
- Public URL parsing/provider-detection boundary for YouTube/TikTok pages
- Multi-turn conversation state and chat transcript rendering
- Analysis result cards/messages for shot breakdown, script shape, viral elements, and style summary
- Explicit handoff action to create/continue into project + Analysis Stage

### Definition of Done
- [ ] Homepage shows a creative agent entry before project creation.
- [ ] User can paste a supported public YouTube/TikTok page URL.
- [ ] Agent returns analysis in chat without requiring project creation first.
- [ ] User can ask follow-up questions and retain prior analysis context.
- [ ] Unsupported/private/unavailable links fail with explicit guidance.
- [ ] User can explicitly hand off into a project/Analysis Stage flow.

### Must Have
- Homepage-first agent entry on Dashboard
- Multi-turn chat state before project creation
- Public YouTube/TikTok page URL support
- Chat-first analysis output
- Explicit, non-destructive handoff into existing Analysis Stage flow

### Must NOT Have (Guardrails)
- No auto project creation before explicit user intent
- No silent fallback that pretends platform page links are direct media links
- No playlist/channel/profile scraping in v1
- No private/login-required content support in v1
- No replacement/removal of the existing Analysis Stage

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — all verification is agent-executed.

### Test Decision
- **Infrastructure exists**: NO formal automated suite
- **Automated tests**: None required broadly; use focused build + agent QA
- **Framework**: none mandated

### QA Policy
- **Frontend/UI**: Playwright for homepage agent render, URL submission, multi-turn chat, and handoff
- **Logic/contract checks**: browser-evaluated service checks for URL support matrix and serialization where practical
- **Build baseline**: `npm run build`

---

## Execution Strategy

### Parallel Execution Waves

Wave 1 (Start Immediately — boundaries + shell):
├── T1: Homepage agent shell and placement
├── T2: Pre-project chat session model
├── T3: URL normalization/provider support matrix
└── T4: Handoff contract into project/Analysis Stage

Wave 2 (After Wave 1 — core interaction):
├── T5: Chat composer and mode switching UI (depends: T1, T2)
├── T6: Page-URL analysis ingestion/orchestration boundary (depends: T2, T3)
├── T7: Chat-first analysis result rendering (depends: T2, T5, T6)
└── T8: Failure/unsupported-state UX (depends: T3, T6, T7)

Wave 3 (After Wave 2 — continuity + handoff):
├── T9: Multi-turn context continuity and follow-up prompts (depends: T2, T7)
├── T10: Explicit create-project / continue-to-analysis handoff flow (depends: T4, T7, T9)
├── T11: Homepage-to-Analysis data transfer and prefill behavior (depends: T4, T10)
└── T12: Documentation for homepage agent architecture and scope (depends: T1-T11)

Wave 4 (After Wave 3 — QA):
├── T13: End-to-end QA for supported public YouTube/TikTok page URLs (depends: T8, T10, T11)
└── T14: End-to-end QA for unsupported/private/out-of-scope links and chat recovery (depends: T8, T9, T10)

Wave FINAL:
├── F1: Plan compliance audit
├── F2: Code quality review
├── F3: Real QA replay
└── F4: Scope fidelity check

**Dependency Matrix**
- T1: — → T5, T12
- T2: — → T5, T6, T7, T9
- T3: — → T6, T8, T13, T14
- T4: — → T10, T11
- T5: T1,T2 → T7
- T6: T2,T3 → T7, T8
- T7: T2,T5,T6 → T8, T9, T10
- T8: T3,T6,T7 → T13, T14
- T9: T2,T7 → T10, T14
- T10: T4,T7,T9 → T11, T13, T14
- T11: T4,T10 → T13
- T12: T1-T11 → F1-F4
- T13: T8,T10,T11 → F1-F4
- T14: T8,T9,T10 → F1-F4

### Agent Dispatch Summary
- **Wave 1**: T1 `visual-engineering`, T2 `unspecified-high`, T3 `deep`, T4 `deep`
- **Wave 2**: T5 `visual-engineering`, T6 `deep`, T7 `visual-engineering`, T8 `unspecified-high`
- **Wave 3**: T9 `deep`, T10 `deep`, T11 `unspecified-high`, T12 `writing`
- **Wave 4**: T13 `unspecified-high`, T14 `unspecified-high`
- **FINAL**: F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [ ] T1. Add a homepage creative-agent shell to Dashboard

  **What to do**:
  - Introduce a prominent Lovart-style agent entry on `Dashboard.tsx` before project creation.
  - Make video analysis a visible mode inside this shell rather than forcing stage navigation first.
  - Keep existing project-library actions available and non-broken.

  **Must NOT do**:
  - Do not remove existing project library functionality.
  - Do not force project creation before the user interacts with the agent.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T5, T12
  - **Blocked By**: None

  **References**:
  - `components/Dashboard.tsx` - homepage insertion point and current layout constraints.
  - `App.tsx` - route shell context showing homepage sits above project/episode workspace.

  **Acceptance Criteria**:
  - [ ] Dashboard shows a homepage agent entry before project creation.
  - [ ] Existing “新建项目” and project-list functionality still works.

  **QA Scenarios**:
  ```
  Scenario: Homepage agent is available before project creation
    Tool: Playwright
    Steps:
      1. Open the app homepage.
      2. Assert a visible creative-agent shell exists.
      3. Assert no project must be created first.
    Expected Result: Agent UI is visible and interactive from the homepage.
    Evidence: .sisyphus/evidence/task-T1-home-agent.png

  Scenario: Dashboard project actions still exist
    Tool: Playwright
    Steps:
      1. Open the homepage.
      2. Assert project list and “新建项目” button are still present.
    Expected Result: Homepage agent does not replace baseline project management actions.
    Evidence: .sisyphus/evidence/task-T1-dashboard-regression.png
  ```

- [ ] T2. Define pre-project chat session state and persistence boundary

  **What to do**:
  - Add a dedicated pre-project session model for homepage agent messages, selected mode, current source URL, and latest analysis result.
  - Keep this state separate from `ProjectContext` until explicit handoff.
  - Decide and implement minimal browser-local persistence for refresh-safe continuation if desired.

  **Must NOT do**:
  - Do not silently create `SeriesProject` / `Episode` records just to hold chat state.
  - Do not mix ephemeral chat state into existing episode analysis state before handoff.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T5, T6, T7, T9
  - **Blocked By**: None

  **References**:
  - `contexts/ProjectContext.tsx` - existing project-bound state that must remain isolated.
  - Metis review - pre-project state must not become a hidden project system.

  **Acceptance Criteria**:
  - [ ] Homepage chat state exists independently of project/episode state.
  - [ ] No project is created when the user only chats.

  **QA Scenarios**:
  ```
  Scenario: Chat session does not auto-create project records
    Tool: Playwright
    Steps:
      1. Use the homepage agent without clicking any create/continue action.
      2. Inspect project count before and after.
    Expected Result: Project count is unchanged.
    Evidence: .sisyphus/evidence/task-T2-no-auto-project.txt
  ```

- [ ] T3. Implement strict URL normalization and provider support matrix

  **What to do**:
  - Support exact public YouTube/TikTok page URL classes for MVP.
  - Normalize tracking params and classify supported vs unsupported forms.
  - Reject playlists, channels, profiles, private/auth-required, and malformed URLs with specific messages.

  **Must NOT do**:
  - Do not pretend a page URL is already a media file URL.
  - Do not broaden MVP into playlists/channels/profiles.

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T6, T8, T13, T14
  - **Blocked By**: None

  **References**:
  - `services/analysisIngestionService.ts` - existing direct-URL-only validation to evolve carefully.
  - Metis review - exact accepted/rejected URL matrix is mandatory.

  **Acceptance Criteria**:
  - [ ] Supported public YouTube/TikTok page URLs are recognized.
  - [ ] Unsupported URL classes fail with explicit guidance.

  **QA Scenarios**:
  ```
  Scenario: Supported page URL is classified correctly
    Tool: Playwright / browser-evaluated service check
    Steps:
      1. Evaluate provider classification for one public YouTube page URL.
      2. Evaluate provider classification for one public TikTok page URL.
    Expected Result: Both are accepted as supported public page URLs.
    Evidence: .sisyphus/evidence/task-T3-supported-matrix.txt

  Scenario: Unsupported URL is rejected clearly
    Tool: Playwright / browser-evaluated service check
    Steps:
      1. Submit a playlist/channel/profile URL.
    Expected Result: Deterministic rejection message identifies unsupported URL type.
    Evidence: .sisyphus/evidence/task-T3-unsupported-matrix.txt
  ```

- [ ] T4. Define explicit handoff contract into project + Analysis Stage

  **What to do**:
  - Define what chat-session data becomes project/episode analysis data when the user explicitly continues.
  - Keep handoff additive and non-destructive.
  - Specify route target and prefill shape for Analysis Stage.

  **Must NOT do**:
  - Do not auto-handoff without a user action.
  - Do not overwrite an existing episode silently.

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: T10, T11
  - **Blocked By**: None

  **References**:
  - `components/StageAnalysis/README.md` - current structured review destination.
  - Existing draft/apply logic patterns in analysis flow.

  **Acceptance Criteria**:
  - [ ] Explicit handoff payload shape is defined.
  - [ ] Handoff creates/continues only after user confirmation.

  **QA Scenarios**:
  ```
  Scenario: No handoff occurs before explicit action
    Tool: Playwright
    Steps:
      1. Run homepage analysis.
      2. Do not click continue.
    Expected Result: No project/episode handoff occurs.
    Evidence: .sisyphus/evidence/task-T4-no-handoff.txt
  ```

- [ ] T5. Build homepage chat composer and mode switching UI

  **What to do**:
  - Add a message composer, mode switch (including video analysis), and send interaction on the homepage agent.
  - Keep it chat-first, not form-first.
  - Preserve desktop-first layout quality.

  **Must NOT do**:
  - Do not collapse the homepage into a single URL field only.
  - Do not remove access to existing homepage actions.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T7
  - **Blocked By**: T1, T2

  **References**:
  - `components/Dashboard.tsx` - homepage shell.
  - Existing textarea/prompt editor patterns in `components/StagePrompts/` and `components/StageScript/`.

  **Acceptance Criteria**:
  - [ ] Homepage agent has a message composer.
  - [ ] User can switch into video-analysis mode.

  **QA Scenarios**:
  ```
  Scenario: Homepage composer accepts a video-analysis prompt
    Tool: Playwright
    Steps:
      1. Open homepage.
      2. Switch to video-analysis mode.
      3. Type a URL + short instruction into the composer.
    Expected Result: Input is accepted as a chat action, not a dead form.
    Evidence: .sisyphus/evidence/task-T5-composer.png
  ```

- [ ] T6. Build page-URL analysis ingestion and orchestration boundary

  **What to do**:
  - Add a service boundary that accepts supported public YouTube/TikTok page URLs.
  - Resolve enough public content context for analysis.
  - Return normalized chat-usable analysis data.

  **Must NOT do**:
  - Do not support private/login-required content.
  - Do not quietly downgrade unsupported page types into generic success.

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T7, T8
  - **Blocked By**: T2, T3

  **References**:
  - `services/analysisIngestionService.ts` - current ingestion patterns.
  - `services/mediaFetchService.ts` and `server/mediaProxyServer.mjs` - boundary and allowlist constraints.

  **Acceptance Criteria**:
  - [ ] Supported public page URLs return normalized analysis-ready payloads.
  - [ ] Unsupported/private page cases return structured failures.

  **QA Scenarios**:
  ```
  Scenario: Public page URL reaches analysis boundary
    Tool: Playwright / browser-evaluated service check
    Steps:
      1. Submit one supported public page URL.
    Expected Result: Boundary returns normalized analysis-ready data or a deterministic supported-path result.
    Evidence: .sisyphus/evidence/task-T6-page-boundary.txt
  ```

- [ ] T7. Render chat-first analysis output for video analysis

  **What to do**:
  - Render analysis as messages/cards inside the homepage chat.
  - Include shot breakdown, script structure, viral elements, and style summary in chat-friendly form.
  - Make the first result useful without forcing navigation.

  **Must NOT do**:
  - Do not jump to Analysis Stage immediately after result generation.
  - Do not output only raw JSON.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T8, T9, T10
  - **Blocked By**: T2, T5, T6

  **References**:
  - Existing StageAnalysis breakdown data structures.
  - User request: first see the result in chat.

  **Acceptance Criteria**:
  - [ ] Chat displays analysis result content directly.
  - [ ] Result includes more than one dimension (not only a summary paragraph).

  **QA Scenarios**:
  ```
  Scenario: Chat shows structured analysis output
    Tool: Playwright
    Steps:
      1. Submit a supported page URL.
      2. Wait for agent response.
    Expected Result: Chat contains shot/script/viral/style analysis blocks.
    Evidence: .sisyphus/evidence/task-T7-chat-analysis.png
  ```

- [ ] T8. Harden failure and unsupported-state UX for homepage agent

  **What to do**:
  - Add clear failure states for unsupported URL classes, inaccessible pages, missing public transcript/context, and timeout conditions.
  - Preserve conversation continuity when one turn fails.

  **Must NOT do**:
  - Do not collapse all failures into one generic message.
  - Do not clear the whole chat on one failed turn.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: T13, T14
  - **Blocked By**: T3, T6, T7

  **References**:
  - Metis risk analysis on unsupported/private/blocked URLs.
  - Existing T13 style explicit validation messaging.

  **Acceptance Criteria**:
  - [ ] Unsupported/private/out-of-scope links show distinct error guidance.
  - [ ] Prior chat turns remain visible after failure.

  **QA Scenarios**:
  ```
  Scenario: Unsupported page URL fails clearly in chat
    Tool: Playwright
    Steps:
      1. Submit an unsupported playlist/channel/profile URL.
    Expected Result: Chat shows specific unsupported guidance and keeps prior conversation visible.
    Evidence: .sisyphus/evidence/task-T8-unsupported-chat.png
  ```

- [ ] T9. Implement multi-turn context continuity for follow-up analysis questions

  **What to do**:
  - Preserve the latest URL, analysis result, and conversation context for follow-up prompts.
  - Support questions like “只总结前三秒 hook” or “把镜头拆得更细一点”.

  **Must NOT do**:
  - Do not reset context every turn.
  - Do not require URL re-entry for every follow-up.

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: T10, T14
  - **Blocked By**: T2, T7

  **References**:
  - User explicitly requested multi-turn dialogue.
  - T2 pre-project session model.

  **Acceptance Criteria**:
  - [ ] Follow-up prompts reuse prior URL/result context.
  - [ ] Multi-turn response changes appropriately based on the follow-up request.

  **QA Scenarios**:
  ```
  Scenario: Follow-up question refines prior analysis
    Tool: Playwright
    Steps:
      1. Run one initial analysis from a supported URL.
      2. Ask a follow-up like “只总结前三秒 hook”.
    Expected Result: Agent response references the prior analyzed video and returns a narrowed answer.
    Evidence: .sisyphus/evidence/task-T9-followup.png
  ```

- [ ] T10. Add explicit create-project / continue-to-analysis handoff action

  **What to do**:
  - Add a clear CTA from chat results into project creation / Analysis Stage continuation.
  - Keep user in chat-first mode until they explicitly choose this action.

  **Must NOT do**:
  - Do not auto-navigate on initial result.
  - Do not hide the handoff behind an ambiguous action.

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: T11, T13, T14
  - **Blocked By**: T4, T7, T9

  **References**:
  - Existing Analysis Stage as deeper workspace.
  - User requirement: homepage chat first, Analysis Stage second.

  **Acceptance Criteria**:
  - [ ] Chat includes a clear explicit handoff action.
  - [ ] No project is created until that action is used.

  **QA Scenarios**:
  ```
  Scenario: Handoff remains optional
    Tool: Playwright
    Steps:
      1. Complete homepage analysis.
      2. Do not click handoff.
    Expected Result: User remains in homepage chat with no project side effects.
    Evidence: .sisyphus/evidence/task-T10-optional-handoff.txt
  ```

- [ ] T11. Prefill Analysis Stage/project flow from homepage handoff payload

  **What to do**:
  - Transfer homepage analysis summary into the newly created project/episode Analysis Stage.
  - Prefill enough structured data to make the deeper workspace useful immediately.

  **Must NOT do**:
  - Do not drop chat-derived analysis on handoff.
  - Do not mutate unrelated existing projects.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: T13
  - **Blocked By**: T4, T10

  **References**:
  - Existing StageAnalysis data structures and apply patterns.

  **Acceptance Criteria**:
  - [ ] Handoff populates Analysis Stage with usable prefilled analysis data.
  - [ ] New project/episode opens in a coherent state.

  **QA Scenarios**:
  ```
  Scenario: Handoff opens structured review with prefilled data
    Tool: Playwright
    Steps:
      1. Run homepage analysis.
      2. Trigger handoff.
      3. Open Analysis Stage in the created project.
    Expected Result: Analysis Stage contains prefilled analysis context from chat.
    Evidence: .sisyphus/evidence/task-T11-prefill-handoff.png
  ```

- [ ] T12. Document homepage agent architecture and operator workflow

  **What to do**:
  - Add a README or equivalent architecture doc for the homepage agent.
  - Document supported URL classes, pre-project persistence boundary, chat-first flow, and Analysis Stage handoff.

  **Must NOT do**:
  - Do not document unsupported private/login-required links as supported.

  **Recommended Agent Profile**:
  - **Category**: `writing`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: T1-T11

  **References**:
  - `components/StageAnalysis/README.md` - documentation standard to mirror.

  **Acceptance Criteria**:
  - [ ] Homepage agent architecture is documented.
  - [ ] Supported/rejected URL scope is documented explicitly.
  - [ ] Handoff behavior is documented clearly.

  **QA Scenarios**:
  ```
  Scenario: Homepage agent README covers operator-critical topics
    Tool: Read verification
    Steps:
      1. Open the new documentation file.
      2. Verify architecture, scope, failure states, and handoff are documented.
    Expected Result: All critical topics are present.
    Evidence: .sisyphus/evidence/task-T12-readme-check.txt
  ```

- [ ] T13. Run end-to-end QA for supported public page URLs

  **What to do**:
  - Replay supported YouTube/TikTok public page URL flows.
  - Verify chat-first result, follow-up continuity, and optional handoff.

  **Must NOT do**:
  - Do not rely on unsupported or private URLs as fixtures.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: F1-F4
  - **Blocked By**: T8, T10, T11

  **References**:
  - T3, T6, T7, T9, T10, T11.

  **Acceptance Criteria**:
  - [ ] Supported public page URL flow works end-to-end.
  - [ ] Follow-up questions retain context.
  - [ ] Optional handoff works.

  **QA Scenarios**:
  ```
  Scenario: Supported page URL happy path
    Tool: Playwright
    Steps:
      1. Submit one supported public YouTube or TikTok page URL.
      2. Wait for chat analysis.
      3. Ask one follow-up.
      4. Trigger handoff.
    Expected Result: Full supported flow works end-to-end.
    Evidence: .sisyphus/evidence/task-T13-supported-e2e.png
  ```

- [ ] T14. Run end-to-end QA for unsupported/private/out-of-scope links and chat recovery

  **What to do**:
  - Replay failure-state flows for unsupported page classes and inaccessible links.
  - Verify the chat remains usable after failure.

  **Must NOT do**:
  - Do not approve if one failed turn collapses the whole homepage session.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 4
  - **Blocks**: F1-F4
  - **Blocked By**: T8, T9, T10

  **References**:
  - T3, T8, T9, T10.

  **Acceptance Criteria**:
  - [ ] Unsupported/private/out-of-scope links fail clearly.
  - [ ] Prior chat remains intact.
  - [ ] User can continue with a new URL or follow-up action after failure.

  **QA Scenarios**:
  ```
  Scenario: Failure does not break chat session
    Tool: Playwright
    Steps:
      1. Submit an unsupported/private/out-of-scope link.
      2. Observe failure message.
      3. Submit a supported link or continue chatting.
    Expected Result: Session recovers and remains usable after failure.
    Evidence: .sisyphus/evidence/task-T14-recovery.png
  ```

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Verify homepage-first entry exists, public page URL support matrix is implemented as specified, multi-turn chat is present, handoff is explicit, and Analysis Stage remains intact.

- [ ] F2. **Code Quality Review** — `unspecified-high`
  Run build, inspect coupling between Dashboard/homepage flow and existing project flow, and reject hidden duplication of Analysis Stage responsibilities.

- [ ] F3. **Real QA Replay** — `unspecified-high`
  Re-run homepage chat flow with supported and unsupported URLs, verify follow-up continuity, and verify explicit handoff into Analysis Stage.

- [ ] F4. **Scope Fidelity Check** — `deep`
  Confirm v1 stays limited to public single video page URLs, chat-first analysis, and explicit handoff, with no hidden playlist/channel/private scraping or premature project creation.

---

## Commit Strategy

- **1**: `feat(home): add creative agent shell`
- **2**: `feat(analysis): add pre-project chat session and URL support matrix`
- **3**: `feat(chat): render homepage analysis conversation flow`
- **4**: `feat(handoff): connect homepage agent to analysis workspace`
- **5**: `docs(agent): document homepage video analysis architecture`

---

## Success Criteria

### Verification Commands
```bash
npm run build  # Expected: build succeeds without breaking dashboard or existing Analysis Stage
```

### Final Checklist
- [ ] Homepage creative agent is visible before project creation
- [ ] Supported public YouTube/TikTok page URLs analyze in chat
- [ ] Follow-up questions retain context
- [ ] Unsupported/private/out-of-scope links fail clearly
- [ ] No project is created until explicit user action
- [ ] Analysis Stage remains available as the deeper structured workspace
