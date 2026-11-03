# 0217. Derive the SUV spec from the Rubicon body

- Status: Accepted
- Date: 2026-11-04
- Supersedes in part: [0194](0194-enlarge-the-suv-for-seated-head-clearance.md): collision box, carHeight, hitboxFront, floatDraft, gearProbeOffset and enclosing probe values
- Extends: [0214](0214-replace-the-suv-with-the-rubicon-shape.md): derive the gameplay dimensions and roof tent mounts deferred by point 13
- Related: [0009](0009-vehicle-model-conventions.md): retain the square collision box principle, replacing the original 1.8 by 1.6 dimensions
- Related: [0050](0050-vehicle-kinds-and-per-kind-profiles.md): SUV-only tuning
- Related: [0015](0015-dev-server-docker-nethernet.md): invalidate the cached roof tent geometry
- Related: [0170](0170-measure-suv-side-view-proportions.md): retain the roof margin and geometry guards

## Context

Issue #1278 follows the body replacement in 0214. The old gameplay envelope encloses the new body but no longer follows its dimensions. Driving feel, seats, interior and the flight axle are outside this change.

Measurements use `tests/support/geometry.ts` `turnedCorners` on all eight corners of every exported cube in `packs/yasu_ride_rp/models/entity/yasu_ride/suv.geo.json`, including cube and bone rotations. Divide pixels by 16 only after transformation. The shell is `body` plus closed `door_*` bones, lamps are `headlights`, and road wheels are `wheel_*`.

| Measured extent                             |          Blocks |
| ------------------------------------------- | --------------: |
| Shell forward reach                         |  2.679523074128 |
| Headlight forward reach                     |  2.637121638808 |
| Shell half width (mirrors and overfenders)  |  1.336590080784 |
| Road wheel outer half width                 |  1.425318518350 |
| Shell rear reach, including spare           |  3.103975404251 |
| Farthest horizontal corner of every bone    |  3.114027984634 |
| Highest exported corner above entity origin |  2.373523286516 |
| Lowest road tyre corner                     | -0.002473790257 |
| Roof to road                                |  2.375997076773 |
| Hardtop flat top, 2.060 D                   |  2.360728561047 |
| Roof rib size anchor, ROOF_TOP              |       2.3653125 |

The highest corner includes rounded hardtop trim; the flat top and rib anchor are distinct from that measured maximum. The complete-model radius includes the folded hover glow discs; the spare now sets the farthest corner. D is `26.1 / 2.064` construction pixels, scaled by `1.45 / 16` into blocks.

## Decision

Keep driving speed, acceleration, turn rate and all other movement tuning unchanged. Keep every SUV gameplay value in `SUV_SPEC`; other kinds retain their own dimensions.

The square collision box is 2.68 blocks wide and 2.36 blocks high. Round the measured shell half width upward to two decimals (1.34), then double it. Round the hardtop flat top downward to two decimals for `carHeight`, so the collision box stays below `ROOF_TOP`. Front and rear body overhang remain intentional (0009); wheels still protrude slightly sideways. Keep the 0.30-block roof allowance and every seat and grown-head clearance assertion unchanged.

Round enclosing probes upward to `bodyFront=2.68`, `bodyHalfWidth=1.43` and `footprint=3.12`. Front reach includes the shell and headlights. Half width includes the wheels: stopping at the overfenders would let protruding tyres touch mobs and blocks outside the ram and body probes, and the old width included wheel hubs too. Footprint includes every rotated corner of every bone, including the folded hover glow discs.

Set `hitboxFront` to half the box width, `floatDraft` to 0.75 times `carHeight`, and `gearProbeOffset` to `hitboxFront * (1 - 0.1/0.9)`. Keep placement `halfX=halfZ=1` and `height=ceil(carHeight)=3`: collision half width 1.34 is below the 1.5-block cell boundary. Placement covers the collision box, not every visible part. Camper and bulldozer placement remain valid without borrowing new SUV constants.

