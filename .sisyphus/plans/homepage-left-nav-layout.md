# Homepage Left-Nav Layout Plan

## TL;DR

> **Quick Summary**: Replace the current `/` homepage presentation with a new two-column homepage: left-side vertical navigation and a right-side content area that keeps the current project-library experience intact.
>
> **Deliverables**:
> - A redesigned root homepage layout for `Dashboard`
> - Left vertical navigation that preserves existing destinations/actions
> - Right content area containing the current project-library content and preserved homepage modules
>
> **Estimated Effort**: Medium
> **Parallel Execution**: YES — 2 implementation waves + final verification wave
> **Critical Path**: Task 1 → Task 3 → Task 4 → Task 7 → Task 8 → Final Verification

---

## Context

### Original Request
Create a new homepage that replaces the current default homepage, changes the navigation from stacked/top layout to a left-side vertical navigation, and places the current project library in the right content area. Only layout should change; behavior should remain the same. Minor navigation ordering/grouping adjustments are acceptable.

### Interview Summary
**Key Discussions**:
- The user wants a **new homepage**, not a small navbar tweak.
- The new homepage should **replace the current default landing page**.
- The layout should be **left vertical navigation + right content area**.
- The **current project library** must remain present inside the homepage content area.
- Functional behavior, copy, routes, and interactions should remain unchanged.
- Minor navigation grouping/order tweaks are allowed if needed to fit the new layout.
- No automated test infrastructure should be introduced as part of this work.

**Research Findings**:
- `App.tsx:354-380` maps `/` directly to `Dashboard`.
- `components/Dashboard.tsx:23-647` is the current landing page and project-library surface.
- `components/Sidebar.tsx:19-155` provides an existing left-sidebar visual/navigation pattern that can be referenced, but it is currently scoped to episode workspace.
- `package.json:6-27` contains build/dev scripts only; no test script or testing framework is currently configured.

### Metis Review
**Identified Gaps** (addressed during planning):
- Preserve all existing homepage entry actions (`new project`, `account`, `help`, `theme`, `settings`) even if their visual position changes.
- Treat this as a **Dashboard-scoped homepage refactor**, not a full application-shell rewrite, unless executor discovers a hard blocker.
- Preserve modal-based flows already owned by `Dashboard` (settings, asset library, QR modal, asset-to-project picker, import input).
- Preserve current route targets and project-opening behavior from the root page.

---

## Work Objectives

### Core Objective
Deliver a new default homepage layout for the root route that uses a left vertical navigation and a right content pane while preserving the current project library and all existing homepage behaviors.

### Concrete Deliverables
- Updated root homepage presentation for `components/Dashboard.tsx`
- Vertical homepage navigation structure aligned to existing actions/destinations
- Right-side content pane containing the current project grid and retained homepage sections
- Preserved modal flows and route behavior from the current homepage

### Definition of Done
- [ ] Visiting `/` renders a homepage with a persistent left vertical navigation and right content area.
- [ ] Existing homepage actions still work and navigate/open the same destinations as before.
- [ ] Project creation, project opening, deletion, settings, asset-library modal, and account entry behave the same as before.
- [ ] `npm run build` completes successfully.

### Must Have
- Layout-only homepage refactor centered on the root homepage
- Current project library visible inside the right content area
- Existing homepage actions preserved
- Existing route targets preserved

### Must NOT Have (Guardrails)
- No new business features
- No route target changes
- No copy/text rewrites unless strictly required by layout extraction
- No full-app shared shell rewrite unless an unavoidable integration blocker is proven
- No automated test framework setup in this scope

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — verification must be agent-executed.

### Test Decision
- **Infrastructure exists**: NO
- **Automated tests**: None for this task
- **Framework**: none
- **Baseline verification**: `npm run build` + browser QA scenarios executed by an agent

### QA Policy
Every task must include agent-executed QA scenarios with concrete selectors/actions and captured evidence under `.sisyphus/evidence/`.

