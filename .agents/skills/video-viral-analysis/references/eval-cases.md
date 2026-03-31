# Eval Cases

## 1. Full local video with transcript

- Input: `video_path` + transcript text + source metadata
- Expected status: `ok`
- Expected capability: full T0-T3 + timestamped story breakdown + segments
- Minimum warnings: none or minor informational only

## 2. Local video without transcript

- Input: `video_path` + source metadata, but no transcript
- Expected status: `partial`
- Expected dropped capability: dialogue-dependent conclusions must be downgraded
- Minimum warnings: transcript unavailable

## 3. URL-driven metadata-only analysis

- Input: `source_url` + metadata only
- Expected status: `partial`
- Expected dropped capability: no confident shot-level or dialogue-level claims
- Minimum warnings: metadata-only fallback

## 4. Unsupported or invalid source

- Input: unsupported or unreachable source
- Expected status: `failed`
- Expected dropped capability: no T0-T3 overclaiming, no fabricated story breakdown
- Minimum warnings: unsupported_source or equivalent actionable failure reason
