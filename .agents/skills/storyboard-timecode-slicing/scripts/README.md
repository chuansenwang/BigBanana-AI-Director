# Scripts

Deterministic helpers for storyboard-driven slicing:

- `slice_video.py` — parse sheet, validate rows, cut clips, write initial manifest
- `extract_frames.py` — read successful clips from the manifest and export first/configurable-middle/last frame images plus optional scenedetect enrichment
- `validate_manifest.py` — verify schema shape and artifact paths
