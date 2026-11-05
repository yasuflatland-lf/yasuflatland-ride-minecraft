# 0226. Lean and fold the camper front panels

- Status: Proposed
- Acceptance condition: the owner compares the front on a client from the reference photo's angle and sees no shimmer or z-fighting
- Date: 2026-11-05
- Supersedes in part: [0067](0067-camper.md): the cab-over and the windshield lean
- Supersedes in part: [0199](0199-square-the-camper-front-and-fold-the-grille.md): the rolled grille halves, the 175-degree angle seen from the front, the dark-run cap, and the snapshot boundary
- Related: [0015](0015-dev-server-docker-nethernet.md): bump the Resource Pack version so devices drop the cached geometry
- Related: [0167](0167-compound-rotation-assemblies-as-a-vehicle-neutral-rule.md): the new `front_panels` assembly

## Context

The owner marked client screenshots and renders against reference photos over several rounds. The upper grille and the white band above it stood vertical, while the lamp panel below them leaned back toward the bumper, so the side edge had a kink. On the photos the edge runs straight from the bumper to the sill. 0199's halves rolled 2.5 degrees about z, which drew a V seen from the front; the photo's rows stay level and bend at the nose only when seen from above.

The owner first asked for a fold of about 175 degrees, then asked for the panels' top edge to run parallel to the windshield's lower edge, which sets the panels' fold to the windshield's. The owner also asked for an upright windshield with its centre forward, and for a cab-over like a pyramid. A later round refined that: the upper panel runs straight down to a V, and two lower panels meet the V's points. On the photos the V's halves slope opposite ways from the windshield's top edge, which is what a flat panel cut by a V lowest on the centre line looks like. Measured by eye on the corner photo, the V's point sits about 2.3 px above the windshield and its ends about 6.5 px.

## Decision

- Build the front from the bumper top (y = 8) to the sill (y = 34) as two flat panels. Each leans 0.15 px forward per px of height (`FRONT_LEAN_SLOPE`, 8.53 degrees), and yaws 8 degrees (`FRONT_YAW`), so the plan view is a nose on the windshield's centre line at 164 degrees. The upper grille reaches y = 33 of the panel's height and the lower grille stops at y = 19, because the photos show the grille almost up to the sill. The panels hold the thin white band, the grilles, the lamp pods, the lamps, and the outer trim.
- Move the corners back by 1 px (`EDGE_BACK`): the side edge runs from z = -54.5 at the bumper to z = -58.4 at the sill. The nose stands 3.4 px ahead of it and stays behind the bumper's front. The bumper does not move, so it keeps its own slope (`BUMPER_SLOPE`).
- Turn each panel cube about the nose at its own height. A rectangle cannot follow both a level row and the slanted nose, so rows stay level and start exactly on the nose, and tall cubes overlap it by 0.1 px.
- Stand the windshield upright, with no lean and the same 8-degree yaw per pane (`WS_YAW`). The centre post stands 3.4 px ahead of the outer edges, which stay at z = -53.5. The sill's two edges are parallel.
- Close the sill with 96 strips, each 0.5 px wide and turned about x alone, running from the panels' top edge to the windshield base (y = 36). The owner asked for a short, nearly level sill: it is about 4.9 px deep and drops about 2 px from the window to the front corner.
- Build the cab-over's upper face as one flat panel from the roof lip (z = -53), moving forward 0.75 px per px of drop. It ends in a V: its point is on the centre line at y = 52, z = -62, and its ends are at the side walls' chrome chevron points at y = 56, z = -59. Two lower panels run from the V back to the windshield header, made of level bars turned about y alone, with a chrome strip on their centre fold.
- Extend the tan skirt under the entry door (y = 8 to 12), where the white wall showed.
- Remove the dark panel from the cab-over's upper face.
- Replace the plain square behind the door with the parts on the owner's close-up photo, centred at z = 14: a water fill frame 3.6 px wide and 5.9 px tall, centred 0.9 px under the skirt's top, with a dark opening, eight screw heads, and an oval ring of 16 bars; a placard 4.6 px above its centre; and an oval lamp 9.35 px above it. The scale comes from the frame's width on the photo, and the frame's size relative to the wheel on the side photo.
- Register the 518 compound cubes, the panels and the two wipers, as the `front_panels` assembly. They are placed directly, not by `tilt_assembly`, because each one uses its own pivot and the leaning order differs from a single tilt.
- Use Resource Pack version 0.1.256.

## Consequences

The nose at the sill reaches z = -61.8, just behind the cab-over's point and ahead of the bumper, as the owner marked. Hitboxes do not change, so the model reaches further forward than they do. `tests/packs/camper.test.ts` checks the lean, the fold, the plane, the nose joins, the mirror symmetry, the sill, the upright windshield, the cab-over, the skirt, and the water fill. The golden snapshot was regenerated deliberately. The model grows by about 400 cubes to about 3960, and the owner should watch frame rates on mobile. The fold is 164 degrees, not the first requested 175, because the parallel edges decide it; `FRONT_YAW` sets both. A device must confirm the rotation order (0167); if the panels look wrong on a client, revisit `on_panel` first.
