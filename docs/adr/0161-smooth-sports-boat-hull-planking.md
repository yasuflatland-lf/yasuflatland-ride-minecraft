# 0161. Smooth sports boat hull planking

- Status: Proposed
- Date: 2026-10-26
- Extends: [0051](0051-sports-boat.md) (hull construction) and [0158](0158-a-slanted-pane-sports-boat-windshield.md) (one-axis flat panels)

## Context

The sports boat's 48 transverse 2 px slices exposed vertical seams and a stepped V bottom along each side. From above, the bow's outside edge was a staircase. Issue #639 separated the hull regions without changing their output; issue #640 replaces the outside shell while leaving the bow interior's slice construction for #641 and the glossy PBR finish for #642.

The starting model has 1103 cubes: body 1077, headlights 18, windshield 7, mirror 1, and root 0. The replaced shell, rub rail, and strake account for 442 cubes, including the gunwale walls that now clip inside the shell. The unchanged body suffix contains 489 cubes, including the windshield frame, tower, bimini, platform, jets, seats, consoles, wheel, mirror post, and bow rails.

Two numerical requirements in #640 need reconciliation:

- The PCHIP station table itself exceeds the stated 0.22 px deviation from the old polyline: at z 23 the table gives 14.94, while `beam(23)` is 14.70. The table-matching curve has a measured maximum deviation of 0.26412 px near z 24.41; at z 15.5 it is 16.34227 versus 16.12500. Preserve the table and the smooth monotone cubic rather than distort the curve to meet the contradictory bound.
- Applying the minimum 0.25 px overlap directly beyond every station makes square outer corners project at inward bends. With BAND 2.0 this misses the required 0.15 px outline tolerance by producing errors of 0.19394 px at z -47.25 and about 0.206 px at z -45.75. Set back nominal ends at inward joints before applying the normal seam allowance. The outer-outline test retains the issue's 0.15 px tolerance.

## Decision

- Keep `beam()` and all its existing callers unchanged. Use `beam_plan(z)` only for the new hull: a monotone cubic Hermite through `BEAM`, with weighted harmonic-mean interior tangents, zero tangents beside flat runs or extrema, and endpoint secants. The curve passes through every profile point and matches #640's plan table.
- Use `PLAN_STATIONS = [-48, -47, -46, -45, -44, 8, 12, 16, 18, 20, 23, 26, 29, 32, 34, 36, 38, 40, 42, 44, 45.5, 47, 48.5]`. Compute panel lengths and yaw from the curve. Forward of z 8 the maximum yaw change is 4.41697 degrees (4.4 at the table's precision), with maximum chord deviation 0.04946 px.
- `plank(z0, x0, z1, x1, y0, y1, swatch, depth, overlap)` returns one cube, pivoted at its first outer-face endpoint, turned about y only, with thickness measured inboard square to the face. The paired wrapper uses the rotation-aware `pair()` to mirror it. Positive y carries local +z toward +x; a right bow plank therefore has negative yaw in the build frame.
- The seam allowance is `max(0.25, depth * tan(abs(yaw_change)) / 2 + 0.05)` at each joint. At inward bends, set each nominal endpoint back along its chord by `max(0, overlap - 0.03 / sin(abs(yaw_change)))` before adding that allowance. This bounds the outboard projection to 0.03 px; the inboard corners already overlap there. Outward bends retain the full allowance. This is an explicit adjustment to #640's station-end overlap wording, needed to satisfy its outer-outline test. Coplanar overlaps use the same swatch.
- Use BAND 2.0. BAND 1.5 produces 1212 cubes after horizontal and vertical merging, exceeding the 1103 target, so take the issue's 2.0 fallback before adding stations. The V fraction interpolates `(0, 0.3), (1.5, 0.55), (3, 0.78), (4.5, 1)` and remains 1 above the chine; there is no hull below the keel.
- Sample each band's midpoint half-breadth at plan stations, keel knots, and the band's endpoints. Bands exist where the keel is no higher than their midpoint and the sheer is no lower than their top. Merge horizontal segments only within 0.1 px of all their samples, then merge vertically adjacent matching planks. Hull planks are 0.5 px deep.
- Fill inside with axis-aligned hull cores, split at cockpit and open-bow boundaries, with tops at DECK, DECK_BOW, or the sheer. Account for the yaw when keeping core corners inside the planks' inner faces; merge matching stacked cores. Close keel crossings and the transom with 0.5 px transverse end caps. Deck cores may subdivide where the beam changes by more than 1 px, so the gunwale cap covers their stepped edges.
- Cover band tops with a 2.0 px hull sheer strake, 0.5 px deep and 0.1 px proud. Between z -44 and 8, use one x-tilted plank per SHEER segment, following the existing tower's x sign. Elsewhere use level yawed pieces, split until their sheer rise is at most 0.4 px. Put a 0.3 px gunwale cap at sheer -0.25 through +0.05, reaching horizontally from half-breadth -1.6 to the sheer strake's outside face. Level pieces sample the sheer at their midpoint.
- Use the same segmentation for the stripe rub rail at sheer -1.1 through -0.4, 0.35 px proud of the sheer strake, and the 0.4 px strake line at `strake_y`, 0.2 px proud of its planks under the existing visibility window.
- Use five headlight lenses per side on plan segments 32-34, 34-36, 36-38, 38-40, and 40-42. Each takes its segment's yaw, keeps the midpoint teardrop height and centre, and sits 0.15 px proud of the hull face it meets. Remove the old step caps; keep the lit pass unchanged.
- Keep the interior slice-built, clipping each outer edge at both slice endpoints to half-breadth minus 0.5 and, where present, the actual merged plank's inner face. Keep all other body cubes, bone order, bone metadata, windshield and mirror bones, locators, textures, client entity, render controllers, and gameplay unchanged.
- Leave `render_preview.py` and its tests unchanged. `game_turn()` preserves y, and the preview's positive y carries +z toward +x. The bulldozer's `corner_bar()` uses the same `atan2(dx, dz)` construction. The generated bow panels turn inboard in all four inspected previews. This confirms the code and preview convention, not the game on a device: the owner must confirm that sign in H2.

## Consequences

- The model has 1151 cubes: body 1133, headlights 10, windshield 7, mirror 1, and root 0. This is 48 above the original target but below the practical cap of 1500. BAND 2.0 saves 61 cubes versus BAND 1.5. Region counts are hull_shell 334, hull_interior 220, rub_rail 60, and strake 30, followed by the unchanged 489 body cubes.
- The side reads as long panels and the outer top outline follows the bow curve, with no 2 px slice staircase. The forefoot at the stem still shows BAND-high plank ends. From directly below, narrow slots between the stepped core and the planks can show. H3 must check whether those are visible on the owner's devices; revisit the core closure if they are.
- The bow lounge's inner outline and the bow rails retain their old steps until #641. Hull gloss is left to #642. No texture or material change is part of this decision.
- The preserved side glass remains buried under the gunwale. At its forward end the curve is only 16.342 px wide, so a 0.5 px shell cannot also have an inner face strictly outside x 16.0 as #640 claims. The unchanged pane may intersect that hidden inner face; its outer edge remains inside the hull's outer face.
- The four generated previews have been inspected for long sides, a smooth outside bow outline, lens placement, and visible holes. Device checks H1-H4 on PC and mobile, with Vibrant Visuals on and off, remain with the owner. In particular, previews cannot establish in-game rotation signs, face sorting, or underwater closure.
