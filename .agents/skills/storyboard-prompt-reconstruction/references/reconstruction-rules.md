# Reconstruction Rules

## Goal

Write **reusable generation prompts** from storyboard frame evidence. You are not trying to recover an unknowable exact original prompt string.

## What to infer first

Prefer this visual order:

1. main subject or subjects
2. environment / scene
3. composition and camera distance
4. camera angle or framing bias
5. visible action or pose state
6. lighting / color mood
7. style / rendering cues
8. continuity or transition cues across first / middle / last

## What belongs in `combined_prompt`

`combined_prompt` should feel like a reusable shot-generation prompt, not a caption.

Good ingredients:

- subject identity cues that are actually visible
- scene / environment cues
- framing and camera distance
- action state
- lighting and mood
- style cues

Avoid:

- hidden motivations
- exact brand names unless visible or preserved in source metadata
- plot facts not visible in the frames
- impossible certainty about motion that the frames do not support

## Frame-specific prompt rules

- `first_frame_prompt`: describe the earliest visible state
- `middle_frame_prompt`: describe the representative midpoint state when it exists
- `last_frame_prompt`: describe the latest visible state

Keep frame prompts aligned with the combined prompt. They should vary by state, not by redesigning the world.

## Transition summary

Use `transition_summary` to explain what changes from first to middle to last:

- pose change
- camera push / pull / angle change when visible
- lighting shift
- emotional or staging shift that is clearly evidenced

If the change is weak, say so instead of inventing motion.

## Negative prompt guidance

Only write `negative_prompt` when the images clearly suggest constraints that matter downstream, for example:

- avoid extra characters
- avoid background clutter
- avoid costume drift
- avoid face distortion or incorrect anatomy

Do not fill this field with generic filler if the evidence is weak.

## Continuity notes

Use `continuity_notes` for stable visual anchors that should persist across regeneration, such as:

- recurring costume details
- fixed scene props
- color palette anchors
- character placement or dominant silhouette

Keep the list short and evidence-backed.

## Handling uncertainty

- If a detail is not visible, omit it or add it to `missing_details`.
- If metadata and imagery conflict, prefer imagery and record a warning.
- If a row has weak evidence, degrade it to `partial` or `skipped`.

## Language default

Default to concise, English-friendly prompt phrasing unless the user explicitly asks for Chinese prompt text.
