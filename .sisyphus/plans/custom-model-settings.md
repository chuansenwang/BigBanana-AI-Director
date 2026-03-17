# Custom Model Settings Plan

## TL;DR

> Extend the existing model settings system so users can add and edit custom providers and custom models for **chat, image, video, and audio**, then use those models end-to-end in real generation flows.
>
> **Deliverables**:
> - Custom provider management in settings
> - Custom model add/edit for all four model types
> - OpenAI-compatible + Gemini-style runtime support
> - Registry persistence/migration cleanup around the active model source of truth
>
> **Estimated Effort**: Medium-Large
> **Parallel Execution**: YES - 3 implementation waves + final verification
> **Critical Path**: Registry authority → typed custom-model metadata → runtime adapter compatibility → settings UI integration → end-to-end validation

---

## Context

### Original Request
Add support in system/model settings for custom models and custom providers, covering all model types and working in the real generation pipeline.

### Interview Summary
**Key Decisions**:
- Support **all model types**: chat, image, video, audio
- Support **custom providers**
- v1 requires **add + edit** (delete is not in scope)
- Custom models must be **usable end-to-end**, not just stored in settings
- Protocol scope for v1: **OpenAI-compatible + Gemini-style**
- Do **not** add a new automated test framework in this work; rely on build + detailed runtime verification

**Research Findings**:
- `components/ModelConfig/index.tsx` is already the central settings modal
- `components/ModelConfig/AddModelForm.tsx` is the natural insertion point for provider/model creation UX
- `services/modelRegistry.ts` is the effective live registry and already supports register/update/remove semantics
- `services/modelConfigService.ts` is a legacy parallel path and must be accounted for to avoid split-brain configuration
- `types/model.ts` already models `isBuiltIn`, provider IDs, endpoint overrides, API keys, and per-type params
- Runtime adapters already resolve provider/model info from registry, which makes OpenAI-compatible custom models a good architectural fit

### Metis Review
**Identified Gaps** (addressed in this plan):
- Lock scope to **add/edit only** for v1; no delete/import/export wave
- Make `modelRegistry.ts` the single planning authority and explicitly audit `modelConfigService.ts`
- Add validation and compatibility checks before save/activation
- Include edge cases for invalid provider config, unsupported params, inactive active-model fallbacks, and persistence reload behavior

---

## Work Objectives

### Core Objective
Evolve the current settings architecture so custom providers and custom models become first-class configuration objects across UI, persistence, activation logic, and runtime adapter resolution.

### Concrete Deliverables
- Provider add/edit UX in model settings
- Model add/edit UX for chat/image/video/audio
- Registry/runtime support for OpenAI-compatible and Gemini-style custom integrations
- Safe persistence/migration behavior for custom items and active selections
- Validation and guardrails for unsupported/invalid configurations

### Definition of Done
- [ ] A user can add a custom provider, add a custom model for each supported type, save it, reopen the app, and still see it
- [ ] A user can activate a custom model of each type and the corresponding generation flow resolves provider/base URL/API key/model name correctly
- [ ] Unsupported protocol/parameter combinations are blocked or clearly surfaced before runtime failure
- [ ] `npm run build` passes after implementation

### Must Have
- One coherent source of truth for model/provider settings behavior
- End-to-end runtime support, not just UI CRUD
- Clear v1 protocol boundary: OpenAI-compatible + Gemini-style only

### Must NOT Have (Guardrails)
- No v1 delete flow for providers/models
- No import/export/catalog marketplace scope
- No arbitrary third protocol family beyond OpenAI-compatible + Gemini-style
- No brand-new model-management subsystem parallel to `modelRegistry.ts`

---

## Verification Strategy

> **ZERO HUMAN INTERVENTION** — verification must be executable by the implementing agent.

### Test Decision
- **Infrastructure exists**: NO formal unit/integration test framework
- **Automated tests**: None for this scope
- **Framework**: none

### QA Policy
- Primary verification = `npm run build` + agent-executed runtime validation
- UI flows: use Playwright/browser automation to create/edit providers/models and verify persisted state
- Runtime flows: use app UI plus controlled settings to confirm the chosen custom model is actually used in generation entrypoints
- Evidence saved under `.sisyphus/evidence/`

