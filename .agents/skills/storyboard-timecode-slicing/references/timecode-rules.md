# Timecode Rules

## Accepted time syntax

V1 accepts FFmpeg-friendly duration syntax in either of these practical forms:

- `HH:MM:SS.mmm`
- decimal seconds such as `12.345`

Prefer `HH:MM:SS.mmm` in user-facing examples.

## Not supported in V1

- SMPTE `HH:MM:SS:FF`
- mixed time formats within the same sheet unless they are all still parseable as FFmpeg durations

## Markdown table rules

The Markdown table must:

- contain a header row
- contain a separator row with pipes
- use canonical column names or aliases that can normalize to:
  - `shot_number`
  - `start_time`
  - `end_time`

Accepted aliases:

- `shot`, `shot_id`, `镜头号`, `镜头`
- `start`, `开始`, `开始时间`
- `end`, `结束`, `结束时间`

## CSV rules

- must be UTF-8
- first row must be the header
- use comma delimiter
- keep quoted fields standard and simple

## Naming normalization

Base names must use:

- normalized shot number
- normalized start time with `:` and `.` replaced by `-`
- normalized end time with `:` and `.` replaced by `-`

Example:

- `shot_number=10`
- `start_time=00:00:12.120`
- `end_time=00:00:14.800`

becomes:

- `S010_00-00-12-120_00-00-14-800`

## Overlaps

Overlaps are allowed by default. They are common in storyboard tables and should not be rejected unless the operator explicitly asks for overlap validation.
