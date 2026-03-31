---
name: storyboard-timecode-slicing
description: Slice one local source video into storyboard-defined clips from a timecode sheet, then export each clip's first frame, configurable middle reference frames, last frame, and a machine-readable manifest. Use this skill whenever the user wants to cut a video by 分镜/镜头表/时间码表, 批量导出镜头片段, 生成每段首帧中间帧尾帧图, or turn a CSV or Markdown shot table into clip files and frame stills on Windows. If the user wants optional scene-change hints inside each clip, this skill can also add soft scenedetect enrichment without changing the storyboard cut boundaries.
---

# Storyboard Timecode Slicing

Use this skill to process **one local source video** with **one timecode sheet** and write deterministic output artifacts to a local folder.

This skill is Windows-first, FFmpeg-based, and contract-first. It does not download videos, edit the source file in place, or guess missing timecodes.

## When to use

Use this skill whenever the user asks to:

- 根据时间码表切割视频
- 按镜头表/分镜表批量导出视频片段
- 从每个片段提取首帧、可配置数量的中间参考帧和尾帧
- 把 CSV 分镜表或 Markdown 表格变成 clips + frames + manifest
- 检查一个时间码表是否能稳定切片
- 在不改动 storyboard 切点的前提下，为片段补充可选的 scenedetect 子镜头提示

Do not use this skill for multi-source timelines, subtitle burning, downloading remote videos, or replacing a storyboard sheet with fully automatic scene detection.

## Supported scope

V1 supports:

- one local source video file
- one UTF-8 CSV timecode sheet
- or one Markdown table with canonical columns
- one output directory
- default accurate re-encode clipping
- default first + one middle + last frame extraction from each generated clip, with configurable middle-frame count
- optional scenedetect-based sub-scene enrichment that never overrides the requested clip boundaries
- optional fast-copy clipping only when the user explicitly accepts keyframe-limited boundaries

V1 does not support:

- `.xlsx` directly
- multiple source videos in one run
- SMPTE `HH:MM:SS:FF` unless the operator explicitly normalizes it first
- silent clamping or auto-fixing invalid rows

## Inputs

Required:

1. `video_path`
2. `sheet_path`
3. `output_dir`

Optional:

- `clip_mode`: `accurate` or `fast-copy`
- `ffmpeg_bin`
- `ffprobe_bin`
- `enable_scenedetect`
- `scenedetect_detector` (currently `content`)
- `middle_frames` (default `1`)
- `enable_turning_points`
- `turning_point_threshold`
- `turning_point_min_gap_seconds`
- `turning_point_max_points`
- `turning_point_edge_margin_seconds`
- `turning_point_short_clip_max_points`

The sheet must contain these columns:

- `shot_number`
- `start_time`
- `end_time`

Optional columns may include `title`, `notes`, `scene`, `speaker`, or other metadata. The scripts preserve them into the manifest when present.

## Prerequisites

Before any slicing run:

1. Verify FFmpeg and FFprobe are available.
2. Confirm the source video path exists.
3. Confirm the sheet path exists and is either `.csv`, `.md`, or `.markdown`.
4. Create the output directory.

Optional enhancement dependency:

- Install `scenedetect` only if the operator wants sub-scene hints.
- If `scenedetect` is absent, the skill must still succeed with FFmpeg-only outputs.

Verification commands:

```powershell
ffmpeg -version
ffprobe -version
```

Stop immediately if either dependency check fails.

## Runtime workflow

Follow this sequence:

1. Preflight the environment and inputs.
2. Parse and normalize the timecode sheet.
3. Validate required columns, time syntax, and `[start, end)` intervals.
4. Build deterministic base names using shot number + normalized timecode.
5. Slice clips into `output_dir\clips\`.
6. Write or update `output_dir\manifest.json`.
7. Extract first, configurable middle, and last frame images from the generated clips into `output_dir\frames\`.
8. If requested and available, add scenedetect-based sub-scene metadata and representative hint frames without changing the requested clip boundaries.
9. If requested, add FFmpeg-based turning-point keyframes and clip-relative timestamps into `output_dir\keyframes\` and `output_dir\keyframes.json`.
10. Validate the manifest and artifact paths.
11. Return a short result summary with run status, counts, warnings, and the key paths.

## Command recipes

Set variables first:

```powershell
$VideoPath = "C:\path\to\source.mp4"
$SheetPath = "C:\path\to\shots.csv"
$OutputDir = "C:\path\to\storyboard-output"
```

### 1. Slice clips and create manifest

```powershell
py ".\.agents\skills\storyboard-timecode-slicing\scripts\slice_video.py" `
  --video $VideoPath `
  --sheet $SheetPath `
  --output-dir $OutputDir `
  --mode accurate