---

## Execution Strategy

### Parallel Execution Waves

```text
Wave 1 (foundation and contracts)
├── Task 1: Audit registry authority and legacy config touchpoints [deep]
├── Task 2: Extend custom provider/model contracts and validation schema [unspecified-high]
├── Task 3: Define protocol capability matrix for OpenAI-compatible vs Gemini-style [quick]
└── Task 4: Plan active-model fallback and migration rules [quick]

Wave 2 (core implementation)
├── Task 5: Implement registry persistence + migration updates [deep]
├── Task 6: Implement provider add/edit settings UX [visual-engineering]
├── Task 7: Implement model add/edit UX for all model types [visual-engineering]
└── Task 8: Wire runtime adapter/model-service compatibility [deep]

Wave 3 (integration and safeguards)
├── Task 9: Add pre-save/pre-activation validation and incompatibility messaging [unspecified-high]
├── Task 10: Integrate reload/activation flows across settings entry points [quick]
└── Task 11: End-to-end verification harness + evidence capture [unspecified-high]

Wave FINAL
├── Task F1: Plan compliance audit [oracle]
├── Task F2: Build/code quality review [unspecified-high]
├── Task F3: Real runtime QA [unspecified-high]
└── Task F4: Scope fidelity check [deep]
```

### Dependency Matrix
- **1**: — → 5, 8
- **2**: — → 5, 7, 9
- **3**: — → 7, 8, 9
- **4**: — → 5, 10
- **5**: 1, 2, 4 → 8, 10, 11
- **6**: — → 10, 11
- **7**: 2, 3 → 9, 10, 11
- **8**: 1, 3, 5 → 11
- **9**: 2, 3, 7 → 11
- **10**: 4, 5, 6, 7 → 11
- **11**: 5, 6, 7, 8, 9, 10 → F1-F4

### Agent Dispatch Summary
- **Wave 1**: T1 `deep`, T2 `unspecified-high`, T3 `quick`, T4 `quick`
- **Wave 2**: T5 `deep`, T6 `visual-engineering`, T7 `visual-engineering`, T8 `deep`
- **Wave 3**: T9 `unspecified-high`, T10 `quick`, T11 `unspecified-high`
- **Final**: F1 `oracle`, F2 `unspecified-high`, F3 `unspecified-high`, F4 `deep`

---

## TODOs

- [ ] 1. Audit model-settings source of truth and legacy config touchpoints

  **What to do**:
  - Identify every live caller of `services/modelRegistry.ts` and `services/modelConfigService.ts`
  - Decide and implement one authoritative path for settings/runtime reads in this feature area
  - Document how legacy config data is preserved, migrated, or ignored safely

  **Must NOT do**:
  - Do not keep a split-brain runtime where some settings flows use `modelRegistry.ts` and others silently rely on `modelConfigService.ts`

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 5, 8
  - **Blocked By**: None

  **References**:
  - `services/modelRegistry.ts` - primary registry CRUD, migration, active-model logic
  - `services/modelConfigService.ts` - legacy competing config path that must be audited
  - `components/ModelConfig/index.tsx` - main model-settings modal entrypoint
  - `App.tsx` - settings modal is reachable from multiple route shells

  **Acceptance Criteria**:
  - [ ] One authoritative settings/runtime path is identified and reflected in implementation
  - [ ] Legacy-path behavior is explicitly preserved, migrated, or fenced off

  **QA Scenarios**:
  ```text
  Scenario: Source-of-truth audit succeeds
    Tool: Bash + Grep
    Steps:
      1. Search for `modelRegistry` and `modelConfigService` usages
      2. Verify changed callers align with the chosen authority
      3. Confirm no stale settings path remains in the custom-model flow
    Expected Result: all relevant custom-model flows resolve through the chosen authority
    Evidence: .sisyphus/evidence/task-1-source-of-truth.txt

  Scenario: Legacy path is handled safely
    Tool: Read + Grep
    Steps:
      1. Inspect migration/fallback logic
      2. Verify legacy data does not override the new authoritative path unexpectedly
    Expected Result: deterministic migration/fallback behavior
    Evidence: .sisyphus/evidence/task-1-legacy-path.txt
  ```