- **Frontend/UI**: Use Playwright for layout, interaction, modal, and navigation checks
- **Build**: Use Bash for `npm run build`
- **Evidence**: screenshots and terminal output saved per task

---

## Execution Strategy

### Parallel Execution Waves

Wave 1 (Start Immediately — homepage decomposition and layout foundation):
├── Task 1: Homepage behavior inventory and non-regression contract [quick]
├── Task 2: Left navigation structure for homepage actions [visual-engineering]
├── Task 3: Two-column homepage shell and responsive frame [visual-engineering]
├── Task 4: Project-library panel migration into right content area [deep]
└── Task 5: Utility action relocation (help/theme/settings/account/new project) [quick]

Wave 2 (After Wave 1 — retained modules and integration):
├── Task 6: DirectorHub/banner and retained homepage secondary sections [visual-engineering]
├── Task 7: Modal/overlay continuity for existing Dashboard flows [unspecified-high]
└── Task 8: Root-route regression pass and responsive polish [deep]

Wave FINAL (After ALL implementation tasks — 4 parallel reviews, then user approval):
├── Task F1: Plan compliance audit (oracle)
├── Task F2: Code quality review (unspecified-high)
├── Task F3: Real manual QA (unspecified-high)
└── Task F4: Scope fidelity check (deep)

Critical Path: 1 → 3 → 4 → 7 → 8 → F1-F4
Parallel Speedup: ~45% faster than fully sequential execution
Max Concurrent: 5 in Wave 1

### Dependency Matrix

- **1**: Blocked By — None | Blocks — 2, 3, 4, 5
- **2**: Blocked By — 1 | Blocks — 8
- **3**: Blocked By — 1 | Blocks — 4, 5, 6, 8
- **4**: Blocked By — 1, 3 | Blocks — 7, 8
- **5**: Blocked By — 1, 3 | Blocks — 7, 8
- **6**: Blocked By — 3 | Blocks — 8
- **7**: Blocked By — 4, 5 | Blocks — 8
- **8**: Blocked By — 2, 3, 4, 5, 6, 7 | Blocks — F1, F2, F3, F4
- **F1**: Blocked By — 8 | Blocks — completion approval
- **F2**: Blocked By — 8 | Blocks — completion approval
- **F3**: Blocked By — 8 | Blocks — completion approval
- **F4**: Blocked By — 8 | Blocks — completion approval

### Agent Dispatch Summary

