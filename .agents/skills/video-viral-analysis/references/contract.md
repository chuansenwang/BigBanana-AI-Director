# Contract

## Purpose

This skill returns a Chinese-first report plus a stable JSON object for one analyzed short video.

## Input fields

### Required

At least one of:

- `video_path`
- `metadata_json_path`
- `source_url`

### Optional

- `transcript_text`
- `transcript_path`
- `title`
- `description`
- `tags`
- `channel`
- `duration_seconds`
- `platform`
- `analysis_focus`

## Status model

- `ok`: enough evidence exists for the full required output
- `partial`: some sections are degraded or omitted, but the result is still useful
- `failed`: the source could not be analyzed safely or meaningfully

## Required top-level JSON fields

- `schema_version`
- `status`
- `warnings`
- `inputs_used`
- `confidence`
- `source`
- `t0_t1_t2_t3`
- `story_breakdown`
- `segments`
- `transcript_info`
- `raw_limits`

## Fallback reasons

Allowed degraded reasons include:

- `transcript_missing`
- `metadata_only`
- `visual_only`
- `segmentation_reduced`
- `unsupported_source`
- `download_required`

## Confidence model

Use three levels:

- `high`
- `medium`
- `low`

Every score-heavy section should include a short `basis` note describing which evidence types were used.