- [ ] 2. Extend provider/model contracts for custom protocol metadata and typed params

  **What to do**:
  - Add/adjust type-level metadata needed to distinguish OpenAI-compatible vs Gemini-style custom providers/models
  - Ensure all four model types have the fields needed for settings UI and runtime resolution
  - Keep built-in vs custom semantics explicit

  **Must NOT do**:
  - Do not broaden the schema toward arbitrary unknown protocol families in v1

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 5, 7, 9
  - **Blocked By**: None

  **References**:
  - `types/model.ts` - model/provider contracts and per-type params
  - `components/ModelConfig/AddModelForm.tsx` - likely consumer of new metadata
  - `services/adapters/chatAdapter.ts`, `imageAdapter.ts`, `videoAdapter.ts` - runtime expectations for per-type fields

  **Acceptance Criteria**:
  - [ ] Contract changes can represent both provider families and all four model types cleanly
  - [ ] No built-in model contract is accidentally broken

  **QA Scenarios**:
  ```text
  Scenario: Type contracts cover all supported custom cases
    Tool: Bash (build)
    Steps:
      1. Run `npm run build`
      2. Confirm no type errors in model settings or adapters
    Expected Result: build passes with new contract shapes
    Evidence: .sisyphus/evidence/task-2-build.txt

  Scenario: Unsupported protocol expansion is blocked
    Tool: Read + Grep
    Steps:
      1. Inspect new protocol discriminators/validation logic
      2. Verify only OpenAI-compatible and Gemini-style are represented
    Expected Result: v1 protocol boundary remains explicit
    Evidence: .sisyphus/evidence/task-2-protocol-boundary.txt
  ```

- [ ] 3. Define the protocol capability matrix for OpenAI-compatible and Gemini-style flows

  **What to do**:
  - Map which fields/behaviors differ by protocol and by model type
  - Feed that matrix into form behavior, validation, and adapter selection

  **Must NOT do**:
  - Do not hardcode UI assumptions that only work for chat and fail for image/video/audio

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 7, 8, 9
  - **Blocked By**: None

  **References**:
  - `services/adapters/*` - actual protocol/runtime differences
  - `types/model.ts` - per-type params that must align with capability matrix

  **Acceptance Criteria**:
  - [ ] Capability differences are explicit and consumable by UI/runtime logic

  **QA Scenarios**:
  ```text
  Scenario: Capability matrix is reflected in code paths
    Tool: Read
    Steps:
      1. Inspect the matrix/lookup definitions
      2. Verify both UI and runtime use the same capability source
    Expected Result: one consistent capability definition drives downstream behavior
    Evidence: .sisyphus/evidence/task-3-capability-matrix.txt
  ```

- [ ] 4. Define active-model fallback and migration rules for custom entries

  **What to do**:
  - Specify what happens if a custom provider/model becomes invalid, disabled, or incompatible after reload
  - Make active-model fallback deterministic across all types

  **Must NOT do**:
  - Do not leave active-model state dangling on broken custom IDs

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 1
  - **Blocks**: 5, 10
  - **Blocked By**: None

  **References**:
  - `services/modelRegistry.ts` - current active-model repair/fallback logic
  - `types/model.ts` - active model state shape

  **Acceptance Criteria**:
  - [ ] Invalid custom active models fall back safely and predictably

  **QA Scenarios**:
  ```text
  Scenario: Broken custom active model falls back safely
    Tool: Playwright or app runtime verification
    Steps:
      1. Configure a custom model as active
      2. Simulate invalid/incompatible state
      3. Reload settings/app state
    Expected Result: app falls back to a valid model without crashing
    Evidence: .sisyphus/evidence/task-4-active-fallback.txt
  ```

