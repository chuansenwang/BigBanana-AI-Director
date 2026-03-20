# Video Downloader Skill for YouTube and TikTok

## TL;DR
> **Summary**: Create a Windows-first `video-downloader` skill that mirrors the repo's existing skill layout, uses `yt-dlp` as the download engine, and documents a stable workflow for downloading public YouTube/TikTok videos by URL.
> **Deliverables**:
> - Canonical `video-downloader` skill definition with YAML frontmatter and executable markdown instructions
> - Mirrored `SKILL.md` copies in `.agents`, `.claude`, `.trae`, `.iflow`, and `.agent`
> - Windows-first install, usage, validation, and failure-handling guidance for `yt-dlp` + FFmpeg
> - QA evidence for public YouTube/TikTok flows, audio-only export, batch handling, and unsupported/private-scope rejection
> **Effort**: Short
> **Parallel**: YES - 2 waves
> **Critical Path**: 1 → 2 → 3 → 6 → 8

## Context
### Original Request
用户希望使用 `skill-creator` 创建一个“给一个视频链接就可以下载对应视频”的 skill，目标平台为 YouTube 和 TikTok。

### Interview Summary
- New skill only; no application feature work.
- Mirror the skill across `.agents`, `.claude`, `.trae`, `.iflow`, and `.agent`.
- Use `yt-dlp` as the preferred engine.
- V1 scope: public videos only, single URL download, batch URL support, custom filename, metadata output, audio-only export.
- Delivery model: save to a configurable local directory and return local file path plus metadata.
- Windows-first runtime expectations.
- Subtitles and cookies/private-video handling are explicitly out of scope for V1.
- Verification approach: tests-after plus agent-executed QA; repo currently has no formal test script in `package.json`.

### Metis Review (gaps addressed)
- Metis invocation was unavailable in this environment, so Prometheus applied a fallback gap review before planning.
- Locked scope against creep: no private videos, no cookies, no subtitles, no app/server code changes unless absolutely required to document the skill.
- Added explicit validation requirements for URL patterns, output-path behavior, Windows dependency checks, and TikTok failure messaging.
- Added acceptance criteria for mirrored skill parity across all agent directories.
- Added QA coverage for success paths and failure paths on both platforms.

## Work Objectives
### Core Objective
Produce one decision-complete `video-downloader` skill package, mirrored across all existing agent-skill directories, that enables an agent to reliably download public YouTube and TikTok videos from a URL on Windows using `yt-dlp`.

### Deliverables
- `.agents/skills/video-downloader/SKILL.md`
- `.claude/skills/video-downloader/SKILL.md`
- `.trae/skills/video-downloader/SKILL.md`
- `.iflow/skills/video-downloader/SKILL.md`
- `.agent/skills/video-downloader/SKILL.md`
- `.sisyphus/evidence/task-*-*.{txt,md,json,log}` verification artifacts created during execution

### Definition of Done (verifiable conditions with commands)
- `Test-Path ".agents/skills/video-downloader/SKILL.md"` returns `True`.
- `Test-Path ".claude/skills/video-downloader/SKILL.md"` returns `True`.
- `Test-Path ".trae/skills/video-downloader/SKILL.md"` returns `True`.
- `Test-Path ".iflow/skills/video-downloader/SKILL.md"` returns `True`.
- `Test-Path ".agent/skills/video-downloader/SKILL.md"` returns `True`.
- `(Get-FileHash ".agents/skills/video-downloader/SKILL.md").Hash` matches the hash of the other four mirrored files.
- `Select-String -Path ".agents/skills/video-downloader/SKILL.md" -Pattern "yt-dlp","ffmpeg","YouTube","TikTok","audio-only","batch","metadata","public videos only"` returns matches for every required capability.
- Public YouTube and TikTok validation commands documented in the skill complete successfully and produce evidence files.
- Failure-path validation commands for unsupported/private-scope handling and missing-dependency handling produce the documented error guidance.

### Must Have
- Canonical YAML frontmatter matching existing skill conventions.
- Clear trigger/usage guidance for “download a video from this URL”.
- Windows-first dependency instructions for `yt-dlp` and FFmpeg.
- Exact command templates for single URL, batch, custom filename, metadata-only inspection, and audio-only export.
- Explicit output contract: configurable local directory + returned local file path + metadata.
- Scope locks for public videos only; cookies/private videos/subtitles excluded.
- Concrete troubleshooting guidance for TikTok anti-bot / 403 behavior without promising unsupported V1 behavior.