- **Wave 1**: 5 agents — T1 `quick`, T2 `visual-engineering`, T3 `visual-engineering`, T4 `deep`, T5 `quick`
- **Wave 2**: 3 agents — T6 `visual-engineering`, T7 `unspecified-high`, T8 `deep`
- **Final**: 4 agents — F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [ ] 1. Homepage behavior inventory and preservation contract

  **What to do**:
  - Enumerate every root-homepage action currently exposed by `Dashboard` and decide where it lives in the new two-column layout.
  - Preserve current action handlers and route targets for project opening, project creation, account entry, onboarding/help, settings, theme toggle, QR modal, asset library modal, and import/export triggers.
  - Produce an implementation checklist inside the task worklog before moving UI blocks.

  **Must NOT do**:
  - Do not change route destinations.
  - Do not remove any existing Dashboard capability.
  - Do not turn this into a new information architecture project.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: This is a focused contract-mapping task over a small number of files.
  - **Skills**: `[]`
    - No workspace skills are available; rely on direct file inspection.
  - **Skills Evaluated but Omitted**:
    - None available in this workspace.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 1 foundation gate
  - **Blocks**: 2, 3, 4, 5
  - **Blocked By**: None

  **References**:
  - `App.tsx:355-363` - Root route wiring and current `Dashboard` entry behavior.
  - `components/Dashboard.tsx:74-82` - New-project creation flow and redirect target.
  - `components/Dashboard.tsx:176-240` - Current header actions that must be preserved in the new layout.
  - `components/Dashboard.tsx:243-335` - Current homepage content blocks and project-library presentation.
  - `components/Dashboard.tsx:369-447` - Settings modal entry points and secondary actions.
  - `components/Dashboard.tsx:454-633` - Asset-library modal and asset-to-project picker flows.

  **Acceptance Criteria**:
  - [ ] A one-to-one preservation map exists for all current homepage actions before layout extraction begins.
  - [ ] No action currently reachable from the root homepage is left unassigned in the new layout plan.

  **QA Scenarios**:
  ```
  Scenario: Baseline homepage action inventory
    Tool: Playwright
    Preconditions: Dev server running with current main branch state before refactor
    Steps:
      1. Open `/`.
      2. Assert `h1:has-text("项目库")` is visible.
      3. Assert buttons/selectors exist: `button:has-text("新建项目")`, `button[title="打开账号中心"]`, `button:has-text("系统设置")`, `button:has-text("帮助")` (if rendered), `button[title*="主题"]` or theme toggle text.
      4. Capture screenshot of the full homepage.
    Expected Result: All baseline actions are discoverable and documented for preservation.
    Failure Indicators: Any currently exposed root-homepage action is missing from the inventory.
    Evidence: .sisyphus/evidence/task-1-baseline-homepage.png

  Scenario: Baseline modal trigger verification
    Tool: Playwright
    Preconditions: Same baseline state
    Steps:
      1. Click `button:has-text("系统设置")`.
      2. Assert modal heading `text=系统设置` is visible.
      3. Close the modal.
      4. Click `button:has-text("交流群")`.
      5. Assert `text=加入交流群` is visible.
    Expected Result: Existing modal triggers work before refactor and are recorded as required preserved flows.
    Failure Indicators: Modal cannot be opened/closed or trigger is not documented.
    Evidence: .sisyphus/evidence/task-1-baseline-modals.png
  ```

  **Commit**: NO

- [ ] 2. Left navigation structure for homepage actions

  **What to do**:
  - Design and implement the homepage-specific left vertical navigation structure, likely as a dedicated homepage nav component or a narrowly scoped extraction from `Dashboard`.
  - Re-home existing high-level homepage actions into the left rail without changing what they do.
  - Allow only minor grouping/order tweaks required by the vertical format.

  **Must NOT do**:
  - Do not reuse episode-stage navigation semantics from `Sidebar.tsx` if they distort homepage behavior.
  - Do not add new destinations or remove existing ones.
  - Do not couple homepage navigation to episode workspace state.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: This is a layout/navigation UI composition task.
  - **Skills**: `[]`
    - No workspace skills are available; use repo patterns directly.
  - **Skills Evaluated but Omitted**:
    - None available in this workspace.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with 3, 4, 5 after Task 1 contract)
  - **Blocks**: 8
  - **Blocked By**: 1

  **References**:
  - `components/Dashboard.tsx:179-240` - Current homepage action cluster to re-home into the left rail.
  - `components/Sidebar.tsx:21-31` - Existing left-sidebar sizing and rail structure reference.
  - `components/Sidebar.tsx:78-99` - Existing nav-item spacing/active-state pattern reference.
  - `components/Sidebar.tsx:101-154` - Existing lower-rail utility action pattern reference.

  **Acceptance Criteria**:
  - [ ] The homepage renders a visible left vertical navigation rail on desktop-width viewports.
  - [ ] All preserved homepage actions exist in the rail or its utility area with unchanged behavior.
  - [ ] Minor order/grouping changes are documented and remain within user-approved scope.

  **QA Scenarios**:
  ```
  Scenario: Desktop left rail renders with preserved actions
    Tool: Playwright
    Preconditions: Refactor branch running locally at 1440x960 viewport
    Steps:
      1. Open `/`.
      2. Assert `aside` is visible on the left edge of the viewport.
      3. Inside `aside`, assert presence of controls matching preserved actions, including `button:has-text("新建项目")` or its moved equivalent, `button:has-text("系统设置")`, and `a[href="/account"]` or equivalent account trigger.
      4. Capture screenshot focused on the left rail.
    Expected Result: A left-side navigation rail exists and exposes the preserved homepage action set.
    Failure Indicators: Actions remain only in a top header, rail is not left-aligned, or key actions are missing.
    Evidence: .sisyphus/evidence/task-2-left-rail.png

  Scenario: Minor grouping change does not alter behavior
    Tool: Playwright
    Preconditions: Refactor branch running
    Steps:
      1. Open `/`.
      2. Click the relocated settings trigger from the left rail.
      3. Assert `text=系统设置` appears.
      4. Close modal and click the relocated account trigger.
      5. Assert URL becomes `/account`.
    Expected Result: Grouping/order may differ, but each action still performs the original behavior.
    Failure Indicators: Action opens wrong destination, no-op click, or missing modal.
    Evidence: .sisyphus/evidence/task-2-rail-behavior.png
  ```

  **Commit**: YES
  - Message: `refactor(home): introduce homepage left navigation`
  - Files: `components/Dashboard.tsx` and/or extracted homepage-nav component files
  - Pre-commit: visual smoke check at desktop width