- [ ] 5. Implement registry persistence and migration updates for custom providers/models

  **What to do**:
  - Update `modelRegistry.ts` load/save/migration behavior for custom providers/models and protocol metadata
  - Keep built-in merge behavior intact while preserving custom entries and edits
  - Ensure reload persistence works cleanly

  **Must NOT do**:
  - Do not overwrite custom structural data during built-in merge logic

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 8, 10, 11
  - **Blocked By**: 1, 2, 4

  **References**:
  - `services/modelRegistry.ts` - persistence, migration, built-in merge order
  - `services/modelIdUtils.ts` - ID normalization concerns

  **Acceptance Criteria**:
  - [ ] Custom providers/models persist across reloads
  - [ ] Built-in migration logic does not clobber custom entries

  **QA Scenarios**:
  ```text
  Scenario: Custom provider/model persists across reload
    Tool: Playwright
    Steps:
      1. Add a custom provider and a custom model
      2. Reload the page
      3. Re-open model settings
    Expected Result: saved entries remain present and editable
    Evidence: .sisyphus/evidence/task-5-reload-persistence.png

  Scenario: Built-in merge does not destroy custom data
    Tool: Playwright + Read
    Steps:
      1. Seed custom entries
      2. Trigger load path
      3. Verify custom entries remain after built-in sync logic runs
    Expected Result: custom items survive registry reconstruction
    Evidence: .sisyphus/evidence/task-5-built-in-merge.txt
  ```

- [ ] 6. Implement provider add/edit UX in model settings

  **What to do**:
  - Add UI to create and edit custom providers, including protocol family, base URL, API key behavior, and provider metadata
  - Surface validation and save states clearly

  **Must NOT do**:
  - Do not expose delete in v1

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 10, 11
  - **Blocked By**: None

  **References**:
  - `components/ModelConfig/index.tsx` - modal/tab shell
  - `components/ModelConfig/GlobalSettings.tsx` - settings tab interaction patterns
  - `components/ModelConfig/AddModelForm.tsx` - add/edit form patterns

  **Acceptance Criteria**:
  - [ ] User can add a custom provider
  - [ ] User can edit a custom provider
  - [ ] Invalid provider config is blocked or clearly warned

  **QA Scenarios**:
  ```text
  Scenario: Add and edit a custom provider
    Tool: Playwright
    Steps:
      1. Open model settings
      2. Create provider `Acme OpenAI` with a valid-looking OpenAI-compatible base URL
      3. Edit provider display fields
      4. Reload and verify changes persist
    Expected Result: provider is visible, editable, and persists
    Evidence: .sisyphus/evidence/task-6-provider-flow.png

  Scenario: Reject invalid provider configuration
    Tool: Playwright
    Steps:
      1. Enter malformed base URL or missing required protocol metadata
      2. Attempt save
    Expected Result: save is blocked or explicit validation message is shown
    Evidence: .sisyphus/evidence/task-6-provider-validation.png
  ```

- [ ] 7. Implement model add/edit UX for chat, image, video, and audio custom models

  **What to do**:
  - Extend add/edit forms so all model types can be configured against custom providers
  - Show/hide per-type params correctly based on type and protocol
  - Keep built-in models protected while enabling custom edits

  **Must NOT do**:
  - Do not let built-in-protected fields masquerade as editable custom fields

  **Recommended Agent Profile**:
  - **Category**: `visual-engineering`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 9, 10, 11
  - **Blocked By**: 2, 3

  **References**:
  - `components/ModelConfig/ModelList.tsx` - per-type list + activation UI
  - `components/ModelConfig/ModelCard.tsx` - edit/display card behavior
  - `components/ModelConfig/AddModelForm.tsx` - add/edit form structure
  - `types/model.ts` - per-type params

  **Acceptance Criteria**:
  - [ ] User can add/edit one custom model for each supported type
  - [ ] Form fields change correctly for type/protocol combinations

  **QA Scenarios**:
  ```text
  Scenario: Add one custom model per type
    Tool: Playwright
    Steps:
      1. Create chat, image, video, and audio custom models under suitable providers
      2. Save each form
      3. Verify each appears in the correct tab/list
    Expected Result: all four types are represented correctly
    Evidence: .sisyphus/evidence/task-7-all-types.png

  Scenario: Invalid type-specific params are blocked
    Tool: Playwright
    Steps:
      1. Enter unsupported duration/aspect/protocol-specific field combination
      2. Attempt save
    Expected Result: validation prevents invalid model configuration
    Evidence: .sisyphus/evidence/task-7-type-validation.png
  ```