### Must NOT Have (guardrails, AI slop patterns, scope boundaries)
- No app UI, service, or proxy feature work unless the executor proves it is strictly required to make the skill usable.
- No promise of private-video or cookie-based download support in V1.
- No subtitle workflow in V1.
- No vague wording like “handle errors gracefully” without exact messages, commands, or decision rules.
- No agent-directory drift; mirrored skill content must stay byte-identical.
- No unsupported claims about legality; keep language to permission/ToS/copyright caution.

## Verification Strategy
> ZERO HUMAN INTERVENTION — all verification is agent-executed.
- Test decision: tests-after + command-driven verification (repo has no formal `test` script in `package.json:6-15`)
- QA policy: Every task includes agent-executed scenarios
- Evidence: `.sisyphus/evidence/task-{N}-{slug}.{ext}`

## Execution Strategy
### Parallel Execution Waves
> Target: 5-8 tasks per wave. <3 per wave (except final) = under-splitting.
> Extract shared dependencies as Wave-1 tasks for max parallelism.

Wave 1: foundation skill-authoring tasks (1, 2, 3, 4, 5)
Wave 2: fixture-locking + mirroring + repo-safe validation tasks (6, 7, 8)

### Dependency Matrix (full, all tasks)
| Task | Depends On | Blocks |
|---|---|---|
| 1 | None | 2, 3, 4, 5, 6, 7 |
| 2 | 1 | 6, 8 |
| 3 | 1 | 6, 8 |
| 4 | 1 | 6, 8 |
| 5 | 1 | 6, 8 |
| 6 | 1, 2, 3, 4, 5 | 7, 8 |
| 7 | 1, 2, 3, 4, 5, 6 | 8 |
| 8 | 2, 3, 4, 5, 6, 7 | F1-F4 |

### Agent Dispatch Summary (wave → task count → categories)
| Wave | Task Count | Categories |
|---|---:|---|
| 1 | 5 | writing, unspecified-low |
| 2 | 3 | writing, quick, unspecified-low |
| Final | 4 | oracle, unspecified-high, deep |

## TODOs
> Implementation + Test = ONE task. Never separate.
> EVERY task MUST have: Agent Profile + Parallelization + QA Scenarios.

- [ ] 1. Create the canonical `video-downloader` skill skeleton in `.agents`

  **What to do**: Create `.agents/skills/video-downloader/SKILL.md` as the canonical source file. Follow the exact single-file skill pattern used by `find-skills`, with YAML frontmatter at the top and markdown body below it. Set `name: video-downloader`, write a concise description covering YouTube + TikTok URL downloads, and include these top-level sections in order: `# Video Downloader`, `## When to Use This Skill`, `## Supported Scope`, `## Prerequisites`, `## Quick Start`, `## Command Recipes`, `## Output Contract`, `## Failure Handling`, `## Legal / ToS Notes`, `## Verified Test URLs`.
  **Must NOT do**: Do not add helper scripts, package manifests, or multi-file skill assets. Do not create content in only one agent directory and forget the canonical mirror plan.

  **Recommended Agent Profile**:
  - Category: `writing` — Reason: this is a precision markdown-authoring task with strong structure requirements.
  - Skills: [`skill-creator`] — Use it to shape the skill wording, sections, and trigger descriptions.
  - Omitted: [`playwright`] — No browser UI is involved.

  **Parallelization**: Can Parallel: NO | Wave 1 | Blocks: 2, 3, 4, 5, 6, 7 | Blocked By: none

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `.agents/skills/find-skills/SKILL.md:1-4` — canonical YAML frontmatter layout.
  - Pattern: `.agents/skills/find-skills/SKILL.md:6-20` — heading and “when to use” tone/structure.
  - Pattern: `.agents/skills/find-skills/SKILL.md:21-32` — command-oriented explanation style.
  - Pattern: `.agents/skills/find-skills/SKILL.md:126-142` — explicit fallback/next-step guidance style.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `.agents/skills/video-downloader/SKILL.md` exists.
  - [ ] The file begins with valid YAML frontmatter containing `name: video-downloader`.
  - [ ] All required section headings listed in this task exist in the file in the specified order.
  - [ ] The description explicitly mentions YouTube and TikTok.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Canonical skill skeleton present
    Tool: Bash
    Steps: python - <<'PY'