- [ ] 3. Two-column homepage shell and responsive frame

  **What to do**:
  - Build the new desktop-first shell for the root homepage with a fixed/anchored left rail and a right content pane.
  - Ensure the content pane supports current Dashboard density without clipping, overlap, or modal layering regressions.
  - Keep responsive fallback behavior sensible for narrower widths without redesigning mobile product policy.

  **Must NOT do**:
  - Do not alter app-wide routing structure beyond what the homepage shell needs.
  - Do not rewrite non-homepage pages into the same shell.
  - Do not break the existing desktop-first gating behavior owned by `App.tsx`.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: This is layout architecture and responsive composition work.
  - **Skills**: `[]`
    - No workspace skills are available.
  - **Skills Evaluated but Omitted**:
    - None available in this workspace.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with 2, 4, 5 after Task 1 contract)
  - **Blocks**: 4, 5, 6, 8
  - **Blocked By**: 1

  **References**:
  - `components/Dashboard.tsx:176-240` - Current top-heavy layout that must be decomposed.
  - `components/Dashboard.tsx:243-335` - Main homepage content that must fit inside the new content pane.
  - `components/Sidebar.tsx:31-32` - Sidebar width and fixed positioning reference.
  - `App.tsx:388-402` - Keep broader app/mobile behavior outside homepage refactor scope.

  **Acceptance Criteria**:
  - [ ] Desktop homepage uses a clear two-column layout with left rail and right content area.
  - [ ] Right content area scrolls/expands cleanly for existing homepage content.
  - [ ] No overlaying/top-header remnants break the new composition.

  **QA Scenarios**:
  ```
  Scenario: Two-column shell renders at desktop width
    Tool: Playwright
    Preconditions: Refactor branch running at 1440x960
    Steps:
      1. Open `/`.
      2. Assert left navigation `aside` occupies the left column.
      3. Assert a distinct main content container exists to the right of the rail and contains `text=项目库`.
      4. Capture full-page screenshot.
    Expected Result: The page presents as left rail + right content, not stacked header-over-content.
    Failure Indicators: Navigation still sits above content, or content overlaps rail.
    Evidence: .sisyphus/evidence/task-3-two-column-shell.png

  Scenario: Narrow desktop width does not collapse into broken overlap
    Tool: Playwright
    Preconditions: Refactor branch running at 1024x768
    Steps:
      1. Open `/` at 1024x768.
      2. Assert no horizontal scrollbar appears on `body` unless intentionally required for preserved dense cards.
      3. Assert primary actions remain reachable and visible.
    Expected Result: Layout remains usable and visually coherent at common laptop width.
    Failure Indicators: Rail overlaps content, clipped buttons, or unusable scroll state.
    Evidence: .sisyphus/evidence/task-3-narrow-desktop.png
  ```

  **Commit**: YES
  - Message: `refactor(home): add two-column homepage shell`
  - Files: `components/Dashboard.tsx` and any extracted layout component files
  - Pre-commit: desktop viewport screenshot comparison

