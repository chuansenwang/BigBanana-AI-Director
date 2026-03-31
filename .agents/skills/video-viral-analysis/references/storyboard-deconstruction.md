# Storyboard and Script Deconstruction

## Minimum V1 depth

When evidence is strong enough, deconstruct into:

- opening hook
- beat-by-beat progression
- segment or shot notes with timestamps
- reversal / payoff
- ending / CTA / resolution

## Preferred output fields

- `opening_hook`
- `beats`
- `segments`
- `narrative_arc`
- `cta_or_resolution`

## Fallback depth

- If shot segmentation is reliable, provide shot-level notes.
- If only coarse visual structure exists, provide segment-level notes.
- If only transcript exists, provide script-beat decomposition without invented shot boundaries.
- If only metadata exists, provide premise-level script inference and label it clearly as low-confidence.

Never fabricate exact timestamps or camera details when the evidence does not support them.