from pathlib import Path
text = Path('.agents/skills/video-downloader/SKILL.md').read_text(encoding='utf-8')
required = [
  'name: video-downloader',
  '# Video Downloader',
  '## When to Use This Skill',
  '## Supported Scope',
  '## Prerequisites',
  '## Quick Start',
  '## Command Recipes',
  '## Output Contract',
  '## Failure Handling',
  '## Legal / ToS Notes',
  '## Verified Test URLs',
]
missing = [item for item in required if item not in text]
assert not missing, missing
print('ok')
PY
    Expected: Script exits 0 and prints `ok`.
    Evidence: .sisyphus/evidence/task-1-skill-skeleton.txt

  Scenario: Frontmatter is malformed
    Tool: Bash
    Steps: python - <<'PY'
from pathlib import Path
text = Path('.agents/skills/video-downloader/SKILL.md').read_text(encoding='utf-8').splitlines()
assert text[0].strip() == '---'
assert any(line.strip() == 'name: video-downloader' for line in text[:8])
assert text[:8].count('---') >= 2
print('frontmatter-ok')
PY
    Expected: Script exits 0 and prints `frontmatter-ok`; any missing delimiter fails the task.
    Evidence: .sisyphus/evidence/task-1-skill-frontmatter.txt
  ```

  **Commit**: NO | Message: `docs(skills): scaffold video-downloader skill` | Files: `.agents/skills/video-downloader/SKILL.md`

- [ ] 2. Add Windows-first prerequisite and installation guidance for `yt-dlp` and FFmpeg

  **What to do**: In the canonical `.agents` skill file, make the Windows-first dependency path explicit. Prefer standalone `yt-dlp.exe` plus FFmpeg on `PATH`, then document a pip-based fallback only as a secondary option. Include exact verification commands (`yt-dlp --version`, `ffmpeg -version`) and a short rule telling the executor to stop immediately if either dependency check fails.
  **Must NOT do**: Do not require Python as the primary setup path. Do not imply FFmpeg is optional for best-quality muxing. Do not document cookies, browser exports, or subtitle flags.

  **Recommended Agent Profile**:
  - Category: `writing` — Reason: dependency instructions must be exact and unambiguous.
  - Skills: [`skill-creator`] — Use it to keep the instructions concise and executable.
  - Omitted: [`playwright`] — This is CLI dependency setup, not UI testing.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 6, 8 | Blocked By: 1

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `.agents/skills/find-skills/SKILL.md:21-32` — concise command-list presentation style.
  - Pattern: `.agents/skills/find-skills/SKILL.md:96-104` — explicit install-command formatting.
  - Repo context: `package.json:6-15` — repo has no existing test script; validation must be command-driven.

  **Acceptance Criteria** (agent-executable only):
  - [ ] The `## Prerequisites` section names `yt-dlp` and FFmpeg explicitly.
  - [ ] The canonical skill lists standalone binary setup as the primary Windows path.
  - [ ] The canonical skill includes `yt-dlp --version` and `ffmpeg -version` verification commands.
  - [ ] The canonical skill states that download execution must stop if dependency verification fails.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Dependency commands are documented exactly
    Tool: Bash
    Steps: python - <<'PY'
from pathlib import Path
text = Path('.agents/skills/video-downloader/SKILL.md').read_text(encoding='utf-8')
required = ['yt-dlp --version', 'ffmpeg -version', 'yt-dlp.exe']
missing = [item for item in required if item not in text]
assert not missing, missing
print('deps-doc-ok')
PY
    Expected: Script exits 0 and prints `deps-doc-ok`.
    Evidence: .sisyphus/evidence/task-2-dependency-docs.txt

  Scenario: Dependency verification fails on missing binary
    Tool: Bash
    Steps: python - <<'PY'