---

- [ ] 4. Project-library panel migration into right content area

  **What to do**:
  - Move the current project grid/create-card experience into the new right content pane without changing underlying project actions.
  - Preserve project open, create, delete-confirm, metadata display, and loading states.
  - Keep the root homepage clearly centered around the project library after layout rework.

  **Must NOT do**:
  - Do not change `handleCreate`, project card click behavior, or delete flow semantics.
  - Do not alter project-card copy or counts beyond layout-driven wrapping.
  - Do not remove loading/empty-state handling.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: This task preserves behavior while reshaping the densest homepage module.
  - **Skills**: `[]`
    - No workspace skills are available.
  - **Skills Evaluated but Omitted**:
    - None available in this workspace.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with 2, 3, 5 after Task 1 contract)
  - **Blocks**: 7, 8
  - **Blocked By**: 1, 3

  **References**:
  - `components/Dashboard.tsx:74-82` - Project creation flow that must remain unchanged.
  - `components/Dashboard.tsx:84-107` - Delete-confirm state and delete behavior.
  - `components/Dashboard.tsx:263-335` - Current loading state, create card, and project card grid.
  - `App.tsx:356-360` - Root-page project opening behavior and route fallback logic.

  **Acceptance Criteria**:
  - [ ] Right content pane contains the create card and existing project grid/list content.
  - [ ] Clicking create project still creates and routes as before.
  - [ ] Clicking a project still opens the same project route as before.
  - [ ] Delete confirmation still appears and works correctly.

  **QA Scenarios**:
  ```
  Scenario: Create card still works inside right content pane
    Tool: Playwright
    Preconditions: Refactor branch running with seeded local data optional
    Steps:
      1. Open `/`.
      2. In the right content area, click the create-project card or `button:has-text("新建项目")` equivalent.
      3. Wait for URL to match `/project/`.
      4. Capture screenshot of the destination page.
    Expected Result: Project creation and redirect behavior remain unchanged.
    Failure Indicators: No navigation, wrong route, or broken create action.
    Evidence: .sisyphus/evidence/task-4-create-flow.png

  Scenario: Project delete confirmation still blocks accidental delete
    Tool: Playwright
    Preconditions: At least one visible project card exists on `/`
    Steps:
      1. Open `/`.
      2. Hover project card and click its delete trigger.
      3. Assert confirmation overlay with `text=确认删除项目？` appears.
      4. Click cancel and assert the project card remains visible.
    Expected Result: Delete flow still requires explicit confirmation and cancel works.
    Failure Indicators: Immediate deletion, missing overlay, or card disappears after cancel.
    Evidence: .sisyphus/evidence/task-4-delete-cancel.png
  ```

  **Commit**: YES
  - Message: `refactor(home): move project library into homepage content pane`
  - Files: `components/Dashboard.tsx` and any extracted project-panel component files
  - Pre-commit: create/open/delete smoke check

