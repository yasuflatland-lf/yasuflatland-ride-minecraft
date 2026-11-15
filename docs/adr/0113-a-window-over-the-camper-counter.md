# 0113. A window over the camper counter

- Status: Accepted
- Date: 2026-10-22
- Extends: [0067](0067-camper.md): the camper's look
- Extends: [0093](0093-decorate-the-parked-camper.md): the right-hand furniture
- Extends: [0103](0103-raise-the-camper-wall-cabinet-to-the-ceiling.md): the wall cabinet at the ceiling

## Context

On the camper's right (door) side, the wall between the door (model z -7 to 7) and the rear right window (z 38 to 50) had no window. The counter with the sink and the stove stands against that wall (0093, 0100, 0112), so a player at the stove or the sink looked at a blank wall. The model only noted "no window between the door and the shower room, above the counter"; no ADR decided it. The owner asked for a window there, the same size as the right window ahead of the door, placed so the side looks balanced (#437).

Since 0103 the wall cabinet over the counter sits at the ceiling, from y 54 to 61, so the wall between the counter top (y 30, with the wall ledge to 31 and the tap to 34) and the cabinet is free at window height (`WIN_Y`, y 36 to 49).

## Decision

- Map the inner lining to `wall veneer` (416 x 180 texels, WOOD) at 4 texels per model pixel, anchored at z -48 and y 61. The wall veneer has a fine linen-like cloth weave in light tan, averaging (196,170,128), with metal rails and screws. A flat colour looked wrong and the earlier broad grain was too harsh; the dense, low-contrast weave is intended to show only up close. Two-texel threads alternate over and under with a four-texel repeat, slight deterministic per-thread variation, and balanced integer luminance tints of +/-4 to +/-6, without gradients, bands or plank seams. Both broad faces of every lining cube use veneer with positive UV sizes, including the backing faces of the four backsplash fragments. Only the inward backsplash faces override veneer with tile. Reflect horizontal sampling on the opposite wall within the same veneer region, rather than using negative UV widths; the metal rails and screws remain continuous across fragments. Inset the complete mapping by half a texel on all atlas edges, mapping the 416 x 180 rectangle to texel centres 0.5 to 415.5 and 0.5 to 179.5, so no endpoint starts on the transparent column at u 416. Do not leave a broad backing face on the flat `wall_in` swatch. This removes signed-UV and boundary-sampling dependencies; device rendering still needs verification. At the backsplash material boundaries, remap every non-tile fragment from its own model coordinates so the rails at y 35.5 and 49.5 stay registered. Preserve the counter-window hole exactly when splitting four tile cubes from the lining.

- The right side gets a fourth side window at z 10 to 35, y 36 to 49 (`WIN_Y`), in `right_windows` in `tools/camper_kit.py`
- It is 25 px long, as long as the window ahead of the door (z -35 to -10), and has the same height
- Its position retains the original 3 px spacing from the door and the former rear window. The rear opening is now closed by the vent-lid design (0157)
- It gets what every other side window gets from the shared window loop: the grey-beige frame, the glass, two tied-back fabric panels and a rail inside the opening, the cut in the tan window band, and the holes in the outer wall and in the inner `wall_in` panel
- The kitchen top in `tools/camper_kitchen.py` stays below the opening: the counter and flush sink cover end at y 30, the low spout and twin taps below y 32, and the burner grate at y 30.95. No cube of the counter, the sink, the stove, or the wall cabinet reaches into the opening (x 9 to 23.4, y 36 to 49, z 10 to 35); only the two curtains do

## Consequences

- From the stove and the sink, a player sees outside through the window
- The right side now reads: front window, door, counter window, and the opaque vent lid behind it (0157)
- The camper model gains cubes (frame, glass, curtains, and the extra wall panel pieces around the opening). The model changes, so the Resource Pack version goes up (0015), and the README previews are rendered again (0027)
- Decor on the counter and the stove stands in front of the lower edge of the window, as it already does in front of the wall