- [ ] 8. Wire runtime adapter and model-service compatibility for custom provider families

  **What to do**:
  - Ensure runtime adapters and high-level model services resolve the correct provider, endpoint, auth, and model identifiers for custom models
  - Cover OpenAI-compatible and Gemini-style branches where behavior differs

  **Must NOT do**:
  - Do not stop at UI persistence; this task is the bridge to real generation usage

  **Recommended Agent Profile**:
  - **Category**: `deep`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 2
  - **Blocks**: 11
  - **Blocked By**: 1, 3, 5

  **References**:
  - `services/modelService.ts` - high-level generation facade
  - `services/adapters/chatAdapter.ts`, `imageAdapter.ts`, `videoAdapter.ts` - runtime resolution points
  - `services/ai/apiCore.ts` - shared model/API resolution patterns

  **Acceptance Criteria**:
  - [ ] Activated custom models are resolved by runtime paths
  - [ ] Protocol-specific request shape differences are honored

  **QA Scenarios**:
  ```text
  Scenario: Activated custom model is used at runtime
    Tool: Playwright + app runtime evidence
    Steps:
      1. Activate a custom chat/image/video/audio model
      2. Trigger the corresponding generation entry flow
      3. Inspect visible runtime/log evidence showing selected model/provider usage
    Expected Result: runtime path resolves the selected custom model, not a built-in fallback
    Evidence: .sisyphus/evidence/task-8-runtime-resolution.txt

  Scenario: Unsupported runtime branch fails clearly
    Tool: Playwright
    Steps:
      1. Configure a model/protocol combination that is not supported by runtime rules
      2. Attempt generation
    Expected Result: explicit incompatibility/error messaging appears before silent failure
    Evidence: .sisyphus/evidence/task-8-runtime-error.png
  ```

- [ ] 9. Add pre-save and pre-activation validation for compatibility and incomplete configuration

  **What to do**:
  - Validate provider URL/protocol completeness, required API fields, and type/protocol param compatibility
  - Validate before activation so broken models are not silently set active

  **Must NOT do**:
  - Do not rely on backend/runtime failure as the first feedback mechanism

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: 11
  - **Blocked By**: 2, 3, 7

  **References**:
  - `components/ModelConfig/*` - UX surfaces for validation messaging
  - `services/modelRegistry.ts` - activation/update hooks
  - `types/model.ts` - type/param rules

  **Acceptance Criteria**:
  - [ ] Incomplete/invalid custom configs cannot be saved or activated without explicit feedback

  **QA Scenarios**:
  ```text
  Scenario: Save blocked on incomplete custom model
    Tool: Playwright
    Steps:
      1. Leave required fields blank
      2. Attempt save
    Expected Result: save is blocked with actionable validation feedback
    Evidence: .sisyphus/evidence/task-9-save-validation.png

  Scenario: Activation blocked on incompatible config
    Tool: Playwright
    Steps:
      1. Create a model with incompatible settings
      2. Attempt activation
    Expected Result: activation is blocked or downgraded with a clear message
    Evidence: .sisyphus/evidence/task-9-activation-validation.png
  ```

- [ ] 10. Integrate settings reload and activation flows across all entry points

  **What to do**:
  - Ensure the settings modal behaves consistently whether opened from onboarding, sidebar, or error-triggered config flows
  - Ensure active model changes propagate cleanly after save/reload

  **Must NOT do**:
  - Do not leave one entry point using stale cached state while another reflects updated custom config

  **Recommended Agent Profile**:
  - **Category**: `quick`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: YES
  - **Parallel Group**: Wave 3
  - **Blocks**: 11
  - **Blocked By**: 4, 5, 6, 7

  **References**:
  - `App.tsx` - modal open paths and API-key-triggered config flow
  - `components/Sidebar.tsx` - direct settings entry
  - `components/ModelConfig/index.tsx` - modal refresh behavior

  **Acceptance Criteria**:
  - [ ] All settings entry points show the same persisted provider/model state
  - [ ] Active model changes survive close/reopen/reload

  **QA Scenarios**:
  ```text
  Scenario: Multiple settings entry points stay in sync
    Tool: Playwright
    Steps:
      1. Open settings from one entry point and save a custom model change
      2. Re-open from another entry point
      3. Verify the same data appears
    Expected Result: no stale divergent settings state
    Evidence: .sisyphus/evidence/task-10-entry-sync.png

  Scenario: Active custom model survives reload
    Tool: Playwright
    Steps:
      1. Set a custom model active
      2. Reload the app
      3. Re-open settings and inspect active state
    Expected Result: active selection remains valid or safely falls back
    Evidence: .sisyphus/evidence/task-10-active-reload.png
  ```