- [ ] 5. Utility action relocation for help/theme/settings/account/new-project

  **What to do**:
  - Relocate the homepage utility actions from the current header cluster into their final sidebar and/or content-pane utility positions.
  - Preserve the exact handlers already wired in `Dashboard` and parent props.
  - Keep these actions visually discoverable without reintroducing the old stacked header pattern.

  **Must NOT do**:
  - Do not rename actions.
  - Do not change prop contracts unless strictly required by extraction.
  - Do not move utilities into unrelated routes or global app chrome.

  **Recommended Agent Profile**:
  - **Category**: `quick`
    - Reason: This is a constrained relocation/preservation task.
  - **Skills**: `[]`
    - No workspace skills are available.
  - **Skills Evaluated but Omitted**:
    - None available in this workspace.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1 (with 2, 3, 4 after Task 1 contract)
  - **Blocks**: 7, 8
  - **Blocked By**: 1, 3

  **References**:
  - `components/Dashboard.tsx:187-239` - Current utility action cluster and button labels/titles.
  - `components/Dashboard.tsx:369-447` - Settings modal and downstream actions it opens.
  - `components/Sidebar.tsx:101-133` - Utility-area layout pattern for theme/help/model/account actions.

  **Acceptance Criteria**:
  - [ ] Help/onboarding, theme toggle, settings, account, and new-project entry remain discoverable after relocation.
  - [ ] Existing handlers remain bound to the same actions.
  - [ ] The old header-only utility cluster is removed or reduced enough that the homepage is clearly left-nav driven.

  **QA Scenarios**:
  ```
  Scenario: Relocated utilities remain reachable
    Tool: Playwright
    Preconditions: Refactor branch running
    Steps:
      1. Open `/`.
      2. In the final utility area, click the theme toggle.
      3. Assert a visible theme state change indicator occurs (text/icon swap or body/theme class change).
      4. Click the help trigger and assert onboarding/help UI opens.
    Expected Result: Utility actions remain functional after relocation.
    Failure Indicators: Clicks do nothing, wrong UI opens, or controls are hidden.
    Evidence: .sisyphus/evidence/task-5-utilities.png

  Scenario: Account entry still routes correctly
    Tool: Playwright
    Preconditions: Refactor branch running
    Steps:
      1. Open `/`.
      2. Click the relocated account entry.
      3. Assert URL is `/account`.
      4. Navigate back and confirm homepage is still intact.
    Expected Result: Account routing remains unchanged.
    Failure Indicators: Wrong route, broken navigation, or missing control.
    Evidence: .sisyphus/evidence/task-5-account-route.png
  ```

  **Commit**: NO

---

- [ ] 6. DirectorHub banner and retained homepage secondary sections

  **What to do**:
  - Reposition the current DirectorHub section and any retained non-project-library homepage content into the new right content composition.
  - Preserve links and text while making the section feel intentional inside the new homepage structure.
  - Avoid letting this secondary content dominate the project-library use case.

  **Must NOT do**:
  - Do not rewrite marketing copy.
  - Do not remove the external link.
  - Do not add new homepage feature blocks.

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
    - Reason: This is secondary content placement and visual hierarchy work.
  - **Skills**: `[]`
    - No workspace skills are available.
  - **Skills Evaluated but Omitted**:
    - None available in this workspace.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with 7, 8 after Wave 1 dependencies)
  - **Blocks**: 8
  - **Blocked By**: 3

  **References**:
  - `components/Dashboard.tsx:243-261` - Current DirectorHub block and link.
  - `components/Dashboard.tsx:263-335` - Relationship between secondary content and project library.

  **Acceptance Criteria**:
  - [ ] DirectorHub block remains visible somewhere in the homepage content area.
  - [ ] The external link still opens the same URL.
  - [ ] The project library remains the dominant primary content.

  **QA Scenarios**:
  ```
  Scenario: DirectorHub section remains present but secondary
    Tool: Playwright
    Preconditions: Refactor branch running at desktop width
    Steps:
      1. Open `/`.
      2. Assert `text=DirectorHub 资源共创平台` is visible in the right content area.
      3. Assert the project library heading or project grid is also visible without modal interaction.
      4. Capture full-page screenshot.
    Expected Result: DirectorHub remains present without displacing the primary project-library experience.
    Failure Indicators: DirectorHub missing or consuming the primary visual focus at the expense of the library.
    Evidence: .sisyphus/evidence/task-6-directorhub-layout.png

  Scenario: DirectorHub link target preserved
    Tool: Playwright
    Preconditions: Refactor branch running
    Steps:
      1. Open `/`.
      2. Locate the external link inside the DirectorHub section.
      3. Assert link href matches the existing DirectorHub URL target.
    Expected Result: External destination remains unchanged.
    Failure Indicators: Missing link, changed target, or broken anchor.
    Evidence: .sisyphus/evidence/task-6-directorhub-link.png
  ```

  **Commit**: NO

