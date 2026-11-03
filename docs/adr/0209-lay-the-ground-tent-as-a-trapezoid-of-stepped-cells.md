# 0209. Lay the ground tent as a trapezoid of stepped cells

- Status: Proposed
- Acceptance condition: the tent property tests and in-game scenarios pass, and the owner confirms the matching model after #1227 and #1228
- Date: 2026-11-03
- Supersedes in part: [0130](0130-a-tent-entity-whose-hits-land-on-its-blocks.md): ground-tent layout dimensions and cell positions
- Supersedes in part: [0131](0131-pitch-a-tent-in-the-camp.md): footprint, room membership, and tunnel cell layout
- Extends: [0132](0132-open-and-close-each-tent-flap-alone.md): flap positions and a three-column front opening
- Extends: [0133](0133-sleep-on-the-tent-mattresses.md): mattress positions in the shortened bedroom
- Extends: [0134](0134-switch-the-tent-lantern-with-the-headlight-switch.md): lantern position in the shortened front room
- Extends: [0208](0208-fold-tents-with-older-layouts-on-load.md): activate legacy folding with layout version 2
- Related: [0010](0010-testing-strategy.md)

## Context

The owner's reference photos show separate inclined body panels with a flat ridge,
plus a roof-only tarp in front. The tunnel's twelve-column footprint does not fit
that silhouette. Issue #1226 replaces domain cells before #1227 and #1228 replace
the model; the series must not release before those model changes merge.

The starting geometry needs corrections. At layer 2, the cell centres of front
and rear walls at depths 3 and 8 lie outside the inclined shell. An inner wall
at depth 6 leaves only one bedroom column, too short for the mattresses. Putting
side flaps at the inner wall blocks their passage. Moving the upper front wall
inward also exposes a route above an open entrance unless a ceiling bridges it.

## Decision

Keep the local frame: x points left, depth increases behind the tarp's front
edge, and layer 0 rests on the ground. Model front remains -z (0009), with the
entity at the bottom centre of local `(0, 8, 0)`, the rear wall's middle cell.
Set `TENT_SPEC` width 7, depth 9, body headroom 3, tarp headroom 2, and lean 1.2.
The lean matches the photos' ground 7 x 6 and ridge about 4.6 x 3.6 blocks.

Define the intended shell through the pure `tentShellAt(height)` function in
`tentLayout.ts`. A cell centre is `(x, depth + 0.5, layer + 0.5)`; its x interval
is x +/-0.5 and its depth interval is depth..depth+1. The body ground edges are
x +/-3.5 and depth 3..9. Its top is `H = frontRoomHeadroom + 1 = 4`. At height y,
the side half width is `3.5 - lean*y/H`, the front edge is `3 + lean*y/H`, and
the rear edge is `9 - lean*y/H`.

The tarp has no side-wall cells. Its half width is 3.5 and its top is
`tarpHeadroom + 1 = 3`. Its ground depth is 0..3; its rear edge meets the body's
inclined front face at each height. This extends the nominal 0..3 tarp volume
behind depth 3 above ground: the required bridge cell at depth 3 has centre 3.5,
which would be outside both a strictly rectangular 0..3 tarp and the body at
height 2.5. Following the inclined front face makes the bridge part of the shell
without changing the ground footprint. The intended slanted left tarp panel
remains model-only; both ceiling-free edge columns are outside the rooms.

Every laid centre must lie in the body or tarp volume. For an outer wall, the
centre-to-shell distance on its outward side must be between 0 and 1: the
outer cell face is therefore within 0.5 block of the shell surface. Measure
ceilings against the appropriate top; their centres lie 0.5 below it. The inner
partition and mattresses are interior cells and have no outer-shell gap rule.

Build one immutable `TRAPEZOID_LAYOUT`, deriving dimensions from `TENT_SPEC` and
naming the remaining placement constants in `tentLayout.ts`:

