# 0162. Smooth the sports boat bow's inner outline

- Status: Proposed
- Date: 2026-10-26
- Extends: [0051](0051-sports-boat.md) (open-bow interior) and [0161](0161-smooth-sports-boat-hull-planking.md) (plan chains and seams)

## Context

Issue #640 smoothed the outer hull, but the open-bow lounge, inner gunwale, and bow rails retained their transverse slices. From above, their inboard edges formed staircases inside the smooth outer bow. Issue #641 replaces those edges with yawed panels while preserving the cockpit and the windshield, including its walk-through floor at z 18..22.

The generated base model has 1202 cubes: body 1184, headlights 10, windshield 7, mirror 1, and root 0. Its hull regions contain hull_shell 385, hull_interior 220, rub_rail 60, and strake 30. The open bow contributes 162 interior cubes, including 20 gunwale-wall cubes; the issue's estimate of 142 excludes those walls. The bow rails contribute another 24 body cubes.

## Decision

- Build the six side rows on every `PLAN_STATIONS` segment within z 18..40 using `plank()` and the mirrored `pair()`. Every panel turns about y only. Each inboard line follows `beam_plan` at a constant horizontal inset; a horizontal width w becomes local depth `w * cos(yaw)` so the inner face at a given z has the specified inset. Keep the existing swatches and heights, sampling sheer-dependent heights at segment midpoints.

  | Row | Swatch | Inner..outer horizontal insets | Height |
  | --- | --- | --- | --- |
  | gunwale_wall | hull | 1.6..0.5 | DECK_BOW..sheer |
  | lounge_base | seat_dark | 7.5..1.6 | DECK_BOW..LOUNGE_BASE |
  | lounge_cushion | seat | 6.9..1.6 | LOUNGE_BASE..LOUNGE_CUSHION |
  | lounge_piping | seat_dark | 7.5..6.9 | LOUNGE_BASE..LOUNGE_CUSHION + 0.1 |
  | lounge_back | seat | 2.8..1.6 | LOUNGE_CUSHION..sheer - 0.9 |
  | lounge_back_cap | seat_dark | 3.0..1.6 | sheer - 0.9..sheer - 0.3 |

- End the base, cushion, and piping chains where `beam_plan(z) = 7.5`, at z 39.8280, cutting the final segment there. The other side rows end at z 40.
- Use 0161's joint allowance `max(0.25, depth * tan(abs(yaw_change)) / 2 + 0.05)`, taking the larger adjacent local depth so both sides of a joint get the same allowance. Retain its inward-joint nominal-end setback and 0.03 px projection limit. Coplanar overlaps share swatches.
- Retain 0161's interior clipping for every bow chain and across span. Bound the entire rotated footprint, including square seam ends and all four footprint corners, by `plank_inner` at the cube's bottom height. At each plank-segment boundary, include both inner faces; within each interval, the decreasing bow breadth and plank chords make their endpoint minima conservative bounds. Subdivide chain footprints into intervals no longer than 0.05 px, and leave 0.002 px clearance for the generated geometry's four-decimal coordinate and angle rounding.
- For the gunwale wall, keep the 1.6 px inboard line and the sheer top fixed. Trim concealed outboard thickness against the entire rotated footprint at the bottom, every crossed BAND boundary, and the top. Within a band the plank chord is fixed and the V fraction grows with height, so its lowest spanned height bounds that band. Keep at least 0.05 px of local thickness (25 times the rounding clearance), avoiding degenerate panels. Raise the bottom only if that minimum thickness cannot fit, then trim to the widest thickness that fits all spanned bands. The eight segments from z 18 through 38 retain DECK_BOW (y 11); only z 38..40 rises to y 12 (+1 px). Immediately below y 12, band 5's plank inner chords are the binding limit, rather than the keel itself; at DECK_BOW the V fraction also restricts the width. For the lounge rows, keep their bottom heights and trim only concealed outboard thickness. These corrections preserve the smooth visible inner V and prevent exposed wall corners.
- Declare bow outer insets, clipping modes, end stations or beam crossings, and preserved slice ranges in `Band`, so renaming a row cannot change geometry. Evaluate each chain row's `when` predicate at segment midpoints; all current lounge-piping segments, including the final cut segment, satisfy `lounge_open`, preserving its intended geometry. Evaluate both `Inset.x` edges per segment for the cosine-scaled depth, including their scale and floor.
- Keep across spans slice-derived: bow_floor, filler_base, filler_cushion, and filler_seam take the larger of their inset-line half-widths at the two slice ends, tucking under the side chains, then clip that half-width to the minimum `plank_inner` at their bottom height across both ends and every intervening plank boundary. Preserve the two walk-through floor slices at z 18..22 exactly. Shared top faces retain matching swatches: seat on seat and seat_dark on seat_dark. Merge adjacent slices only when their x/y origins and dimensions match exactly; the seven constant-width filler_seam slices become one geometrically identical span, saving six cubes without changing their outline or swatch.
- Build the steel top rails on z 34, 36, 38, 40, 42, and end 43, at horizontal insets 1.6..1.1 and midpoint sheer +1.6..+2.1. Keep the three posts at z 34, 38, and 42 at their existing sizes and heights; replace their `beam(z + 0.4)` positions with `beam_plan(z + 0.4)` positions.
- Preserve every cube outside these interior rows and rails, all bone metadata and order, textures, windshield/glass/pillar/mirror code, cockpit interior, seat positions and sit heights, deck construction, and collision. The original V-band side-ray test includes the gunwale walls without an exclusion.

## Consequences

- The model drops by 36 cubes, from 1202 to 1166: body 1148, headlights 10, windshield 7, mirror 1, and root 0. Region counts are hull_shell 385, hull_interior 192, rub_rail 60, and strake 30. Within hull_interior, the open bow drops from 162 to 134 and the cockpit stays at 58. Bow rails drop from 24 to 16; the remaining 465 body cubes are unchanged. The 134 bow cubes consist of 108 side-chain cubes, 11 teak floor slices, seven filler bases, seven filler cushions, and one merged filler seam.
- Appearance comes first: cube count is neither a target nor a hard limit. Reduce cubes only while the generated sports boat previews remain visually identical, and stop before a reduction degrades their appearance. The side chains replace 130 slice cubes with 108 panels, saving 22; merging the seven identical filler-seam slices saves six; the rail chain replaces 18 top-rail cubes with 10, saving eight, while the six posts stay. These account for the 36-cube reduction. The clipping correction removes exposed geometry without an additional cube reduction. The count test simply guards against growth beyond the reported 1166 cubes; it is not an optimization goal.
- The wall now reaches y 11 on z 18..20, 20..23, 23..26, 26..29, 29..32, 32..34, 34..36, and 36..38. On z 38..40 its bottom is y 12, 1 px above DECK_BOW, because band 5's inner plank chords cannot contain even the minimum-thickness footprint below that boundary. The keel remains below the floor throughout these segments; the raise follows the plank envelope produced around the rising keel. Only the 18 open-bow wall cubes change geometry in this correction; cube counts stay at 1166 and all other generated cubes stay identical.
- The lounge's inner V, gunwale inner edge, and steel top rails now follow smooth plan chains. Level panels still step slightly in height where midpoint sheer heights differ; seam allowances cover their plan joints. The last base/cushion/piping panel ends at the centreline crossing, with its normal seam allowance.
- The top and afloat previews are inspected for the smooth inner V. Device checks H5-H6 on PC and mobile, with Vibrant Visuals on and off, remain with the owner; previews cannot establish in-game sorting or whether a cushion intersection is visible from a rider's view. Resource Pack version 0.1.145 invalidates cached geometry (0015).
