# 0215. Fit the SUV interior to the Rubicon cabin

- Status: Proposed
- Acceptance condition: owner confirms head clearance, first-person horizon, rider poses and legroom on PC and touch clients (#1279)
- Date: 2026-11-04
- Supersedes in part: [0196](0196-raise-the-suv-seats-for-first-person-visibility.md): seat height
- Supersedes in part: [0117](0117-move-the-suv-front-seats-back.md): seat positions
- Supersedes in part: [0170](0170-measure-suv-side-view-proportions.md): seat positions
- Supersedes in part: [0194](0194-enlarge-the-suv-for-seated-head-clearance.md): seat positions
- Related: [0214](0214-replace-the-suv-with-the-rubicon-shape.md): the new cabin geometry
- Related: [0029](0029-raise-the-seats.md): the seated rider's 0.4-block drop
- Related: [0050](0050-vehicle-kinds-and-per-kind-profiles.md): SUV-specific seat profile
- Related: [0015](0015-dev-server-docker-nethernet.md): Resource Pack cache version

## Context

Issue #1279 fits the interior left over from 0214 to its Rubicon cabin. Construction coordinates are pixels before the uniform 1.45 export scale: +x is the driver side, +z is forward, and D = 26.1 / 2.064 = 12.6453488372093 px. Export turns x and z by 180 degrees; entity seat x is therefore negative on the driver side, while rideable z is forward positive.

The new floor is 10.116279 px high, the hardtop underside is 25.518314 px, and the windshield plane runs from (y, z_d) = (1.47, 0.77) to (2.025, 1.17), with frame depth 0.018 D. Behind its base the door skin's inner face is 0.69 * K_REAR * D = 10.227659 px from the centre, where K_REAR = (0.755 + 0.13) / 0.755. The old cushions start below the floor, passenger fittings cross the closed door, and a full-width belt slab intersects every rider's chest.

## Decision

Derive every seat from the roof, windshield and cabin walls in `tools/suv_dims.py`. Keep shell constraints there as the single source for the hull and cabin modules, avoiding an import cycle through the cube kit. Rider lengths below are exported entity pixels, at standard Bedrock client scale 0.9375: head top above origin (24 + 8 + 0.5) * 0.9375 = 30.46875, head half (4 + 0.5) * 0.9375 = 4.21875, torso/arm half depth 2 * 0.9375 = 1.875, leg length 12 * 0.9375 = 11.25, shoulder height 24 * 0.9375 = 22.5, and eye height 1.62 * 16 = 25.92. Bedrock lowers the rider origin 0.4 * 16 = 6.4 px below the seat (0029).

- Set seat y by rounding downward to 0.01 block after reserving 1 exported pixel beneath the roof: floor((ROOF_Y * 1.45 - 1 - (30.46875 - 6.4)) / 16 * 100) / 100 = 0.74 blocks. Head top is 35.90875 entity px; the roof underside is 37.001555, leaving 1.092805 px. Preserve the existing half-pixel grown-head checks against the roof slab, sealed glass and every leaning windshield frame part without weakening them.
- Centre each rider in their half of the usable cabin: RIDER_X = CABIN_INNER_HALF_WIDTH / 2 = 5.113829 construction px. Round entity x to three decimals: driver -0.463, passenger +0.463 blocks, in both rows.
- Put the front rider as far forward as the grown head permits. At its top (seat y * 16 - 6.4 + 30.46875 + 0.5) / 1.45, extrapolate the windshield plane using run/rise = 0.40 / 0.555, then subtract frame half depth divided by cos(lean). Subtract head half reach 4.21875 + 0.5 and another 0.5 exported px margin along z. Round the entity z toward the rear to 0.001 block: -0.089 blocks, or FRONT_RIDER_Z = -0.982069 construction px.
- Put the rear rider as far back as the rear arch permits: z_at(2.34) + (1.875 + 0.5) / 1.45, rounded toward the front to 0.001 block. The result is -0.974 blocks, or REAR_RIDER_Z = -10.747586 construction px. The torso stays ahead of the arch and its inboard side skin.
- Keep every rider 5.2 construction pixels ahead of the seat back. FRONT_SEAT_Z is -6.182069 and REAR_SEAT_Z is -15.947586. Preserve seat order 0 driver, 1 front passenger, 2 behind driver, 3 behind passenger and the `seat_0` to `seat_3` bone contract. Rideable, profile and cow probe agree.
- Put cushion bottoms on FLOOR_Y. Cushion top is (seat y * 16 - 6.4 + 11.25 - 1.875) / 1.45 + 0.3 = 10.517241 construction px; assert it is above the floor. Backrest top follows the shoulders minus 0.5 construction px, at 18.768966. Retain pleats, side bolsters and the rolled edge; distribute backrest pleats over the available height. Seat bone pivots follow rider x and cushion top, with the existing z offsets from their backs (2 front, 1 rear).
- Front seats span x 2 to 2 * RIDER_X - 2 = 8.227659, mirrored, clear of the 1.8-px transmission tunnel. Rear bench halves span 0 to 0.525 * K_REAR * D - 0.2 = 7.581915, mirrored, inside the rear wheel liners.
- Make the belt shell hollow. Replace the full cabin slab with side strips at x 0.674 to 0.70 D over z_d 0.79 to 3.52, plus a back strip over z_d 3.44 to 3.52. Keep its exterior silhouette. Test every rider torso against every body and door cube except the seat and seat-pleat upholstery swatches, using turned corners and separating axes.
- Refit interior x to the cabin. The dashboard slab spans the door inner faces. Map passenger fittings linearly from [-12, -3.4] to [-10.227659, -3.4], preserving latch and handle-post widths by mapping their centres. Keep the centre stack, audio, vents and knobs centred. Centre the steering and gauges on RIDER_X, shifting the gauges by RIDER_X - 6.0; keep wheel height, tilt, radius and z rules. Shift pedals by the same x delta and raise the old hanging pedals by FLOOR_Y - 8; the accelerator and floor console already follow FLOOR_Y. Keep the column inside the dash and console clear of the front seats.
- Eye height is (0.74 - 0.4 + 1.62) * 16 / 1.45 = 21.627586 construction px (1.710320 D), or 31.36 entity px / 1.96 blocks. Require at least 5 entity pixels below the roof underside and strictly between the turned windshield glass's lower and upper edges, above the hood and every dashboard/gauge cube in front of the riders. Measured roof margin is 5.641555 px; glass edges are 27.213874 and 36.955359 entity px, leaving 4.146126 below the eye and 5.595359 above it. The hood margin is 4.131403 px, and the highest gauge panel leaves 2.8675 px. These are geometry estimates, not client measurements.
- Regenerate models and previews with `pnpm model`. Bump the Resource Pack header/module and BP dependency from 0.1.249 to 0.1.250 (0015).

## Consequences

The four seats use the available cabin width and follow its roof and windshield rather than the old seating values. The interior retains its materials, drawn gauges, pleats, steering assembly and controls. The existing strict head tests remain, with new eye and torso regression guards.

The high floor leaves the thigh underside at 10.217241 construction px, only 0.100962 construction px (0.146395 entity px) above it. Rear riders' straight legs reach construction z -2.988966, crossing the entire 1.8-px front backrest depth (2.61 entity px, including bolsters) from -6.182069 to -4.382069 and extending 1.393103 construction px beyond its front face. This is the accepted seating-space compromise of the short cabin; animated client poses still need inspection.

Head clearance, first-person visibility, boarding, doors and rider poses require checks on PC and touch clients. Revisit the proposal if those checks expose clipping or unacceptable legroom. Collision probes, physics, flight assemblies and roof tent anchors remain outside this interior change.