Keep the tent shell half width at 1.968 blocks, independent of the SUV body probes. Use the conservative CAB-based hardtop half width `H = 0.7 * D * 1.45 / 16 = 0.802189316860` blocks for rack support, inside the widened slab and rounded shoulders. Align the platform's right edge to `-H`: `anchorX = 1.968 - H`. This retains a left overhang and a ladder clear of the wheels without retaining the obsolete body-width-based 0.875 inset.

Center the tent in the hardtop's longitudinal span: `anchorZ = (17.2 - (1.16 + 3.44)/2 * D) * 1.45/16`. The hardtop extends from -2.3834375 to +0.229407703488 blocks; the tent edges at `anchorZ +/- 1.2` are -2.277014898256 and +0.122985101744, inside both ends. Keep roof height at `ROOF_TOP * 1.45 / 16`.

Move only the outer rack bar from +4 to -7 model pixels; the other stays at -26. With bar width 2 px, its maximum allowed center is -6.817941860465 px, so -7 is the nearest inward whole-pixel position. Every bar edge stays within `+/-H` after adding the anchor and under the platform. Keep the tent's own size, rack width and ladder geometry unchanged. Entrance coordinates follow the existing ladder foot: `entranceX = anchorX + 1.968 + (0.5 + 7.3)/16` and `entranceZ = anchorZ - 6/16`.

| Constant                                    |      Old |               New |
| ------------------------------------------- | -------: | ----------------: |
| carHeight / collision height                |     2.32 |              2.36 |
| collision width                             |     2.61 |              2.68 |
| bodyFront                                   |     2.69 |              2.68 |
| bodyHalfWidth                               |     1.64 |              1.43 |
| footprint                                   |      3.4 |              3.12 |
| hitboxFront                                 |    1.305 |              1.34 |
| floatDraft                                  |     1.74 |              1.77 |
| gearProbeOffset                             |     1.16 | 1.191111111111... |
| roofTentAnchorX                             |    1.203 |    1.165810683140 |
| roofTentAnchorZ                             |   -0.605 |   -1.077014898256 |
| roofTentEntranceX                           |   3.6585 |    3.621310683140 |
| roofTentEntranceZ                           |    -0.98 |   -1.452014898256 |
| SUV_DIMS.mount_bar_x (pixels)               | (-26, 4) |         (-26, -7) |
| RP header/module and BP resource dependency |  0.1.249 |           0.1.250 |

`roofTentRoofHeight` remains 2.3653125. The named `roofTentShellHalfWidth` exposes the unchanged 1.968-block tent dimension; `roofTentHardtopHalfWidth` exposes the derived conservative support width for the in-game mount assertion. `HARDTOP_TOP_Y`, `HARDTOP_FRONT_Z` and `HARDTOP_REAR_Z` name existing generator dimensions without changing the SUV geometry. `BODY_NOSE_HALF_WIDTH` and `MIRROR_OUTER_X` name the existing nose and mirror bounds; `SHELL_OUTER_HALF_WIDTH` applies the body widening ratio to the mirror edge and supplies the collision-width comparison.

## Consequences

The collision box grows slightly while body and footprint probes shrink to the rebuilt model. The pool stays three blocks deep, with its floor at -64 in the dev world. Ground step clearance still probes three vertical cells. Existing step approaches and corridors fit the square box; float-line and landing-gear scenarios already read the SUV spec. The roof tent scenario now checks its right edge against the hardtop support instead of an inset from the old body. No scenario wait or run length changes, so catalog tick declarations stay unchanged.

Generator comparisons and rotated-corner tests guard the box, enclosing probes, mount support, longitudinal tent fit and ladder clearance. Roof tent access and exit code already consume the profile mount and need no shared-code changes. Regenerate assets with `pnpm model`; bump the RP and matching BP dependency for the changed rack geometry.

BDS and client checks remain for the reviewer. Revisit these dimensions if wall overlap, ground or water clearance, or roof tent mounting is unacceptable on PC or touch. Seats, interior and flight axle fitting remain issues #1279 and #1280.