import shutil
missing = [name for name in ('yt-dlp', 'ffmpeg') if shutil.which(name) is None and shutil.which(f'{name}.exe') is None]
print('missing=' + ','.join(missing) if missing else 'missing=none')
PY
    Expected: If any binary is missing, the evidence file clearly records the missing tool and the skill instructs the executor to stop before attempting a download.
    Evidence: .sisyphus/evidence/task-2-dependency-check.txt
  ```

  **Commit**: NO | Message: `docs(skills): document yt-dlp prerequisites` | Files: `.agents/skills/video-downloader/SKILL.md`

- [ ] 3. Add exact command recipes for single URL, custom filename, metadata-only, audio-only, and batch downloads

  **What to do**: Populate `## Quick Start` and `## Command Recipes` with copy-pasteable Windows-friendly commands. Include one recipe each for: single public video download, metadata-only inspection (`--dump-single-json --skip-download`), custom filename/output template, audio-only export (`-x --audio-format mp3`), and batch download using a UTF-8 text file with one URL per line (`-a urls.txt`). Standardize variables as `$Url`, `$OutputDir`, `$NameTemplate`, and `$BatchFile` in PowerShell examples.
  **Must NOT do**: Do not include playlist/channel scraping beyond explicit batch URL file input. Do not use vague placeholders like `<some options here>`. Do not add subtitle flags or cookie flags.

  **Recommended Agent Profile**:
  - Category: `writing` — Reason: this is executable command authoring, not code implementation.
  - Skills: [`skill-creator`] — Use it to keep commands teachable and consistent.
  - Omitted: [`playwright`] — CLI workflow only.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 6, 8 | Blocked By: 1

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `.agents/skills/find-skills/SKILL.md:25-31` — succinct command list layout.
  - Pattern: `.agents/skills/find-skills/SKILL.md:56-64` — example-driven command explanation style.
  - External: `https://github.com/yt-dlp/yt-dlp#output-template` — output template variables and naming rules.
  - External: `https://github.com/yt-dlp/yt-dlp/wiki/FAQ` — metadata and common CLI flag behavior.

  **Acceptance Criteria** (agent-executable only):
  - [ ] The canonical skill contains five separate recipes: single URL, metadata-only, custom filename, audio-only, and batch URLs.
  - [ ] Each recipe uses concrete PowerShell variables and an exact `yt-dlp` command.
  - [ ] Batch mode is documented as a text-file workflow, not a playlist/channel promise.
  - [ ] Metadata-only mode uses `--dump-single-json` and `--skip-download`.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: All required recipes are present
    Tool: Bash
    Steps: python - <<'PY'
from pathlib import Path
text = Path('.agents/skills/video-downloader/SKILL.md').read_text(encoding='utf-8')
required = [
  '--dump-single-json',
  '--skip-download',
  '--audio-format mp3',
  '-a $BatchFile',
  '$NameTemplate',
  '$OutputDir',
]
missing = [item for item in required if item not in text]
assert not missing, missing
print('recipes-ok')
PY
    Expected: Script exits 0 and prints `recipes-ok`.
    Evidence: .sisyphus/evidence/task-3-command-recipes.txt

  Scenario: Batch recipe accidentally promises playlists
    Tool: Bash
    Steps: python - <<'PY'
from pathlib import Path
text = Path('.agents/skills/video-downloader/SKILL.md').read_text(encoding='utf-8').lower()
forbidden = ['playlist download', 'channel download', 'download entire channel']
assert not any(item in text for item in forbidden)
print('no-playlist-creep')
PY
    Expected: Script exits 0 and prints `no-playlist-creep`.
    Evidence: .sisyphus/evidence/task-3-scope-guard.txt
  ```

  **Commit**: NO | Message: `docs(skills): add video-downloader command recipes` | Files: `.agents/skills/video-downloader/SKILL.md`

- [ ] 4. Define supported URL rules, local output defaults, and the returned-result contract

  **What to do**: In `## Supported Scope` and `## Output Contract`, make the rules explicit. Support only public YouTube watch/shorts/youtu.be URLs and public TikTok video/share URLs. Set the default output directory to `$env:USERPROFILE\Downloads\video-downloader`, allow override via `$OutputDir`, and require the skill to return: source URL, normalized platform, saved file path, final filename, and key metadata fields (title, uploader/channel, duration when available, extractor/platform, and whether the operation was download vs metadata-only).
  **Must NOT do**: Do not promise private videos, cookies, region bypass, livestream capture, photos/slideshows, or subtitle extraction. Do not route output into the repo by default.

  **Recommended Agent Profile**:
  - Category: `writing` — Reason: this task locks user-visible behavior and prevents ambiguity.
  - Skills: [`skill-creator`] — Use it to encode clear decision rules in the skill text.
  - Omitted: [`playwright`] — No UI involved.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 6, 8 | Blocked By: 1

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `server/youtubeBenchmarkProxyCore.mjs:21-62` — explicit YouTube URL parsing and rejection rules.
  - Pattern: `server/youtubeBenchmarkProxyCore.mjs:127-169` — structured success/error response shape and warning style.
  - Pattern: `server/mediaProxyServer.mjs:45-72` — validation-before-execution mindset.
  - Pattern: `services/youtubeBenchmarkService.ts:15-37` — compact typed metadata contract structure.

  **Acceptance Criteria** (agent-executable only):
  - [ ] The canonical skill names exactly which public URL families are supported.
  - [ ] The canonical skill sets `$env:USERPROFILE\Downloads\video-downloader` as the default output directory.
  - [ ] The canonical skill documents the returned-result fields required after each run.
  - [ ] The canonical skill explicitly excludes private videos, cookies, subtitles, and non-video TikTok content.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Output contract and default directory are documented
    Tool: Bash
    Steps: python - <<'PY'
