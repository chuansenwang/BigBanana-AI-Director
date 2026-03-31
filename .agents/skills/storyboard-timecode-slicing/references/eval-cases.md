# Eval Cases

## 1. Happy path CSV

- Input: local MP4 + valid UTF-8 CSV with 3 rows
- Expected status: `ok`
- Expected capability: 3 clips + 3 first frames + 3 middle frames + 3 last frames + valid manifest
- Minimum warnings: none

## 2. Happy path Markdown table

- Input: local MP4 + valid Markdown table with canonical columns
- Expected status: `ok`
- Expected capability: same artifacts as CSV mode, including middle-frame outputs
- Minimum warnings: none

## 3. Mixed-validity sheet

- Input: 3 rows where 2 are valid and 1 has `end_time <= start_time`
- Expected status: `partial`
- Expected capability: valid rows still produce artifacts
- Minimum warnings: one row-level validation warning

## 4. Out-of-bounds row

- Input: one row whose `end_time` exceeds source duration
- Expected status: `partial` when other rows succeed, otherwise `failed`
- Expected dropped capability: no artifact generation for the bad row

## 5. Hard-stop dependency failure

- Input: missing `ffmpeg` or `ffprobe`
- Expected status: `failed`
- Expected capability: no slicing attempts

## 6. One-frame or near-zero clip

- Input: extremely short but valid interval
- Expected status: `ok` or `partial` depending on frame extraction success
- Expected warning: first and last frame may be visually identical

## 7. Optional scenedetect unavailable fallback

- Input: valid sheet + `--enable-scenedetect` in an environment without the module installed
- Expected status: `ok` if required clip/first/last artifacts succeed
- Expected capability: middle-frame output still exists; manifest carries a scenedetect-unavailable warning

## 8. Configurable middle-frame count

- Input: valid sheet + `--middle-frames 2`
- Expected status: `ok`
- Expected capability: each valid row emits two middle-frame images and preserves one representative `middle_frame_path`