- [ ] 7. Modal and overlay continuity for existing Dashboard flows

  **What to do**:
  - Ensure all Dashboard-owned overlays still open above the new homepage layout correctly: group QR, settings modal, asset library modal, and asset-to-project picker.
  - Preserve hidden import input and data transfer triggers reached through settings.
  - Confirm scroll, z-index, and click-outside behavior still work after layout restructuring.

  **Must NOT do**:
  - Do not redesign modal copy or workflows.
  - Do not convert modal flows into separate pages.
  - Do not break overlay stacking because of new fixed/flex layout containers.

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
    - Reason: Overlay integrity across a refactored layout is high-risk regression work.
  - **Skills**: `[]`
    - No workspace skills are available.
  - **Skills Evaluated but Omitted**:
    - None available in this workspace.

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2 (with 6 after Wave 1 dependencies)
  - **Blocks**: 8
  - **Blocked By**: 4, 5

  **References**:
  - `components/Dashboard.tsx:338-367` - Group QR modal.
  - `components/Dashboard.tsx:369-451` - Settings modal and trigger wiring.
  - `components/Dashboard.tsx:454-594` - Asset library modal and filters.
  - `components/Dashboard.tsx:596-633` - Asset-to-project picker overlay.
  - `components/Dashboard.tsx:636-642` - Hidden import input that must remain reachable by settings actions.

  **Acceptance Criteria**:
  - [ ] Every existing Dashboard modal/overlay still opens and closes correctly.
  - [ ] Overlay layering is not broken by the new left-nav shell.
  - [ ] Asset-library search/filter UI still renders and remains usable.

  **QA Scenarios**:
  ```
  Scenario: Settings and asset-library modal stack still works
    Tool: Playwright
    Preconditions: Refactor branch running
    Steps:
      1. Open `/`.
      2. Click the relocated settings trigger.
      3. Assert `text=系统设置` modal is visible above the homepage.
      4. Click the `text=资产库` option inside settings.
      5. Assert asset-library modal heading `text=Asset Library` or `text=资产库` is visible.
    Expected Result: Modal chain works exactly as before within the new layout.
    Failure Indicators: Modal hidden behind layout, click blocked, or second modal never opens.
    Evidence: .sisyphus/evidence/task-7-settings-asset-library.png

  Scenario: Asset-library empty/filter/search state remains usable
    Tool: Playwright
    Preconditions: Asset library modal open
    Steps:
      1. In the asset-library modal, type `zzzz-nonexistent-query` into `input[placeholder="搜索资产名称..."]`.
      2. Assert the empty-state text or zero-result state appears without layout breakage.
      3. Close the modal and verify homepage returns to normal interaction state.
    Expected Result: Search/filter UI and overlay close behavior remain stable.
    Failure Indicators: Broken modal scroll, invisible input, or stuck overlay.
    Evidence: .sisyphus/evidence/task-7-library-search-empty.png
  ```

  **Commit**: YES
  - Message: `fix(home): preserve dashboard modal flows after layout refactor`
  - Files: `components/Dashboard.tsx` and any extracted modal-host/layout files
  - Pre-commit: settings + asset-library modal smoke test

