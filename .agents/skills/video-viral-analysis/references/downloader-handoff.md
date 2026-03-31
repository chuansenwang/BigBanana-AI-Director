# Downloader Handoff

## Preferred interop

Use the repo-local `video-downloader` skill as the preferred URL acquisition path.

The preferred durable artifacts are:

- `video_path`
- optional `metadata_json_path`
- optional source metadata such as title, channel, duration, platform

Transcript artifacts are not guaranteed by the downloader contract.

## Input precedence

1. `video_path`
2. `metadata_json_path`
3. `source_url`

If only `source_url` is present, delegate acquisition first instead of inventing a separate downloader flow.

## Why not rely on the global youtube-downloader skill

The global skill is useful for end-user download help, but the repo-local `video-downloader` contract is the better chaining target because it is repo-owned, mirrors across local agent directories, and is easier to evolve with this project.