from pathlib import Path
text = Path('.agents/skills/video-downloader/SKILL.md').read_text(encoding='utf-8')
required = [
  '$env:USERPROFILE\\Downloads\\video-downloader',
  'source URL',
  'saved file path',
  'final filename',
  'metadata-only',
]
missing = [item for item in required if item not in text]
assert not missing, missing
print('output-contract-ok')
PY
    Expected: Script exits 0 and prints `output-contract-ok`.
    Evidence: .sisyphus/evidence/task-4-output-contract.txt

  Scenario: Unsupported scope exclusions are missing
    Tool: Bash
    Steps: python - <<'PY'
from pathlib import Path
text = Path('.agents/skills/video-downloader/SKILL.md').read_text(encoding='utf-8').lower()
required = ['public videos only', 'no cookies', 'no subtitles', 'no tiktok photos']
missing = [item for item in required if item not in text]
assert not missing, missing
print('scope-locks-ok')
PY
    Expected: Script exits 0 and prints `scope-locks-ok`.
    Evidence: .sisyphus/evidence/task-4-scope-locks.txt
  ```

  **Commit**: NO | Message: `docs(skills): define downloader output contract` | Files: `.agents/skills/video-downloader/SKILL.md`

- [ ] 5. Add troubleshooting, error interpretation, and legal/ToS guardrails

  **What to do**: Fill `## Failure Handling` and `## Legal / ToS Notes` with explicit decision rules. Cover: unsupported URL, missing dependencies, TikTok 403/anti-bot failures, HTTP 429/backoff, metadata-only fallback, and a short caution that the operator must have permission to download the content and respect platform ToS/copyright rules. Make the V1 rule explicit: if a public TikTok URL fails because it appears to need cookies or auth, stop and report “out of scope for V1” instead of inventing a workaround.
  **Must NOT do**: Do not include workaround instructions for cookies/private videos. Do not make absolute legal claims like “this is legal” or “this is illegal in all cases”. Do not mention subtitle troubleshooting.

  **Recommended Agent Profile**:
  - Category: `writing` — Reason: guardrails and failure messaging must be consistent and non-speculative.
  - Skills: [`skill-creator`] — Use it to sharpen decision rules and stop conditions.
  - Omitted: [`playwright`] — Failure handling here is CLI/documentation oriented.

  **Parallelization**: Can Parallel: YES | Wave 1 | Blocks: 6, 8 | Blocked By: 1

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `server/youtubeBenchmarkProxyCore.mjs:15-19` — concise warning-message style.
  - Pattern: `server/youtubeBenchmarkProxyCore.mjs:156-169` — success/error envelope and fallback phrasing.
  - Pattern: `server/mediaProxyServer.mjs:111-145` — timeout and upstream-failure handling style.
  - External: `https://github.com/yt-dlp/yt-dlp/wiki/FAQ` — common 403/429/format failure patterns.

  **Acceptance Criteria** (agent-executable only):
  - [ ] The canonical skill has a stop rule for missing `yt-dlp`/FFmpeg.
  - [ ] The canonical skill explains TikTok 403/anti-bot failure as a known V1 limitation when auth/cookies are required.
  - [ ] The canonical skill includes a short permission/ToS/copyright caution.
  - [ ] The canonical skill never documents cookies or private-video workarounds.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Failure-handling guidance exists for all major cases
    Tool: Bash
    Steps: python - <<'PY'
from pathlib import Path
text = Path('.agents/skills/video-downloader/SKILL.md').read_text(encoding='utf-8').lower()
required = ['403', '429', 'out of scope for v1', 'permission', 'tos', 'copyright']
missing = [item for item in required if item not in text]
assert not missing, missing
print('failure-guide-ok')
PY
    Expected: Script exits 0 and prints `failure-guide-ok`.
    Evidence: .sisyphus/evidence/task-5-failure-guide.txt

  Scenario: Cookie workaround leaked into V1 docs
    Tool: Bash
    Steps: python - <<'PY'
