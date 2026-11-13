# 0076. Each kind names its default paint; a dye matching it does nothing

- Status: Accepted
- Date: 2026-10-20
- Extends: [0031](0031-repaint-with-all-sixteen-dyes.md)

## Context

0031 stores a vehicle's paint as `minecraft:variant`, in the `PAINTS` order, with `khaki` at 0. A placed vehicle starts at 0, and brown dye returns it there. It also says a dye of the color the vehicle already has does nothing and keeps the dye. The use case checks this by comparing paint names. The sports boat (0051) is black by default, so its variant-0 texture `sportsboat.png` is byte-identical to `sportsboat_black.png`. Black dye on a new boat therefore used a dye and changed the variant from 0 to 6 without changing the look, and brown dye on a black boat did the same in reverse. The SUV and the camper (0067) have a real khaki texture at variant 0 and are not affected.

## Decision

- Each kind's profile names a `paintPolicy`: `dyeable("khaki")` for the SUV, `dyeable("black")` for the sports boat, `dyeable("yellow")` for the bulldozer, and `fixed("khaki")` for the camper. Following 0050, this is a per-kind value, not an SUV constant
- `shownPaint(policy, stored)` returns the fixed paint for a fixed policy and `effectivePaint(stored, defaultPaint)` for a dyeable policy. `PaintVehicle` rejects a fixed policy before reading paint or executing `Repaint`, without effects
- `NormalizePaint.normalizeFixedPaint` resets a fixed-policy vehicle's stored nonzero paint to `PAINTS[0]`, without dye consumption or sound. A camper handler calls it for valid camper entities on `entityLoad` and `entitySpawn` with cause `Loaded`. Missing vehicles and dyeable policies are untouched
- For a dyeable policy, the effective paint of a variant is `defaultPaint` for `PAINTS[0]` and the paint itself otherwise. A dye whose effective paint equals the vehicle's current effective paint does nothing and keeps the dye. On the sports boat this covers black and brown dye on a boat at variant 0 or at `black`
- The use case reads the vehicle's kind from the world. A vehicle whose kind cannot be read, because it is gone or is not a vehicle, is not painted and keeps the dye, even if it was painted earlier in the same tick (0037)
- Dyeable variant numbers, paint events, the dye map and the textures do not change. The fixed khaki camper instead keeps only `camper.png` and renders `Texture.default` for every saved variant, without paint events or paint groups. Its retained `minecraft:variant` component is reset by `yasu_ride:normalize_paint` through the `yasu_ride:normalized_paint` group. `BedrockPaintWorld.paint` selects this reset event for fixed policies and paint events for dyeable policies. Brown dye still sends a dyeable vehicle of another color to variant 0
- `tests/packs/paint.test.ts` resolves each dyeable kind's paint texture through its render controller and client entity. It checks that a kind whose variant-0 texture is byte-identical to another paint's texture shows that paint at variant 0 through `shownPaint`, and that a kind with no identical texture shows `PAINTS[0]`

## Consequences

- A sports boat can be stored at variant 0 or 6 for the same look. This is harmless, because neither black nor brown dye moves it between the two
- A new dyeable kind whose default differs from khaki needs only its policy's `defaultPaint` and a variant-0 texture identical to that paint's texture. The pack test fails if the two disagree
- Revisit if a kind gets a distinct look for its variant-0 slot, which would make `defaultPaint` `PAINTS[0]` again
