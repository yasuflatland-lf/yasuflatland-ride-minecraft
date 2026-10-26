# 0158. A slanted-pane sports boat windshield

- Status: Proposed
- Date: 2026-10-26
- Extends: [0051](0051-sports-boat.md) (the windshield's construction; its 55-degree rake stays)

## Context

ADR 0051 gives the sports boat a wraparound windshield raked back 55 degrees with a walk-through. The generator built it from small steps:

- The front glass was 9 stacked rows per section, each 0.5 px high and 0.9 px deep and stepping 0.72 px aft, with the walk-through posts, corner posts, and mid dividers stepping with them: 27 glass cubes and 54 frame cubes.
- Each side pane was 16 vertical 2 px slices along the gunwale from z -10 to z 22, each with its own height (a curve from 1.8 to 4.5 px over the sheer, cut along the rake at the front) and its own top rail block: 32 glass cubes and 32 frame cubes.

In the previews and in game both read as staircases of pale-blue blocks, and the overlapping rows stacked the glass's alpha so it looked frosted. The owner asked for flat, slanted, see-through panels.

The glass already uses the `entity_alphablend` material with an alpha-80 swatch in its own `windshield` bone, and `tools/render_preview.py` blends see-through faces and turns cube x rotations the game's way (0056), so only the geometry has to change. The wake tower struts already use x-rotated cubes (0051). A cube can turn about only one axis here without trusting an untested rotation order, so every pane turns about x alone.

## Decision

- Every glass cube is a flat pane 0.5 px thick in the `glass` swatch, turned about x to its slope. The `windshield` bone holds seven of them.
- Front glass: the two front halves (x 4.1 to 13.8 each side) and the closed walk-through door (x -3.5 to 3.5), each 7.906 px long (z 22.0 at the sheer to z 15.5 at the top rail, 4.5 px up), rotated 55.3 degrees and pivoted on its front bottom edge, so its front face lies where the old rows' front faces stepped.
- Front frame: the walk-through posts, a 0.5 px mid divider per front half, and corner posts from x 13.8 to 15.0, on the same slope, 1.1 px deep and 0.3 px proud of the glass. The hull flares from 14.0 to 15.1 px half-width up the slope, which a flat pane cannot follow, so the corner posts are wider than before.
- Side glass: one pane per side at x 15.5 to 16.0, from z -10, 1.8 px over the sheer, in a straight line up to the front glass's top corner (z 15.5, y 22.1), tilted 7.1 degrees, 5.0 px tall so its lower part is buried in the gunwale wall (x b - 1.6 to b). A frame side rail, 0.7 px tall and x 15.0 to 16.2, lies on its top edge in place of the stepped rail blocks.
- Corner glass: under the rake, a pane at x 14.5 to 15.0 on each side lies on the 55.3-degree slope with its front edge under the corner post and runs 3.48 px aft square to the slope, so it reaches the side pane's front edge at the sheer. Where it overlaps the side pane, a 2.4 px frame pillar along the side pane's front edge hides the doubled glass.
- Keep the top rail over the front glass, the mirror (its post now reaches the side pane's straight top), the material, the texture and its alpha, and the bone names (0009) unchanged.

## Consequences

- The windshield reads as flat slanted glass all round, and looking through it crosses two faces instead of several overlapping rows, so it is clearer. The `windshield` bone drops from 59 to 7 cubes and `body` from 1154 to 1078.
- The side glass's top is now a straight line instead of the old curve, so it sits up to about 0.6 px lower than before around z 0.
- The corner posts are wider than before (1.2 px instead of 0.6 px), and a new 2.4 px pillar stands where the side glass meets the corner glass.
- Alpha-blended faces are sorted per object, not per face, so the glass can draw in the wrong order against the interior or riders at some angles. This was already true of the rows; revisit if the owner sees it in game.
