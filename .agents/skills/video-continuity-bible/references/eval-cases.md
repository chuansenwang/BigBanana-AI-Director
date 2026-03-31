# Eval Cases

## 1. Clear recreation brief

- Input: style notes + 2 characters + 2 scenes + 3 props
- Expected status: `ok`
- Expected capability: complete continuity bible with no major gaps

## 2. Sparse but usable brief

- Input: one character, vague scene, broad tone guidance
- Expected status: `partial`
- Expected capability: minimal usable bible with warnings

## 3. Contradictory appearance notes

- Input: same character described with conflicting hair/clothing facts
- Expected status: `partial`
- Expected capability: one normalized version plus explicit warnings

## 4. Prop-heavy short video

- Input: many objects and one recurring location
- Expected status: `ok`
- Expected capability: strong prop bible and clean handoff mapping

## 5. Unusable source

- Input: vague request such as “make it consistent” with no source facts
- Expected status: `failed`
- Expected capability: explain why a continuity bible cannot be trusted yet
