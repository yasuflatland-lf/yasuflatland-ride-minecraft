# Stair roofs: orient stairs outward on gable and hip roofs

## Intent

When the build material (the block tapped as point 1) is a stair block and the player chooses Gable roof or Hip roof, every stair is currently written with the material's own states, so all stairs face the same way. The player wants the stairs to form a real roof: each stair descends toward its nearest eave.

## Goals

- Stair material on a gable or hip roof produces a 45-degree stair roof whose stairs all descend outward.
- Non-stair materials keep today's stepped full-block roofs unchanged.

## Non-goals

- No new menu entry; choosing a stair block is what turns the roof into a stair roof.
- No mixing of materials (no slabs or full blocks for the ridge); the sole-material rule stays.
- No other shapes (cube, cylinder, sphere) get stair orientation.

## Decisions (agreed with the user)

1. **Pitch is fixed at 45 degrees.** With stair material the height is `floor((min(sizeX, sizeZ) - 1) / 2) + 1`, so each layer steps in by exactly one cell. Height aiming is skipped and the flow goes straight to the Fill / Hollow / Cancel menu, reusing the existing `heightLocked` path of `chooseHeighted`.
2. **Direction.** Each cell gets `weirdo_direction` for the cardinal direction of its nearest eave (descending outward). Hip corner cells take either of the two candidate directions; Bedrock forms the outer-corner shape from neighbours. Gable-end cells keep the slope direction (the stair profile shows on the gable end).
3. **Ridge.** With an odd short span the top layer is a single row; it uses an upside-down stair (`upside_down_bit: true`) for a flat top. Every other cell has `upside_down_bit: false`, even when the point 1 stair was upside down.
4. **Fill** places every cell as an oriented stair; hidden interior cells use the same nearest-eave rule.
5. **Hollow opens the bottom** for stair material: the shell keeps the sloped surface and the gable end walls but not the closed bottom layer. Non-stair Hollow keeps its closed bottom.

## Approaches

1. **Orient in the roof geometry (chosen).** `roof.ts` reports, per cell, its position and its outward direction (or ridge). The plan resolves the block state per cell: a stair material gets its `weirdo_direction` and `upside_down_bit` replaced, any other material is written as today. All logic stays in pure domain code with property tests; Undo, the volume check, and preview are unchanged.
2. **Fix directions after writing.** Write as today, then re-orient stairs in infrastructure by looking at neighbours. Rejected: two writes per edit, Undo and count drift, engine-side logic that is hard to test.
3. **A separate "stair roof" menu entry.** Rejected: the user wants choosing a stair block to be enough, and it adds a menu entry.

## Constraints

- Stair detection is by the material's states: it has both `weirdo_direction` and `upside_down_bit`. Domain code must not import `@minecraft/server` (ADR 0012).
- The volume check against `BUILD_SPEC.maxVolume` must count the cells actually placed (open-bottom Hollow included).
- ADR 0198 Decision 9 ("not stairs") and the Roofs section of `docs/specs/build-tools.md` must be updated in the same change.
- The `build_roofs` in-game scenario should gain a stair case that checks real directions.

## Left to the builder

- The exact `weirdo_direction` value for each cardinal direction (verify in game; Bedrock's mapping is 0 east, 1 west, 2 south, 3 north for the ascending side, to be confirmed).
- How the per-cell direction is threaded through `HeightedPlacement` and `Pattern` (for example a per-cell state function), as long as non-roof shapes are untouched.
- My call: if the fixed 45-degree height exceeds `BUILD_SPEC.worldTopY`, refuse with the existing height-cap feedback rather than flattening the pitch.