```

### 2. Extract first, middle, and last frame images

```powershell
py ".\.agents\skills\storyboard-timecode-slicing\scripts\extract_frames.py" `
  --manifest "$OutputDir\manifest.json"
```

Increase the number of middle reference frames when the user wants denser motion coverage:

```powershell
py ".\.agents\skills\storyboard-timecode-slicing\scripts\extract_frames.py" `
  --manifest "$OutputDir\manifest.json" `
  --middle-frames 2
```

### 2b. Extract frames and add optional scenedetect hints

```powershell
py ".\.agents\skills\storyboard-timecode-slicing\scripts\extract_frames.py" `
  --manifest "$OutputDir\manifest.json" `
  --enable-scenedetect `
  --scenedetect-detector content
```

### 2c. Extract turning-point keyframes for 1:1 recreation

```powershell
py ".\.agents\skills\storyboard-timecode-slicing\scripts\extract_frames.py" `
  --manifest "$OutputDir\manifest.json" `
  --enable-turning-points `
  --turning-point-threshold 0.10 `
  --turning-point-min-gap-seconds 0.20 `
  --turning-point-max-points 6 `
  --turning-point-edge-margin-seconds 0.10 `
  --turning-point-short-clip-max-points 2
```

Use these turning-point controls when tuning for 1:1 recreation:

- raise `turning_point_threshold` when noise or tiny motion creates too many hits
- raise `turning_point_edge_margin_seconds` when first/last-frame-adjacent changes are not useful
- lower `turning_point_short_clip_max_points` when very short clips should keep only one strongest interior beat
- remember these are FFmpeg scene-score hints for visual turning moments, not guaranteed semantic beats

### 3. Validate the result

```powershell
py ".\.agents\skills\storyboard-timecode-slicing\scripts\validate_manifest.py" `
  --input "$OutputDir\manifest.json"
```

## Output contract

Always treat `references/contract.md` as the source of truth.

The required machine output is:

1. `output_dir\manifest.json`
2. `output_dir\clips\*.mp4`
3. `output_dir\frames\*_first.png`
4. `output_dir\frames\*_last.png`

The current implementation also emits these additive preview artifacts by default:

- `output_dir\frames\*_middle.png` when `--middle-frames 1`
- `output_dir\frames\*_middle01.png`, `*_middle02.png`, ... when `--middle-frames > 1`
- `output_dir\keyframes\*_turningNN_tX-XXX.png` when `--enable-turning-points` is used
- `output_dir\keyframes.json` with per-shot turning-point timestamps and frame paths

Optional machine-readable enrichment:

- `shots[*].middle_frame_path`
- `shots[*].middle_frame_paths`
- `shots[*].enrichment.scenedetect`
- `shots[*].enrichment.turning_points`

Human-facing summary should report:

- source video path
- sheet path
- output directory
- manifest path
- clip mode
- total shots
- ok / partial / failed counts
- notable warnings or failed rows

## Failure handling

Use these rules exactly:

- Missing FFmpeg or FFprobe: hard stop.
- Missing or unreadable source video: hard stop.
- Unsupported sheet type: hard stop.
- Missing required columns: hard stop.
- Unwritable output directory: hard stop.
- Naming collisions after normalization: hard stop.
- Invalid row time ranges or out-of-bounds times: continue row-by-row and mark the row `failed`.
- Required frame extraction failure after a clip exists: mark that row `partial`.
- Middle-frame or scenedetect enhancement issues should degrade with warnings whenever first/last artifacts still exist.
- Overlapping shots are allowed unless the user explicitly wants non-overlap validation.

Do not silently clamp times. Do not auto-renumber duplicates. Do not overwrite unexpected files without the operator opting in.

## Status model

- `ok`: the required artifacts exist for all valid rows (clip + first frame + last frame). Middle-frame export, including `--middle-frames > 1`, and scenedetect enrichment are best-effort additions.
- `partial`: some rows succeeded but one or more rows or frame artifacts degraded
- `failed`: the whole run could not proceed meaningfully

## References

- Read `references/contract.md` for the exact manifest fields and status semantics.
- Read `references/timecode-rules.md` for accepted sheet syntax and normalization rules.
- Read `references/eval-cases.md` for the first-pass regression scenarios.
- Use `assets/timecode-table.example.csv` and `assets/timecode-table.example.md` as operator-facing examples.
