# 0183. Light the camper's roof and tail lamps with the headlights

- Status: Accepted
- Date: 2026-10-29
- Extends: 0147, 0020

## Context

The owner wants the camper's amber roof clearance lamps on the front roof lip (the clearance domes near each corner and the three identification lamps at the centre in the "Roof-lip lamps" block of `tools/gen_camper.py`), the four red rear roof lamps, and the two round red tail lamps on the rear hatch to glow with `yasu_ride:headlights` (#889). ADR 0147 left tail and brake lights outside its scope; this decision narrows that sentence for these camper lamps without rewriting it. These cubes currently share the `amber` and `red` palette swatches with lamps that must stay unlit, so lighting the shared swatches would light those too.

## Decision

Give these lamps their own palette swatches in `tools/gen_camper.py`, with the same RGB as `amber` and `red`. Append them at the end of the palette so no existing swatch index moves and the unlit paint atlases look the same. Add the new swatches to the camper's `LIT_SLOTS` alongside `lens` and `dome`, and put their cubes in the existing `headlights` bone so the existing `.lit` render controller and `yasu_ride:headlights` switch cover them.

Everything else in 0147 applies unchanged: lit atlas alpha 0, MER emissive 255, the `.lit` render controller, and the switch. Pack changes require a Resource Pack version bump and a server restart (0015).

The side marker lamps, rear amber turn signals (0145), oval red side marker, and dashboard lamps stay unlit and keep sharing `amber` and `red`.

## Consequences

The unlit appearance and paint atlases do not change. Tail lamps glow with the headlights, not with braking; there is no brake light. There is no new switch, property, script, light block, or light-reach change. Revisit this decision if a brake light or a separate marker switch is wanted.

Rendering is client side, so verification is manual: row L10 in [the manual checklist](../manual-test.md).