| Part                      | Local cells                                                             |
| ------------------------- | ----------------------------------------------------------------------- |
| Side walls                | Half widths 3, 3, 2 for layers 0, 1, 2; depth 4..7 at every layer       |
| Front/rear cross-walls    | Depths 3/8 at layers 0..1 and 4/7 at layer 2; exclude side-wall columns |
| Inner wall                | Depth 5; exclude side-wall columns at every layer                       |
| Body ceiling              | x -2..2, depth 4..7, layer 3                                            |
| Tarp and entrance ceiling | x -2..2, depth 0..3, layer 2                                            |
| Front flap                | x -1..1, depth 3, layers 0..1                                           |
| Left/right flaps          | x +3/-3, depth 4, layers 0..1                                           |
| Bedroom flap              | x 0, depth 5, layers 0..1                                               |
| Mattresses                | x +1/-1, depth 6..7, layer 0; x 0 remains the walkway                   |
| Lantern                   | x 0, depth 4, layer 3; replaces one body ceiling cell                   |

Extend `TentLayoutSpec` with optional per-layer `crossWallInsets`, defaulting
to zero for omitted layers. Validate integer, nonnegative insets, layer count,
and that neither cross-wall reaches or crosses the inner wall. Apply insets
only to front/rear walls; leave side-wall spans and the inner wall unchanged.
The shipped insets are 0, 0, 1. Preserve the existing four wall-plate faces and
all block definitions.

Rooms comprise exactly x -2..2, depth 0..2, layers 0..1 under the tarp;
x -2..2, depth 4..7, layers 0..1 in the body; and x -1..1, depth 5..6, layer 2.
The inner wall, its doorway, and mattresses count as inside, as before. Outer
walls, the front opening at depth 3, ceiling cells, and ceiling-free tarp edge
columns are outside. The front room is the tarp plus the body space before the
inner wall; the bedroom has depths 6..7. At depth 4 the inset upper front wall
leaves two free standing layers under the lantern. Every room column and every
front-opening column has a ceiling above its highest room/opening cell, whether
flaps are open or closed. The depth-3 bridge closes the route above the doorway.
Walking through ground-level flaps or open tarp sides remains possible.

The layout has 107 unique laid cells: 51 walls, 12 flap cells, 39 ceilings,
one lantern, and four mattress cells. The clear box is x -3..3, depth 0..8,
layers 0..3: 252 clear cells over 63 support columns. Pitch refusal reasons and
ordering stay unchanged. Sheltered tarp occupants now prevent take-down and
can switch the lantern through the existing `insideTent` rule (0134).

Set `TENT_LAYOUT_VERSION = 2`. Existing unversioned/layout-1 tents now fold on
load through 0208. Keep its fixed 7 x 12 x 4 legacy cleanup box independent of
`TENT_SPEC`; preserve non-tent blocks and return one plain tent item.

Replace the tunnel golden snapshot with property tests for containment, shell
fit, outer-wall gaps, flap membership, bedroom mattress placement, lantern
membership, roof coverage, exact room membership, and transforms at every yaw.
In-game scenarios derive cell positions and counts from public domain helpers;
the legacy-fold scenario still checks the entire old cleanup box. Keep existing
scenario waits and declared ticks because no asynchronous behavior changes.

## Consequences

The three-column entrance meets the owner's width target while retaining the
four flap IDs and two-layer height rule. The partition moves from the issue's
starting depth 6 to 5 to fit the mattresses; side flaps move from 5 to 4 to open
into free front-room space. Upper cross-walls inset by one cell and the tarp
ceiling extends through depth 3 to fit the shell and close the doorway roof.

The Resource Pack remains the old tunnel until #1227/#1228: its shell, bounds,
flaps, inner partition, mattresses, and lantern do not yet match these cells.
Keep its existing asset assertions with explicit tunnel-model fixtures rather
than pretending it already matches the new domain layout. No entity/model or
generator file changes belong to this issue. The future model must bridge the
tarp to the inclined front face and match the widened front flap. Review this
contract if client movement finds a roof escape or the owner changes the panel
measurements. Automated domain checks do not establish in-game visual fidelity.
