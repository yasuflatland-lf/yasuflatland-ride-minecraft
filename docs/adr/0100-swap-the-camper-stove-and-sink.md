# 0100. Swap the camper stove and sink

- Status: Accepted
- Date: 2026-10-21
- Supersedes in part: [0093](0093-decorate-the-parked-camper.md): the stove and counter cells

## Context

0093 put the stove in local cell (-1, -1, 1), right behind the door, and the counter with the sink in (-1, -2, 1) behind it. The stove was drafted without a reference: one flat steel plate with four flat black squares for burners, a plain black oven door, and four chrome knobs on the wood body.

For the v0.12.0 play test (#393, #407) the owner supplied a photo of the real 1970s motorhome's range. Seen from the aisle, the sink is on the left of the range, toward the front of the vehicle, with only a narrow strip of counter between them. The range has a stainless cooktop with a rolled front lip, a vent strip along the back, four large gas burners with black cast-iron grates, a gold woodgrain control panel leaning back with five black knobs, and a brushed silver oven door with a chrome handle bar along its top.

## Decision

- The stove moves to cell (-1, -2, 1) and the counter with the sink to (-1, -1, 1). The `stove` and `counter` slot ids stay. The counter height is 14 px (top y 30); the stove height is 15 px on its grate (0107, 0112). The wall cabinet above is unchanged.
- `tools/camper_kitchen.py` builds the counter and sink at model z 8.5 to 24 and the range at z 24 to 39.5. `build_kitchen_top(registry)` returns `AreaCubes` and frozen `KitchenRegions`; the lower counter cabinet and the overhead cabinet remain in `tools/camper_room.py`.
- The 20-cube counter and sink use flecked laminate, a metal edge strip, and a three-piece flush sink cover with an aisle-side finger notch. The low swept spout and twin taps stand behind the cover, clear of standing decor. The cover ends at y 30 so even the widest standing item clears it. Five slab pieces form a recess around a stainless basin floor below the notch. They replace the spike's solid slab, three raised sink-rim strips and two hinges without changing the 20-cube total; the three cover pieces sit 0.14 px lower than in the visual spike.
- The 36-cube range has a brushed stainless cooktop and control strip, chrome trim and handle, a brown handle inset, and a dark olive oven face. One chrome-bezel ignition dial and the 7.3 px black vent band are centred at model z 32, in line with the burner. The vent has twelve slots. Metal filler on both sides of the vent leaves it visible. The removed knob positions are part of the uninterrupted brushed strip.
- The dial face is inset 0.06 px from the visual spike so its outer face ends at model x -8 and stays out of the aisle. No brand badge, lettering or logo is drawn.
- The one 209-cube burner is centred at model (-16, 32), with an open bore, cast cup, oval grate, six arms with raised feet and three retaining straps. Its silver head is one taller ring, retaining the approved 40-cube reduction (0112).
- The registry owns `flecked laminate` (192 x 192, LACQUER), `brushed stainless` (128 x 64, METAL), `range dial` (64 x 64, GLASS_COAT), `dark olive cab panel` (128 x 64, DARK_LACQUER), and `brown endgrain and pulls` (128 x 128, WOOD). `BROWN_ENDGRAIN` is a shared `RegionRef` for the later drawer work. The cast-cup detail gets a named allocation in the registered base atlas rather than borrowing unused texels.
- Every kitchen cube stays out of the aisle and below the window. The counter surface at its decor slot remains y 30; the stove slot stands on the grate at height 15. `DECOR_SPOTS` is unchanged.
- This replaces 0093's stove and counter cells and its kitchen appearance. The remaining furniture rules stand.

## Consequences

- Decor already saved in the `stove` or `counter` slot of a parked camper is redrawn in the slot's new cell the next time the room is laid. Nothing else moves
- The kitchen top grows from 98 to 265 cubes (+167), all in the body bone
- The camper model changes, so the Resource Pack version goes up and the dev server needs a restart (0015)
- The kitchen keeps the approved olive, beige and brown palette, with flecked cream laminate in place of the plain harvest counter. Device rendering and presses remain to be checked.