- [ ] 11. Execute end-to-end verification for custom settings and runtime usage

  **What to do**:
  - Run the full validation matrix for provider creation, model creation, activation, reload persistence, and runtime usage
  - Capture evidence for both success and failure cases

  **Must NOT do**:
  - Do not mark the feature complete based only on settings UI screenshots

  **Recommended Agent Profile**:
  - **Category**: `unspecified-high`
  - **Skills**: `[]`

  **Parallelization**:
  - **Can Run In Parallel**: NO
  - **Parallel Group**: Wave 3
  - **Blocks**: F1-F4
  - **Blocked By**: 5, 6, 7, 8, 9, 10

  **References**:
  - `components/ModelConfig/*`
  - `services/modelRegistry.ts`
  - `services/modelService.ts`
  - `services/adapters/*`

  **Acceptance Criteria**:
  - [ ] All v1 flows are exercised with evidence
  - [ ] `npm run build` passes

  **QA Scenarios**:
  ```text
  Scenario: Happy-path end-to-end custom model flow
    Tool: Playwright + Bash
    Steps:
      1. Add provider + model
      2. Activate model
      3. Trigger corresponding generation flow
      4. Run `npm run build`
    Expected Result: persistence, activation, runtime usage, and build all pass
    Evidence: .sisyphus/evidence/task-11-happy-path.txt

  Scenario: Broken config path is surfaced clearly
    Tool: Playwright
    Steps:
      1. Use invalid/incomplete custom config
      2. Attempt activation or runtime use
    Expected Result: deterministic validation or explicit runtime error, not silent fallback without notice
    Evidence: .sisyphus/evidence/task-11-error-path.txt
  ```

---

## Final Verification Wave

- [ ] F1. **Plan Compliance Audit** — `oracle`
  Verify every scoped item exists: custom providers, custom model add/edit, all four types, activation, OpenAI-compatible + Gemini-style boundaries, no v1 delete/import-export creep.

- [ ] F2. **Build / Code Quality Review** — `unspecified-high`
  Run `npm run build`; inspect changed files for split-brain config logic, dead branches, and accidental protocol sprawl.

- [ ] F3. **Real Runtime QA** — `unspecified-high`
  Execute the provider/model add/edit/activate/reload/runtime scenarios and ensure evidence exists for both happy and failure paths.

- [ ] F4. **Scope Fidelity Check** — `deep`
  Verify the implementation delivers add/edit + full-chain usage only, without unplanned delete/import-export/third-protocol work.

---

## Commit Strategy

- **Commit 1**: `refactor(model-settings): unify registry authority for custom model flows`
- **Commit 2**: `feat(model-types): extend custom provider and model contracts`
- **Commit 3**: `feat(model-settings): add custom provider add/edit workflow`
- **Commit 4**: `feat(model-settings): add custom model add/edit flows across all model types`
- **Commit 5**: `feat(runtime): wire custom provider compatibility into adapters`
- **Commit 6**: `feat(validation): add custom model compatibility guards`
- **Commit 7**: `chore(qa): capture end-to-end verification evidence`

Atomicity rule: UI-only, registry-only, runtime-only, and validation-only changes should not be collapsed into one giant commit.

---

## Success Criteria

### Verification Commands
```bash
npm run build
```

### Final Checklist
- [ ] Custom provider add/edit works
- [ ] Custom model add/edit works for chat, image, video, and audio
- [ ] OpenAI-compatible and Gemini-style branches are explicitly supported
- [ ] Custom models can be activated and used by real generation flows
- [ ] Reload persistence works
- [ ] Invalid configurations fail clearly
- [ ] No v1 delete/import-export/arbitrary-protocol creep
