# Contract

## Purpose

This skill converts one `storyboard-timecode-slicing` `manifest.json` plus its exported frame artifacts into:

- one prompt-analysis JSON file
- one flat CSV file for downstream prompt reuse

## Required inputs

- `manifest_path`
- `output_dir`

## Optional inputs

- `prompt_language` (`en` or `zh`)
- `include_turning_points`
- optional upstream metadata such as continuity notes or an old prompt sheet

## Input assumptions

- The manifest follows the upstream `storyboard-timecode-slicing` contract.
- Shot rows preserve original `source_row` metadata when present.
- The frame files referenced by the manifest should already exist on disk.

## Output files

Required:

1. `output_dir\prompt-reconstruction.json`
2. `output_dir\prompt-reconstruction.csv`

## Top-level JSON fields

- `schema_version`
- `status`
- `warnings`
- `inputs`
- `summary`
- `shots`

## Top-level `inputs` fields

- `manifest_path`
- `source_output_dir`
- `prompt_language`
- `include_turning_points`

## Top-level `summary` fields

- `total_rows`
- `analyzable_rows`
- `pending_rows`
- `ok_rows`
- `partial_rows`
- `skipped_rows`
- `failed_rows`

## Required per-shot fields

- `row_index`
- `shot_number`
- `base_name`
- `start_time`
- `end_time`
- `source_status`
- `source_warnings`
- `source_error_code`
- `source_error_message`
- `source_row`
- `frame_evidence`
- `reconstruction`

## Common optional passthrough per-shot metadata

- `source_title`
- `source_notes`
- `source_scene`
- `source_speaker`

## Required `frame_evidence` fields

- `first_frame_path`
- `middle_frame_path`
- `middle_frame_paths`
- `last_frame_path`
- `turning_points`

Each `turning_points[]` item may include:

- `index`
- `timestamp_seconds`
- `frame_path`

## Required `reconstruction` fields

- `status`
- `confidence`
- `prompt_language`
- `combined_prompt`
- `first_frame_prompt`
- `middle_frame_prompt`
- `last_frame_prompt`
- `transition_summary`
- `negative_prompt`
- `continuity_notes`
- `missing_details`
- `warnings`

## Reconstruction status model

- `pending`: scaffold exists but the prompt fields are not filled yet
- `ok`: the row has enough evidence and all relevant prompt fields are usable
- `partial`: the row is usable but degraded
- `skipped`: the row should remain in the output but does not have enough usable frame evidence
- `failed`: the row could not be processed meaningfully because of corrupt or unreadable input

## Top-level run status model

- `pending`: scaffold generated; one or more analyzable rows remain `pending`
- `ok`: all analyzable rows are `ok`
- `partial`: at least one row is `partial` or `skipped`, but useful output exists
- `failed`: the manifest is unreadable or no useful prompt output can be produced

## Required CSV columns

- `row_index`
- `shot_number`
- `base_name`
- `start_time`
- `end_time`
- `source_status`
- `source_title`
- `source_notes`
- `source_scene`
- `source_speaker`
- `first_frame_path`
- `middle_frame_path`
- `middle_frame_paths_json`
- `last_frame_path`
- `turning_point_frame_paths_json`
- `prompt_language`
- `reconstruction_status`
- `confidence`
- `combined_prompt`
- `first_frame_prompt`
- `middle_frame_prompt`
- `last_frame_prompt`
- `transition_summary`
- `negative_prompt`
- `continuity_notes_json`
- `missing_details_json`
- `reconstruction_warnings_json`
- `source_row_json`

## Hard-stop failures

- manifest file missing
- unreadable JSON
- top-level `shots` missing or not a list
- required per-shot contract fields missing broadly enough that reconstruction cannot start

## Row-level degradation

- one or more frame paths missing
- only first or only last evidence exists
- middle evidence missing
- turning-point metadata malformed
- source metadata conflicts with visible evidence

These should degrade the row to `partial` or `skipped` rather than fail the whole run when other rows remain usable.