from pathlib import Path
text = Path('.agents/skills/video-downloader/SKILL.md').read_text(encoding='utf-8').lower()
forbidden = ['cookies.txt', '--cookies', 'browser export cookies', 'private video support']
assert not any(item in text for item in forbidden)
print('no-cookie-workaround')
PY
    Expected: Script exits 0 and prints `no-cookie-workaround`.
    Evidence: .sisyphus/evidence/task-5-no-cookie-workaround.txt
  ```

  **Commit**: NO | Message: `docs(skills): add downloader guardrails and failure modes` | Files: `.agents/skills/video-downloader/SKILL.md`

- [ ] 6. Add fixed verified examples and an evidence-producing QA playbook to the canonical skill

  **What to do**: Populate `## Verified Test URLs` with two exact public fixtures and their intended uses: YouTube metadata/download fixture `https://www.youtube.com/watch?v=dQw4w9WgXcQ` and TikTok metadata/download fixture `https://www.tiktok.com/@tiktok/video/7505091006149283103`. Add copy-pasteable validation steps that write evidence into `.sisyphus/evidence/`, including: metadata-only validation, real video download into `$OutputDir`, audio-only export, and batch-file validation using those two URLs. Make the evidence filenames explicit so later validation is deterministic.
  **Must NOT do**: Do not add “replace with your own URL” as the primary verification path. Do not invent additional fixtures unless one of these URLs is proven dead during execution and the replacement is recorded in the same section before further testing.

  **Recommended Agent Profile**:
  - Category: `writing` — Reason: the QA playbook must be deterministic and reproducible.
  - Skills: [`skill-creator`] — Use it to keep the examples executable and concise.
  - Omitted: [`playwright`] — No UI interactions are required.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: 7, 8 | Blocked By: 2, 3, 4, 5

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `.agents/skills/find-skills/SKILL.md:83-104` — example-response + install/next-step formatting style.
  - External: `https://www.youtube.com/watch?v=dQw4w9WgXcQ` — fixed public YouTube fixture for V1 QA.
  - External: `https://www.tiktok.com/@tiktok/video/7505091006149283103` — fixed public TikTok fixture for V1 QA.

  **Acceptance Criteria** (agent-executable only):
  - [ ] `## Verified Test URLs` contains the exact YouTube and TikTok fixtures above.
  - [ ] The canonical skill includes evidence-producing commands for metadata-only, real download, audio-only, and batch validation.
  - [ ] The canonical skill states how to replace a dead fixture without introducing ambiguity.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Fixed public fixtures are present
    Tool: Bash
    Steps: python - <<'PY'
from pathlib import Path
text = Path('.agents/skills/video-downloader/SKILL.md').read_text(encoding='utf-8')
required = [
  'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
  'https://www.tiktok.com/@tiktok/video/7505091006149283103',
  '.sisyphus/evidence/',
]
missing = [item for item in required if item not in text]
assert not missing, missing
print('fixtures-ok')
PY
    Expected: Script exits 0 and prints `fixtures-ok`.
    Evidence: .sisyphus/evidence/task-6-fixtures.txt

  Scenario: Fixture replacement rule is ambiguous
    Tool: Bash
    Steps: python - <<'PY'
