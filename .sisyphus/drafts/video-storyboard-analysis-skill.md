# Draft: Video Storyboard Analysis Skill

## Requirements (confirmed)
- User wants to design a new Skill using `skill-creator`.
- Target domain is video storyboard / shot analysis.
- User explicitly requested analysis-first workflow with parallel context gathering before going deep.
- First version priority: `Analysis Report` rather than direct draft generation or QA-only critique.
- Primary input for V1: video files.
- Target range: generic/cross-context skill, not BigBanana-exclusive.
- Default output for V1: both Markdown report and JSON structured data.
- Default depth for V1: complete analysis (shot breakdown + pacing + continuity + narrative structure + camera language).
- Primary environment for V1: OpenCode-first.

## Technical Decisions
- Planning mode only: gather evidence first, then shape the skill specification.
- Research sources split into local patterns, repository domain context, official skill guidance, and external examples.
- Initial recommendation: target a BigBanana-oriented storyboard analysis workflow rather than a generic video-analysis skill.

## Research Findings
- Installed `skill-creator` skill is available globally and can be used as a reference/input for later design work.
- Repository domain appears to center on episode-stage creative workflow (`script -> assets -> director -> export -> prompts`) per project knowledge base.
- Local complex-skill pattern confirmed from `C:/Users/ASDWERT/.agents/skills/skill-creator/`: `SKILL.md` + optional `agents/`, `scripts/`, `references/`, `assets/`.
- Local simple-skill pattern confirmed from `F:/aigc/BigBanana-AI-Director/.agents/skills/find-skills/SKILL.md`: single-file `SKILL.md` with strong trigger-oriented description.
- Repository already has a dedicated analysis domain: `components/StageAnalysis/README.md`, `services/analysisOrchestrationService.ts`, `services/analysisDraftService.ts`, `services/qualityAssessmentService.ts`, `services/ai/shotService.ts`, and `services/ai/storyboardPromptTemplates.ts`.
- Existing domain terms that the skill can target: `VideoAnalysisRecord`, `AnalysisShotSegment`, `ViralSignal`, `NineGridData`, `Shot`, `ShotQualityAssessment`.
- Official/authoritative skill guidance converges on: strong “pushy” description, compact workflow-oriented `SKILL.md`, deep docs in `references/`, and scripts only for deterministic automation.
- External video-analysis workflows consistently follow: shot detection/segmentation -> frame extraction -> multimodal analysis -> structured report/output.
- External pitfalls repeatedly noted: token/cost explosion, weak shot-boundary detection, lost temporal context, and unclear output schema.

## Working Recommendation
- Best-fit skill concept: analyze reference video/storyboard and emit structured shot breakdown + pacing/continuity findings + reusable output for BigBanana workflows.
- Good first version should likely focus on one main job instead of trying to do extraction, critique, prompt generation, and draft creation all at once.
- Strong candidate modes:
  - Analysis Report: video/storyboard -> shot-by-shot report
  - Analysis to Draft: reference analysis -> BigBanana-ready episode/shot scaffold
  - QA Critique: existing storyboard/prompts -> pacing/continuity/coverage review
- Current chosen direction: generic analysis-report skill, with OpenCode as the first-class environment and rich structured output.

## Open Questions
- Exact output format: markdown report only, JSON only, or both?
- Depth of analysis: shot inventory only, or plus pacing/continuity/narrative/camera-language layers?
- Audience: internal team workflow, personal use, or reusable public skill?
- Operating context: OpenCode only, Claude-compatible generic skill, or cross-agent universal skill?

## Scope Boundaries
- INCLUDE: requirements discovery, evidence gathering, skill design direction.
- EXCLUDE: implementing non-markdown code artifacts in this session.
