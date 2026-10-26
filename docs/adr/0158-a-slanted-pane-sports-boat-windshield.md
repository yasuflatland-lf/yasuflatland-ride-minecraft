# 0158. A slanted-pane sports boat windshield

- Status: Proposed
- Date: 2026-10-26
- Extends: [0051](0051-sports-boat.md) (the windshield's construction; its 55-degree rake stays)

## Context

ADR 0051 gives the sports boat a wraparound windshield raked back 55 degrees with a walk-through. The generator built the front glass from 9 stacked rows per section, each 0.5 px high and 0.9 px deep and stepping 0.72 px aft, with the walk-through posts, corner posts, and mid dividers stepping with them: 27 glass cubes and 54 frame cubes. In the previews and in game this reads as a staircase of pale-blue blocks, and the overlapping rows stack the glass's alpha so it looks frosted. The owner asked for one slanted, see-through panel instead.

The glass already uses the `entity_alphablend` material with an alpha-80 swatch in its own `windshield` bone, and `tools/render_preview.py` blends see-through faces and turns cube x rotations the game's way (0056), so only the geometry has to change. The wake tower struts already use x-rotated cubes (0051).

## Decision

- Build each section of the front glass from one thin cube rotated about x to the rake: 0.5 px thick, 7.906 px long (the slope from z 22.0 at the sheer to z 15.5 at the top rail, 4.5 px up), rotated 55.3 degrees, pivoted on its front bottom edge so its front face lies where the old rows' front faces stepped. That is three glass cubes: the two front halves (x 4.1 to 13.8 each side) and the closed walk-through door (x -3.5 to 3.5).
- Build the walk-through posts, the mid divider of each front half (0.5 px wide), and the corner posts the same way in the `frame` swatch, 1.1 px deep and 0.3 px proud of the glass so they cover the pane edges: six frame cubes.
- The hull flares from 14.0 to 15.1 px half-width up the slope, which a flat pane cannot follow, so the corner posts run from x 13.8 to 15.0 and also cover the cut edges of the stepped side panes.
- Keep the side panes, the top rails, the mirror, the material, the texture and its alpha, and the bone names (0009) unchanged.

## Consequences

- The windshield reads as flat slanted glass, and looking through it crosses two faces instead of several overlapping rows, so it is clearer. The `windshield` bone drops from 59 to 35 cubes and `body` from 1154 to 1106.
- The corner posts are wider than before (1.2 px instead of 0.6 px).
- Alpha-blended faces are sorted per object, not per face, so the glass can draw in the wrong order against the interior or riders at some angles. This was already true of the rows; revisit if the owner sees it in game.
