# Arminius interactive muscle heatmap v1 — Codex/Work handoff

Integrate after Workout Engine v1/v1.1 and Deterministic Analytics v1.

## Added

- `src/components/muscle-map/InteractiveMuscleHeatmap.tsx`
- heatmap analytics helpers in `src/lib/analytics.ts`
- upgraded `src/pages/ProgressPage.tsx`
- `tests/heatmap.test.ts`
- `HEATMAP_STYLES.css`

## Behavior

- Progress time-range data drives the heatmap.
- The muscle with the highest mapped-set workload in that range is intensity 1.0.
- Other muscles are normalized relative to that maximum.
- Color progresses neutral → yellow → orange → bright red.
- Very high relative workload gets a mild glow.
- Front and back maps are interactive.
- Tapping/clicking a region selects the muscle.
- Keyboard Enter/Space selection is supported.
- Selected muscle detail shows:
  - mapped sets
  - mapped external-load volume
  - top contributing exercises
- List controls below the map provide an accessible non-SVG alternative.

## Important interpretation

This heatmap is a training-distribution visualization.
Do NOT describe the colors as:

- measured muscle activation
- muscle damage
- fatigue
- soreness
- recovery readiness
- injury risk

The current anatomy is intentionally schematic. Do not over-polish the SVG paths in this task.
The future “muscular skeleton” artwork should preserve the same stable MuscleId contract so the
visual layer can be swapped without changing analytics or database logic.

## Styling

Merge `HEATMAP_STYLES.css` into `src/styles.css` after the prior workout and analytics styles.

## Tests

Run:

- `npm run lint`
- `npm run typecheck`
- `npm test`
- `npm run build`
- `npm run test:e2e`

## Manual acceptance

1. Log a leg-dominant session with squats and leg curls.
2. Open Progress → 30 days.
3. Verify quads/glutes/hamstrings light with different intensities.
4. Tap Hamstrings and verify contributing exercises show.
5. Switch 30 → 90 days and verify map responds to the larger dataset.
6. Verify untouched muscle regions remain neutral.
7. Verify keyboard selection works.
8. Verify mobile front/back figures fit without horizontal overflow.
9. Verify a second account only sees its own heatmap.
10. Verify there are zero AI/API calls.

## No new Supabase migration

This feature computes from the existing protected workout records and catalog mappings.