from pathlib import Path
text = Path('.agents/skills/video-downloader/SKILL.md').read_text(encoding='utf-8').lower()
required = ['if a fixture is dead', 'record the replacement in this section before testing continues']
missing = [item for item in required if item not in text]
assert not missing, missing
print('fixture-replacement-rule-ok')
PY
    Expected: Script exits 0 and prints `fixture-replacement-rule-ok`.
    Evidence: .sisyphus/evidence/task-6-fixture-replacement-rule.txt
  ```

  **Commit**: NO | Message: `docs(skills): add fixed downloader qa fixtures` | Files: `.agents/skills/video-downloader/SKILL.md`

- [ ] 7. Mirror the finalized canonical skill into every other agent-skill directory and verify parity

  **What to do**: After `.agents/skills/video-downloader/SKILL.md` is complete, copy its exact contents into `.claude/skills/video-downloader/SKILL.md`, `.trae/skills/video-downloader/SKILL.md`, `.iflow/skills/video-downloader/SKILL.md`, and `.agent/skills/video-downloader/SKILL.md`. Then verify all five files are byte-identical using file hashes. Treat `.agents` as the source of truth.
  **Must NOT do**: Do not hand-edit mirrored copies separately. Do not allow wording drift across agent directories. Do not skip hash verification.

  **Recommended Agent Profile**:
  - Category: `quick` — Reason: this is straightforward file mirroring plus deterministic verification.
  - Skills: [] — No special skill is required beyond exact copying.
  - Omitted: [`skill-creator`] — Authoring is finished; this is now parity enforcement.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: 8 | Blocked By: 1, 2, 3, 4, 5, 6

  **References** (executor has NO interview context — be exhaustive):
  - Pattern: `.agents/skills/find-skills/SKILL.md:1-142` — source skill content shape to mirror across agent directories.
  - Repo fact: existing skill layout is mirrored across `.agents`, `.claude`, `.trae`, `.iflow`, and `.agent`.

  **Acceptance Criteria** (agent-executable only):
  - [ ] All five `video-downloader/SKILL.md` files exist.
  - [ ] All five file hashes match exactly.
  - [ ] The mirrored files have the same byte length.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: All mirrored files are present and identical
    Tool: Bash
    Steps: python - <<'PY'
from pathlib import Path
from hashlib import sha256
paths = [
  '.agents/skills/video-downloader/SKILL.md',
  '.claude/skills/video-downloader/SKILL.md',
  '.trae/skills/video-downloader/SKILL.md',
  '.iflow/skills/video-downloader/SKILL.md',
  '.agent/skills/video-downloader/SKILL.md',
]
hashes = []
for path in paths:
  data = Path(path).read_bytes()
  hashes.append((path, len(data), sha256(data).hexdigest()))
assert len({h for _, _, h in hashes}) == 1, hashes
assert len({n for _, n, _ in hashes}) == 1, hashes
print('mirror-ok')
PY
    Expected: Script exits 0 and prints `mirror-ok`.
    Evidence: .sisyphus/evidence/task-7-mirror-parity.txt

  Scenario: One mirror drifted from canonical content
    Tool: Bash
    Steps: python - <<'PY'
from pathlib import Path
canonical = Path('.agents/skills/video-downloader/SKILL.md').read_text(encoding='utf-8')
for path in [
  '.claude/skills/video-downloader/SKILL.md',
  '.trae/skills/video-downloader/SKILL.md',
  '.iflow/skills/video-downloader/SKILL.md',
  '.agent/skills/video-downloader/SKILL.md',
]:
  assert Path(path).read_text(encoding='utf-8') == canonical, path
print('no-drift')
PY
    Expected: Script exits 0 and prints `no-drift`; any mismatch fails the task.
    Evidence: .sisyphus/evidence/task-7-no-drift.txt
  ```

  **Commit**: NO | Message: `docs(skills): mirror video-downloader across agent directories` | Files: `.agents/...`, `.claude/...`, `.trae/...`, `.iflow/...`, `.agent/...`