- [ ] 8. Root-route regression pass and responsive polish

  **What to do**:
  - Finalize root homepage integration and remove residual stacked-header artifacts.
  - Re-check that `/` still acts as the default homepage and that project-open behavior remains unchanged.
  - Polish spacing, overflow, and breakpoint issues introduced by the new two-column layout.
  - Run build verification and fix any final compile/style regressions.

  **Must NOT do**:
  - Do not extend the refactor into `ProjectOverview`, episode workspace, or account-center UI unless a blocker is proven.
  - Do not alter root-route mapping away from `Dashboard` unless absolutely necessary and explicitly documented.
  - Do not leave both old and new homepage nav paradigms competing on screen.

  **Recommended Agent Profile**:
  - **Category**: `deep`
    - Reason: This is the final integration/regression task across layout, behavior, and route preservation.
  - **Skills**: `[]`
    - No workspace skills are available.
  - **Skills Evaluated but Omitted**:
    - None available in this workspace.

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 2 integration finisher
  - **Blocks**: F1, F2, F3, F4
  - **Blocked By**: 2, 3, 4, 5, 6, 7

  **References**:
  - `App.tsx:355-363` - Preserve root-route entry and `Dashboard` usage.
  - `components/Dashboard.tsx:176-647` - Final integrated homepage behavior surface.
  - `package.json:6-12` - Available validation commands; build is the practical automated baseline.

  **Acceptance Criteria**:
  - [ ] `/` still renders the homepage successfully.
  - [ ] No stacked header remnants conflict with the left-nav layout.
  - [ ] `npm run build` passes.
  - [ ] Responsive desktop widths remain usable after final polish.

  **QA Scenarios**:
  ```
  Scenario: Root route remains the default homepage entry
    Tool: Playwright
    Preconditions: Refactor branch running
    Steps:
      1. Open `/` directly in a fresh browser context.
      2. Assert the homepage loads without redirect loops.
      3. Assert left rail is visible and the project library content is present.
    Expected Result: `/` remains the working default homepage entry.
    Failure Indicators: Wrong route, blank screen, or stale old layout.
    Evidence: .sisyphus/evidence/task-8-root-homepage.png

  Scenario: Production build succeeds after layout refactor
    Tool: Bash
    Preconditions: Refactor branch with all homepage tasks completed
    Steps:
      1. Run `npm run build`.
      2. Capture terminal output.
      3. Assert process exits with code 0.
    Expected Result: Production build completes successfully.
    Failure Indicators: Type/build failure, asset resolution failure, or UTF-8/build guard failure.
    Evidence: .sisyphus/evidence/task-8-build.txt
  ```

  **Commit**: YES
  - Message: `style(home): finalize left-nav homepage regression polish`
  - Files: homepage layout files touched across previous tasks
  - Pre-commit: `npm run build`

---

## Final Verification Wave

> 4 review agents run in parallel after implementation. All must approve before asking the user for final okay.

- [ ] F1. **Plan Compliance Audit** — `oracle`
  - Verify the implemented homepage still maps `/` to the intended landing surface.
  - Verify left-nav/right-content layout exists.
  - Verify all preserved homepage actions still exist and work.
  - Verify evidence files exist for all task QA scenarios.

- [ ] F2. **Code Quality Review** — `unspecified-high`
  - Run `npm run build`.
  - Review changed files for dead code, duplicated layout logic, brittle selector hacks, and unintended route logic changes.

- [ ] F3. **Real Manual QA** — `unspecified-high`
  - Execute every task QA scenario with browser automation.
  - Re-check responsive layout, modal behavior, and project navigation from root homepage.

- [ ] F4. **Scope Fidelity Check** — `deep`
  - Compare final diff against this plan.
  - Reject any feature additions, route target changes, or full-shell rewrites not justified by the plan.

---

## Commit Strategy

- **Commit 1**: `refactor(home): introduce left-nav homepage shell`
  - Scope: layout frame, sidebar structure, root-page section scaffolding
- **Commit 2**: `refactor(home): migrate dashboard project library into content pane`
  - Scope: project grid/create card/retained sections placement
- **Commit 3**: `fix(home): preserve dashboard modal and action flows in new layout`
  - Scope: settings, asset library, QR modal, account/help/theme/new-project flows
- **Commit 4**: `style(home): finalize responsive homepage polish`
  - Scope: spacing, overflow, breakpoint cleanup, final regression fixes

---

## Success Criteria

### Verification Commands
```bash
npm run build  # Expected: successful production build with no errors
```

### Final Checklist
- [ ] Root route still opens the homepage correctly
- [ ] Homepage now uses left navigation + right content area
- [ ] Project library remains available on the homepage
- [ ] Existing homepage actions still work
- [ ] Existing modal flows still work
- [ ] No new features or route behavior changes were introduced
