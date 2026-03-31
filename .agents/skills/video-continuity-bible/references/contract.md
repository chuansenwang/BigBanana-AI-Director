# Contract

## Purpose

This skill converts loose short-video recreation inputs into a reusable continuity bible that stabilizes:

- visual style
- characters
- scenes
- props / VFX
- downstream shot-prompt handoff rules

## Required top-level fields

- `schema_version`
- `status`
- `warnings`
- `source`
- `style`
- `characters`
- `scenes`
- `props`
- `handoff`

## Status model

- `ok`: all four continuity domains are usable
- `partial`: one or more domains are weak or incomplete, but the result is still usable
- `failed`: the input does not contain enough stable signal for a trustworthy bible

## Required `source` fields

- `input_summary`
- `evidence_types`
- `confidence_notes`

## Required `style` fields

- `title`
- `style_prompt`
- `visual_rules`
- `negative_rules`

## Required character fields

- `id`
- `name`
- `role`
- `core_features`
- `visual_prompt`
- `continuity_rules`

## Required scene fields

- `id`
- `name`
- `location`
- `time`
- `atmosphere`
- `visual_prompt`

## Required prop fields

- `id`
- `name`
- `category`
- `description`
- `visual_prompt`

## Required `handoff` fields

- `shot_prompt_rules`
- `required_reference_order`
- `entity_lookup`

## Field semantics

### `visual_rules`
Short stable bullets describing what should remain visually consistent.

### `negative_rules`
Bullets describing what must not drift, mutate, or be introduced casually.

### `core_features`
Observed or strongly implied identity anchors, not verbose prose.

### `visual_prompt`
A reusable prompt block meant to be embedded downstream in shot prompts.

### `continuity_rules`
Character-specific invariants such as hair, costume, expression range, body language, or recurring silhouette.

### `required_reference_order`
The order in which downstream workflows should consume this bible. Recommended default:

1. style
2. characters
3. scenes
4. props
5. shot-specific instructions

### `entity_lookup`
A compact cross-reference object mapping IDs to their semantic roles so downstream prompt assembly can resolve them deterministically.

## Warning policy

Use warnings for:

- conflicting facts
- under-specified appearance
- ambiguous setting
- uncertain prop ownership
- weak evidence for style assumptions

## Failure policy

Fail only when the input lacks enough stable signal to define even a minimal style/character/scene structure.