- [ ] 8. Execute command-driven validation on Windows and capture evidence for success and failure paths

  **What to do**: Run the documented commands from the finalized skill and capture outputs in `.sisyphus/evidence/`. Use the fixed YouTube and TikTok fixtures from Task 6. Validate four success paths: metadata-only on both fixtures, real video download on at least one fixture, audio-only export on the YouTube fixture, and batch-file processing using both fixtures. Also validate two failure paths: unsupported YouTube URL shape (for example `https://www.youtube.com/@YouTube`) and missing-dependency handling if either `yt-dlp` or FFmpeg is absent. Save all command output and resulting file paths in evidence logs.
  **Must NOT do**: Do not silently skip TikTok validation. Do not replace failure-path checks with prose. Do not treat a private/auth-gated failure as a V1 success.

  **Recommended Agent Profile**:
  - Category: `unspecified-low` — Reason: this is CLI verification with external tooling and evidence capture.
  - Skills: [] — The commands are already defined by the canonical skill.
  - Omitted: [`playwright`] — Browser automation is unnecessary for CLI download validation.

  **Parallelization**: Can Parallel: NO | Wave 2 | Blocks: F1, F2, F3, F4 | Blocked By: 2, 3, 4, 5, 6, 7

  **References** (executor has NO interview context — be exhaustive):
  - Canonical skill: `.agents/skills/video-downloader/SKILL.md` — source of truth for exact commands.
  - External fixture: `https://www.youtube.com/watch?v=dQw4w9WgXcQ` — public YouTube validation target.
  - External fixture: `https://www.tiktok.com/@tiktok/video/7505091006149283103` — public TikTok validation target.
  - Pattern: `package.json:6-15` — no formal repo test runner; store proof in evidence files.

  **Acceptance Criteria** (agent-executable only):
  - [ ] Metadata-only validation succeeds for both fixtures and produces evidence files.
  - [ ] At least one real download succeeds and records the saved file path.
  - [ ] Audio-only export succeeds for the YouTube fixture and records the generated audio path.
  - [ ] Batch processing reads a UTF-8 file containing both fixtures and produces evidence.
  - [ ] Unsupported-URL validation fails with the documented rejection guidance.
  - [ ] Missing-dependency validation is either executed directly or recorded as N/A with proof that both binaries are present.

  **QA Scenarios** (MANDATORY — task incomplete without these):
  ```
  Scenario: Happy path validation across metadata, download, audio, and batch flows
    Tool: Bash
    Steps: powershell -NoProfile -Command "$OutputDir = Join-Path $env:TEMP 'video-downloader-plan-check'; New-Item -ItemType Directory -Force -Path '.sisyphus/evidence' | Out-Null; New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null; $YouTubeUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'; $TikTokUrl = 'https://www.tiktok.com/@tiktok/video/7505091006149283103'; yt-dlp --dump-single-json --skip-download $YouTubeUrl | Out-File '.sisyphus/evidence/task-8-youtube-metadata.json' -Encoding utf8; yt-dlp --dump-single-json --skip-download $TikTokUrl | Out-File '.sisyphus/evidence/task-8-tiktok-metadata.json' -Encoding utf8; yt-dlp -P $OutputDir -o '%(title)s-%(id)s.%(ext)s' $YouTubeUrl | Tee-Object -FilePath '.sisyphus/evidence/task-8-youtube-download.log'; yt-dlp -x --audio-format mp3 -P $OutputDir -o '%(title)s-%(id)s.%(ext)s' $YouTubeUrl | Tee-Object -FilePath '.sisyphus/evidence/task-8-audio-only.log'; Set-Content -Path '.sisyphus/evidence/task-8-batch-urls.txt' -Value @($YouTubeUrl,$TikTokUrl) -Encoding utf8; yt-dlp -a '.sisyphus/evidence/task-8-batch-urls.txt' --skip-download --dump-single-json | Out-File '.sisyphus/evidence/task-8-batch-metadata.json' -Encoding utf8"
    Expected: All commands exit 0; evidence files exist; the download log includes a final saved file path.
    Evidence: .sisyphus/evidence/task-8-youtube-download.log

  Scenario: Unsupported URL and missing-dependency handling
    Tool: Bash
    Steps: powershell -NoProfile -Command "$BadUrl = 'https://www.youtube.com/@YouTube'; $Yt = (Get-Command yt-dlp -ErrorAction SilentlyContinue); $Ff = (Get-Command ffmpeg -ErrorAction SilentlyContinue); if (-not $Yt -or -not $Ff) { 'missing dependency detected' | Out-File '.sisyphus/evidence/task-8-missing-dependency.log' -Encoding utf8 } ; yt-dlp --skip-download --dump-single-json $BadUrl 2>&1 | Out-File '.sisyphus/evidence/task-8-unsupported-url.log' -Encoding utf8"
    Expected: The unsupported-URL log contains a non-success rejection; if a binary is missing, the missing-dependency evidence file exists and the executor stops further download attempts until fixed.
    Evidence: .sisyphus/evidence/task-8-unsupported-url.log
  ```

  **Commit**: YES | Message: `docs(skills): add video-downloader skill for youtube and tiktok` | Files: `.agents/...`, `.claude/...`, `.trae/...`, `.iflow/...`, `.agent/...`, `.sisyphus/evidence/...`

## Final Verification Wave (MANDATORY — after ALL implementation tasks)
> 4 review agents run in PARALLEL. ALL must APPROVE. Present consolidated results to user and get explicit "okay" before completing.
> **Do NOT auto-proceed after verification. Wait for user's explicit approval before marking work complete.**
> **Never mark F1-F4 as checked before getting user's okay.** Rejection or user feedback -> fix -> re-run -> present again -> wait for okay.
- [ ] F1. Plan Compliance Audit — oracle
- [ ] F2. Code Quality Review — unspecified-high
- [ ] F3. Real Manual QA — unspecified-high (+ playwright if UI)
- [ ] F4. Scope Fidelity Check — deep

## Commit Strategy
- Single commit recommended after canonical authoring, mirroring, and verification complete.
- Suggested commit message: `docs(skills): add video-downloader skill for youtube and tiktok`
- Do not create intermediate commits until mirrored files and QA evidence are complete.

## Success Criteria
- A fresh agent can open any mirrored `SKILL.md`, follow it on Windows, and complete public YouTube/TikTok downloads without guessing missing dependencies or command syntax.
- The skill text clearly states what is supported, what is out of scope, and how failures should be interpreted.
- Mirrored skill files are byte-identical across all five agent directories.
- QA evidence demonstrates at least one successful YouTube flow, one successful TikTok flow, one audio-only flow, one batch-input flow, and one failure-path flow.
