# 0172. Smooth sports boat headlight lenses

- Status: Proposed
- Date: 2026-10-28
- Supersedes in part: [0161](0161-smooth-sports-boat-hull-planking.md) (the lens construction in the lens bullet; the outline and everything else stay)

## Context

The owner wants the sports boat's lights to read as smooth panels instead of block-like cubes. Each bow flank currently has five lens planks, with height and centre sampled once per plan segment. Their joints expose steps of about 0.22 px in height and 0.375 to 0.47 px in centre.

Option 2, rolled edge strips and a rounded tip, would need a two-axis `headlights` assembly and `tilt_assembly` on a y axis. Two-axis composition order on device is still unmeasured (0166). A finer one-axis split removes the visible step at a fraction of the risk, so we choose it instead.

Issue #777 fixes this contract for 2/13 of the series. Later steps may only fill in numbers explicitly marked as measured in their step.

## Decision

1. **Outline kept.** Each lens runs from plan z 32 (height 1.5 px) to z 42 (height 0.4 px), with `t = (z - 32) / 10`, `h(t) = 1.5*(1-t) + 0.4*t`, centre `yc(z) = sheer(z) - 3.2 + 1.2*t`, depth 0.4 px, hull fit 0.15 px proud with at least 0.03 px, on both flanks, mirrored as today. No rounded rear tip.
2. **Sub-panels.** Each of the 5 plan segments per side is split into `LAMP_SUBPANELS = 4` sub-panels of equal length along the segment's proud line. Sub-panel i covers the fraction `[i/4, (i+1)/4]` of it; its height and centre are `h` and `yc` at `t` of the plan z `za + (zb - za) * (i + 0.5) / 4` (its own nominal midpoint), not the segment's.
3. **One axis.** All 4 sub-panels of a segment lie on that segment's proud line with its yaw (`[0, +-yaw, 0]`, as today), so they are coplanar. Each pivots at its own aft bottom corner, as `plank()` does for every plank; since they share one line and one yaw, the pivot only moves along that line. No cube gets a second axis; the boat's `ASSEMBLIES` table is unchanged.
4. **Fit.** The `hull_face` proud fit still runs once per segment (3 passes, 81 points along the segment including its end overlaps, 5 height fractions, one offset for all 4 sub-panels). At each along point the 5 heights use the `h` and `yc` of the sub-panel that covers that point (the aft overlap counts as sub-panel 0, the fore overlap as sub-panel 3), so every sub-panel's own top and bottom edge is sampled. Generation time does not grow with the panel count.
5. **Joints.** Sub-panels of one segment abut exactly: no gap, no overlap. Sub-panel 0 carries today's 0.25 px aft overlap and sub-panel 3 today's 0.25 px fore overlap (at the lens ends z 32 and z 42 too, as today).
6. **Faces and bone.** Every face of every sub-panel is `uv("light")`; all sub-panels are in the `headlights` bone. 20 per side, 40 in all. The geometry total goes from 1388 to 1418 (measured in 2/13; if the generator gives another total, 2/13 corrects this number).
7. **Unchanged.** Bone names, the render controllers, `sportsboat.ce.json` materials, the lit and MER textures, `LIT_SLOTS`, the `yasu_ride:headlights` property, every script, and every cube outside the `headlights` bone.
8. **Result.** Neighbouring sub-panels in a segment differ in height by about 0.055 px instead of 0.22 px, and in centre by about 0.1 px instead of 0.375 to 0.47 px, so the edges read as smooth curves. Revisit if the owner still sees steps on a device.
9. **Versions and checks.** 2/13 bumps the Resource Pack to the next free patch (0.1.187 if nothing lands first). The four boat previews regenerate. A new device row H11 checks that the lens edges read smooth with no stair steps and no flicker between neighbouring panels; H4, L2, L6, L8 are re-run.

## Consequences

The lenses gain 30 cubes, from 10 to 40, while the hull fit still samples once per segment. Smaller height and centre steps make the edges read as smooth curves without introducing compound rotations or changing the lighting contract. The four previews and device checks in Decision 9 must verify the result. Revisit the construction if the owner still sees steps on a device.

The Resource Pack bump also updates the Behavior Pack dependency and every test that pins its version (0015). Use stable APIs (0001), preserve layer, feature and kind boundaries (0012, 0046, 0055, 0065), and retain the one-axis rule outside registered assemblies (0167). Pure logic uses property-based tests and engine integration uses in-game tests (0010), without value-repetition or coverage-only tests.
