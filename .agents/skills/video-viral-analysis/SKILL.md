---
name: video-viral-analysis
description: Analyze a short video from a local file or a public short-video URL for viral factors, retention structure, hook/payoff quality, and storyboard/script decomposition. Use this skill whenever the user wants to break down a short video, evaluate why a video may perform well, inspect爆款因子,拆解脚本结构,分析前三秒/节奏/反转/CTA, or turn a video into a structured T0/T1/T2/T3 report with JSON output.
---

# Video Viral Analysis

This skill analyzes one short-form video at a time and returns a Chinese-first structured result.

Use it for analysis only. Do not mutate project state, import into the app, or claim certainty beyond the available evidence.

## When to use

Use this skill whenever the user asks to:

- analyze a downloaded video
- inspect why a short video may be爆款
- break down前三秒、节奏、反转、payoff、CTA
- deconstruct脚本结构、剧情推进、分镜/镜头节奏
- turn a short video into a structured T0/T1/T2/T3 report
- compare what is visible in the video against title/description/tags/transcript evidence

Do not use this skill for bulk corpus benchmarking, project import flows, or general video downloading by itself.

## Inputs

Prefer inputs in this order:

1. `video_path`
2. `metadata_json_path`
3. `source_url`

Optional supporting inputs:

- transcript text or transcript file
- title / description / tags / channel / duration
- platform hint
- analysis focus

If only `source_url` is available, use the repo-local `video-downloader` skill contract to obtain durable local artifacts before deep analysis.

## Runtime workflow

Follow this sequence:

1. Normalize inputs and record which evidence is available.
2. If `video_path` exists, use it as the primary source.
3. If only `metadata_json_path` exists, do metadata-led analysis and mark the result as degraded.
4. If only `source_url` exists, delegate acquisition through the repo-local `video-downloader` contract before deep analysis.
5. Gather evidence in layers:
   - metadata
   - transcript, if available
   - visual/segment evidence, if available
6. Decide output depth based on evidence quality:
   - shot-level if segmentation is reliable
   - beat/segment-level if segmentation is weak
   - metadata-level only if no richer evidence exists
7. Produce both outputs:
   - Chinese Markdown report
   - JSON object matching `references/contract.md`
8. Explicitly state status, warnings, confidence, and evidence basis.

## Output contract

Always return two synchronized outputs:

1. A Chinese Markdown report using the screenshot-style information architecture
2. A machine-readable JSON object following `references/contract.md`

The report should include:

- 数据来源
- 降级/告警说明（if any）
- 视频爆款因子结构化评估
- `T0 决定上限`
- `T1 硬指标`
- `T2 软指标`
- `T3 灵活指标`
- 脚本/分镜解构

## Required behavior

- Be short-video-first: focus on hook, retention, pacing, reversal, payoff, and CTA/resolution.
- Provide evidence and confidence for nontrivial claims.
- Use timestamps when available.
- Degrade gracefully when transcript or visual evidence is incomplete.
- Return `ok`, `partial`, or `failed` status explicitly.

## Status rules

- Return `ok` when the required sections can be completed with enough evidence and no major blind spots.
- Return `partial` when one or more sections are degraded because transcript, segmentation, or visual evidence is incomplete.
- Return `failed` when the source is unsupported, inaccessible, or too weak to support a meaningful structured result.

## Fallback policy

- If transcript is missing, continue with metadata + visual evidence and mark the result `partial` unless evidence is still strong enough for all required sections.
- If visual segmentation is weak, keep the analysis at beat/section level instead of inventing exact shot boundaries.
- If only metadata is available, limit claims to title/description/tags/channel/duration-level analysis and mark missing sections clearly.
- If the source is unsupported or inaccessible, return `failed` with actionable warnings.

## Report structure

Always use this section order:

1. `# 解构详情`
2. `## 数据来源`
3. `## 告警与降级说明` (omit only when none)
4. `## 视频爆款因子结构化评估`
5. `### T0 决定上限`
6. `### T1 硬指标`
7. `### T2 软指标`
8. `### T3 灵活指标`
9. `## 脚本/分镜解构`

Use the helper template and scripts in `assets/` and `scripts/` whenever deterministic validation or formatting helps.

## References

- Read `references/contract.md` for the exact schema and status model.
- Read `references/t0-t3-rubric.md` for scoring dimensions and evidence rules.
- Read `references/storyboard-deconstruction.md` for decomposition depth and fallback depth.
- Read `references/downloader-handoff.md` for URL-to-local-file routing and downloader interop.
