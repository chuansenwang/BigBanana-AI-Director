---
name: video-viral-analysis
description: Analyze a short video from a local file or a public short-video URL for viral factors, retention structure, hook/payoff quality, and storyboard/script decomposition. Use this skill whenever the user wants to break down a short video, evaluate why a video may perform well, inspect爆款因子,拆解脚本结构,分析前三秒/节奏/反转/CTA, or turn a video into a structured T0/T1/T2/T3 report with JSON output.
---

# Video Viral Analysis

This skill analyzes one short-form video at a time and returns a Chinese-first structured result.

Use it for analysis only. Do not mutate project state, import into the app, or claim certainty beyond the available evidence.

## When to use

Use this skill whenever the user asks to analyze a downloaded short video, inspect why a video may be爆款, break down前三秒/节奏/反转/CTA, deconstruct脚本结构 or分镜节奏, or turn one short video into a structured T0/T1/T2/T3 report with JSON output.

## Input priority

1. `video_path`
2. `metadata_json_path`
3. `source_url`

If only `source_url` is present, delegate acquisition through the repo-local `video-downloader` contract first.

## Output rules

Always return both:

- a Chinese Markdown report
- a JSON object matching `references/contract.md`

Always declare `ok`, `partial`, or `failed`, include warnings and confidence, and degrade gracefully when transcript or visual evidence is incomplete.
