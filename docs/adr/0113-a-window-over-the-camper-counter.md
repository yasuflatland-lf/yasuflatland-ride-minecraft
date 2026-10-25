# 0113. A window over the camper counter

- Status: Accepted (extended by [0114](0114-open-the-camper-wall-cabinet.md): the cabinet reaches down to model y 50, still clear of the window); extended by [0146](0146-wire-mesh-bulldozer-steps-and-a-camper-vent-cover.md) (Proposed)
- Date: 2026-10-22
- Extends: 0067 (the camper's look), 0093 (the right-hand furniture), 0103 (the wall cabinet at the ceiling)

## Context

On the camper's right (door) side, the wall between the door (model z -7 to 7) and the rear right window (z 38 to 50) had no window. The counter with the sink and the stove stands against that wall (0093, 0100, 0112), so a player at the stove or the sink looked at a blank wall. The model only noted "no window between the door and the shower room, above the counter"; no ADR decided it. The owner asked for a window there, the same size as the right window ahead of the door, placed so the side looks balanced (#437).

Since 0103 the wall cabinet over the counter sits at the ceiling, from y 54 to 61, so the wall between the counter top (y 30, with the wall ledge to 31 and the tap to 34) and the cabinet is free at window height (`WIN_Y`, y 36 to 49).

## Decision

- The right side gets a fourth side window at z 10 to 35, y 36 to 49 (`WIN_Y`), in `right_windows` in `tools/gen_camper.py`
- It is 25 px long, as long as the window ahead of the door (z -35 to -10), and has the same height
- It is centered in the wall between the door's rear edge (z 7) and the rear right window's front edge (z 38): 3 px of wall on each side
- It gets what every other side window gets from the shared window loop: the chrome frame, the glass, the curtains drawn to its edges inside (z 10 to 12.5 and 32.5 to 35), the cut in the tan window band, and the holes in the outer wall and in the inner `wall_in` panel
- No interior part changes. No cube of the counter, the sink, the stove, or the wall cabinet reaches into the opening (x 9 to 23.4, y 36 to 49, z 10 to 35); only the two curtains do

## Consequences

- From the stove and the sink, a player sees outside through the window
- The right side now reads: front window, door, counter window, rear window, each with wall between them
- The camper model gains cubes (frame, glass, curtains, and the extra wall panel pieces around the opening). The model changes, so the Resource Pack version goes up (0015), and the README previews are rendered again (0027)
- Decor on the counter and the stove stands in front of the lower edge of the window, as it already does in front of the wall
