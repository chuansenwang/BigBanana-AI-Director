---
name: storyboard-prompt-reconstruction
description: Reconstruct reusable prompt text from the first, middle, last, and optional turning-point frame images emitted by storyboard-timecode-slicing, then export the results to CSV. Use this skill whenever the user wants to 反推提示词、把切片后的首帧/中间帧/尾帧整理成 prompt 表、从 manifest+frames 回填分镜提示词，even if they only ask for “把这些分镜图写成 csv”.
---

# Storyboard Prompt Reconstruction

Use this skill **after** `storyboard-timecode-slicing` when the user wants to backfill prompt-like descriptions from exported frame images rather than cut video.

This skill is evidence-first and contract-first. It reconstructs **visually supported prompt text**, not the exact hidden original prompt. Its job is to turn `manifest.json` + frame files into a stable prompt analysis JSON and a flat CSV that can be reused in downstream generation workflows.

## When to use

Use this skill whenever the user asks to:

- reverse-engineer prompts from storyboard frame exports
- 反推 `storyboard-timecode-slicing` 输出的首帧 / 中间帧 / 尾帧提示词
- turn `manifest.json` + `frames/` into a prompt spreadsheet or CSV
- recover shot prompts from sliced clips when the original prompt sheet is missing
- backfill prompt text for downstream image/video regeneration from frame evidence

Do not use this skill for fresh storyboard writing, whole-video downloading, or exact source-prompt forensics where the user expects impossible certainty.

## Inputs

Required:

1. `manifest_path`
2. `output_dir`

Optional:

- `prompt_language` — `en` or `zh` (default `en`)
- `include_turning_points` — whether to include FFmpeg turning-point keyframes when they exist
- upstream context such as an old shot table, continuity bible, or style brief

Prefer direct evidence in this order:

1. `manifest.json`
2. first / representative middle / last frame images
3. optional turning-point frames from `manifest.shots[*].enrichment.turning_points`
4. preserved source-row metadata from the storyboard table
5. optional human hints

If optional hints conflict with what is visible in the images, prefer the image evidence and record a warning.

## Runtime workflow

Follow this sequence:

1. Verify that `manifest_path` exists and looks like a `storyboard-timecode-slicing` manifest.
2. Generate a deterministic scaffold JSON:

```powershell
py ".\.agents\skills\storyboard-prompt-reconstruction\scripts\build_analysis_scaffold.py" `
  --manifest $ManifestPath `
  --output "$OutputDir\prompt-reconstruction.json" `
  --language en `
  --include-turning-points
```

3. Read each shot's available frame evidence.
4. Reconstruct only what the images actually support:
   - one reusable `combined_prompt`
   - one `first_frame_prompt`
   - one `middle_frame_prompt` when middle evidence exists
   - one `last_frame_prompt`
   - one `transition_summary`
   - optional `negative_prompt`
   - concise `continuity_notes`
5. Use `source_row` metadata only to preserve known labels or names. Do not invent unseen details.
6. Keep wording generation-friendly. Default to English-friendly prompt phrasing unless the user explicitly wants Chinese prompt text.
7. Save the completed JSON analysis.

Important: the scaffold script only creates a draft JSON. Before CSV export, fill every analyzable `shots[*].reconstruction` block with real prompt text and change its status from `pending` to `ok`, `partial`, or `skipped`.

8. Render the flat CSV:

```powershell
py ".\.agents\skills\storyboard-prompt-reconstruction\scripts\build_prompt_csv.py" `
  --input "$OutputDir\prompt-reconstruction.json" `
  --output "$OutputDir\prompt-reconstruction.csv"
```

9. Return a short result summary with status, warnings, shot counts, and the two output paths.

If any analyzable row is still `pending`, stop before CSV export and finish the reconstruction first.

## Output contract

Always treat `references/contract.md` as the source of truth.

Required outputs:

1. `output_dir\prompt-reconstruction.json`
2. `output_dir\prompt-reconstruction.csv`

The CSV must preserve enough metadata to map each prompt row back to the original sliced shot.

## Required behavior

- Reconstruct **prompt-like** text, not fictional certainty about the hidden original prompt.
- Prefer visible evidence: subject, environment, composition, camera distance/angle, lighting, motion state, color, style, continuity.
- Keep prompts reusable for downstream generation rather than writing prose captions.
- If multiple middle frames exist, use `middle_frame_path` as the primary midpoint and `middle_frame_paths` as supporting evidence.
- If turning-point frames exist and the user wants deeper temporal coverage, use them as additive evidence only.
- Distinguish locked facts from guesses using `warnings` and `missing_details`.
- Preserve row order and shot identity from the manifest.

## Status rules

- `ok`: the shot has usable frame evidence and the combined prompt plus relevant per-frame prompts are filled.
- `partial`: some prompt fields are degraded because evidence is weak or incomplete, but the row is still usable.
- `skipped`: the shot cannot be reconstructed meaningfully because usable frame evidence is missing.
- `failed`: the manifest or required files are unreadable enough that the run cannot proceed.

Top-level run status may be:

- `pending`: scaffold generated but prompts not yet filled
- `ok`: all analyzable rows are reconstructed cleanly
- `partial`: at least one row is degraded or skipped, but useful CSV output exists
- `failed`: the run cannot produce a meaningful prompt sheet

## Fallback policy

- Missing middle frame: still write combined + first + last prompt and mark the row `partial` if the transition is now weak.
- Missing first or last frame on a row: use any remaining evidence, but mark the row `partial` or `skipped` instead of faking certainty.
- No turning points: continue normally; they are additive.
- Weak image evidence: use generic visual terms and record what is missing.
- Conflicting source metadata: preserve the metadata but warn when it disagrees with what is visible.

## References

- `references/contract.md` — canonical JSON + CSV field contract and status semantics
- `references/reconstruction-rules.md` — rules for inferring prompt text from frame evidence without overclaiming
- `assets/sample-completed-analysis.json` — example of finished `ok` / `partial` / `skipped` rows
- `scripts/build_analysis_scaffold.py` — deterministic JSON scaffold generator from manifest input
- `scripts/build_prompt_csv.py` — deterministic CSV renderer and contract validator
