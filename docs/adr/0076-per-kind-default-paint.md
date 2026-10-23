# 0076. Each kind names its default paint; a dye matching it does nothing

- Status: Accepted; extended by 0135
- Date: 2026-10-20
- Extends: 0031

## Context

0031 stores a vehicle's paint as `minecraft:variant`, in the `PAINTS` order, with `khaki` at 0. A placed vehicle starts at 0, and brown dye returns it there. It also says a dye of the color the vehicle already has does nothing and keeps the dye. The use case checks this by comparing paint names. The sports boat (0051) is black by default, so its variant-0 texture `sportsboat.png` is byte-identical to `sportsboat_black.png`. Black dye on a new boat therefore used a dye and changed the variant from 0 to 6 without changing the look, and brown dye on a black boat did the same in reverse. The SUV and the camper (0067) have a real khaki texture at variant 0 and are not affected.

## Decision

- Each kind's profile names `defaultPaint`, the paint its variant-0 slot shows: `khaki` for the SUV and the camper, `black` for the sports boat. Following 0050, this is a per-kind value, not an SUV constant
- The effective paint of a variant is `defaultPaint` for `PAINTS[0]` and the paint itself otherwise. A dye whose effective paint equals the vehicle's current effective paint does nothing and keeps the dye. On the sports boat this covers black and brown dye on a boat at variant 0 or at `black`
- The use case reads the vehicle's kind from the world. A vehicle whose kind cannot be read, because it is gone or is not a vehicle, is not painted and keeps the dye, even if it was painted earlier in the same tick (0037)
- Variant numbers, paint events, the dye map and the textures do not change. Brown dye still sends a vehicle of another color to variant 0
- `tests/packs/paint.test.ts` resolves each paint's texture through the kind's render controller and client entity. It checks that a kind whose variant-0 texture is byte-identical to another paint's texture declares that paint as `defaultPaint`, and that a kind with no identical texture keeps `PAINTS[0]` as its default

## Consequences

- A sports boat can be stored at variant 0 or 6 for the same look. This is harmless, because neither black nor brown dye moves it between the two
- A new kind whose default differs from khaki needs only its `defaultPaint` and a variant-0 texture identical to that paint's texture. The pack test fails if the two disagree
- Revisit if a kind gets a distinct look for its variant-0 slot, which would make `defaultPaint` `PAINTS[0]` again
