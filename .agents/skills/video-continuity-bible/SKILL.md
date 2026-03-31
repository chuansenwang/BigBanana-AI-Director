---
name: video-continuity-bible
description: Build a reusable continuity bible for any short-video recreation task by turning loose source material into stable style, character, scene, props, and handoff constraints before shot-level prompt writing begins. Use this skill whenever the user wants to 复刻短视频、先固定人物和场景、整理角色卡/场景卡/道具卡、建立统一画风、减少镜头间角色漂移，even if they do not explicitly ask for a “continuity bible.”
---

# Video Continuity Bible

Use this skill before writing shot prompts when the real problem is **consistency**, not wording. The goal is to lock what must stay stable across a short-video recreation so downstream shot prompts can change action and camera language without redesigning the world every time.

This skill is documentation-first and contract-first. It does not generate final per-shot prompts by itself. It produces the structured continuity layer that a shot-prompt workflow should consume.

## When to use

Use this skill whenever the user wants to:

- recreate a short video with stable character identity
- fix character drift across shots
- define reusable role / scene / props prompt blocks
- turn a messy brief, transcript, storyboard, or reference notes into a continuity bible
- create a “style bible”, “character bible”, “scene bible”, or “props bible” before writing shot prompts
- normalize who the characters are, what the locations look like, and what visual details must stay unchanged

Do not use this skill when the user only wants one single-shot prompt, pure editing instructions, or a final shot list with no need for reusable continuity rules.

## Inputs

Accept any combination of:

- short video summary
- script or transcript
- storyboard / shot list
- character notes
- scene / location notes
- prop / VFX notes
- style references
- platform/tone goals

The input can be sparse, inconsistent, or mixed-language. Your job is to normalize it into a stable output contract, not to demand perfect source material.

## Runtime workflow

Follow this sequence:

1. Read the source material and identify evidence-backed facts.
2. Separate **stable invariants** from **shot-specific variation**.
3. Build a single global style block.
4. Build normalized character entries.
5. Build normalized scene entries.
6. Build normalized prop / VFX entries.
7. Record continuity rules and negative rules.
8. Record warnings for ambiguity, contradiction, or missing information.
9. Produce both:
   - a machine-readable bible object
   - a human-readable handoff summary

## Output contract

Always follow `references/contract.md` as the source of truth.

Required top-level sections:

1. `schema_version`
2. `status`
3. `warnings`
4. `source`
5. `style`
6. `characters`
7. `scenes`
8. `props`
9. `handoff`

Your output must help downstream shot-prompt writing answer these questions immediately:

- What visual style stays constant?
- Who are the recurring entities?
- What locations exist and how do they look?
- What props or VFX must persist?
- What must never drift across shots?
- What information is still missing or weak?

## Required behavior

- Prefer evidence-backed details over invented embellishment.
- Normalize repeated entities into stable IDs.
- Distinguish **locked facts** from **soft guesses**.
- Keep descriptions reusable across many shot prompts.
- Put per-shot actions into handoff guidance only when they clarify continuity.
- Use English-friendly prompt phrasing when writing `visual_prompt` fields unless the user explicitly wants another language.
- Keep `warnings` honest. Missing certainty is better than fake precision.

## Status rules

- `ok`: enough information exists to build usable style + character + scene + prop continuity blocks.
- `partial`: one or more domains are incomplete or contradictory, but the bible is still usable with warnings.
- `failed`: the input is too weak or self-contradictory to produce a reliable continuity bible.

## Fallback policy

- Missing details: keep the section minimal and emit a warning.
- Contradictions: prefer the stronger evidence, but preserve the conflict in warnings.
- Missing props or scenes: do not invent a dense world; keep the structure light.
- Weak source material: still produce a usable partial bible instead of refusing unless there is truly no stable signal.

## Report structure

Use the markdown layout from `assets/report-template.md` for the human-readable version.

Keep the machine-readable version aligned with `assets/result-schema.example.json`.

## References

- `references/contract.md` — canonical field contract and status semantics
- `references/continuity-rules.md` — rules for separating stable continuity from shot-specific variation
- `references/eval-cases.md` — first-pass regression scenarios
- `assets/report-template.md` — human-readable handoff format
- `assets/result-schema.example.json` — example machine-readable output
