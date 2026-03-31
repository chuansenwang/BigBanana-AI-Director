# Contract

## Purpose

This skill converts one local source video plus one canonical storyboard timecode table into:

- cut clip files
- first-frame images
- middle reference-frame images
- last-frame images
- one stable `manifest.json`

## Required inputs

- `video_path`
- `sheet_path`
- `output_dir`

## Supported sheet types

- UTF-8 `.csv`
- Markdown table in `.md` / `.markdown`

## Required sheet columns

- `shot_number`
- `start_time`
- `end_time`

## Optional sheet columns

Preserve any optional columns in the per-shot `source_row` object when present.

Common examples:

- `title`
- `notes`
- `scene`
- `speaker`

## Interval semantics

Treat every row as `[start_time, end_time)`.

- `start_time` is inclusive
- `end_time` is exclusive
- `end_time` must be strictly greater than `start_time`

## Run-level status model

- `ok`: all rows succeeded with clip + first frame + last frame
- `partial`: at least one row degraded or failed, but useful outputs exist
- `failed`: hard-stop preflight failure or no useful outputs were produced

## Per-shot status model

- `ok`: clip + first frame + last frame all exist
- `partial`: clip exists, but one or more frame artifacts failed
- `failed`: the row did not yield a usable clip

`middle_frame_path` and `middle_frame_paths` are additive preview metadata. They do not redefine the `ok` contract.

## Required top-level manifest fields

- `schema_version`
- `status`
- `warnings`
- `inputs`
- `output_dir`
- `clip_mode`
- `summary`
- `shots`

## Required top-level `inputs` fields

- `video_path`
- `sheet_path`
- `sheet_format`
- `source_duration_seconds`

## Required top-level `summary` fields

- `total_rows`
- `ok_rows`
- `partial_rows`
- `failed_rows`

## Required per-shot fields

- `row_index`
- `shot_number`
- `start_time`
- `end_time`
- `base_name`
- `status`
- `clip_path`
- `first_frame_path`
- `last_frame_path`
- `duration_seconds`
- `warnings`
- `error_code`
- `error_message`
- `source_row`

## Optional per-shot fields

- `middle_frame_path`
- `middle_frame_paths`
- `enrichment`

`middle_frame_path` is the representative middle-frame path closest to the clip midpoint.

`middle_frame_paths` is the ordered list of all emitted middle-frame paths for the clip. The current implementation emits one middle frame by default and supports a configurable count via `--middle-frames`.

Optional additive sidecar outputs may also include:

- `output_dir\keyframes\*_turningNN_tX-XXX.png`
- `output_dir\keyframes.json`

## Optional `enrichment.scenedetect` fields

- `enabled`
- `available`
- `status`
- `detector`
- `threshold`
- `min_scene_len`
- `scene_count`
- `reason`
- `scenes`

Each `scenes[]` item may include:

- `index`
- `start_timecode`
- `end_timecode`
- `start_seconds`
- `end_seconds`
- `duration_seconds`
- `representative_frame_path`

All `scenes[*].start_seconds` / `end_seconds` values are clip-relative, not source-video absolute times.

## Optional `enrichment.turning_points` fields

- `enabled`
- `available`
- `status`
- `method`
- `threshold`
- `min_gap_seconds`
- `max_points`
- `point_count`
- `reason`
- `points`

Each `points[]` item may include:

- `index`
- `timestamp_seconds`
- `scene_score`
- `frame_path`

All `points[*].timestamp_seconds` values are clip-relative, not source-video absolute times.

## Hard-stop failures

These should fail the run before row-level processing continues:

- missing `ffmpeg` / `ffprobe`
- unreadable source video
- unreadable or unsupported sheet format
- missing required columns
- unwritable output directory
- normalized filename collisions

## Row-level failures

These should fail or degrade only the affected row:

- invalid time syntax in that row
- `end_time <= start_time`
- `end_time` beyond source duration
- clip generation command failure for that row
- first/last frame extraction failure after clip creation

## Soft degradation only

These conditions should append warnings without redefining `ok` when the required artifacts already exist:

- middle-frame extraction failure
- scenedetect requested but unavailable
- scenedetect requested but failed after required artifacts already exist
- turning-point enrichment failed after required artifacts already exist
