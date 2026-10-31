# 0194. Enlarge the SUV for seated head clearance

- Status: Proposed
- Superseded in part by: [0196](0196-raise-the-suv-seats-for-first-person-visibility.md) (rideable seat height and clearance estimates)
- Date: 2026-10-31
- Supersedes in part: [0170](0170-measure-suv-side-view-proportions.md) (size-anchor numbers)
- Extends: [0192](0192-suv-detailed-body.md), [0015](0015-dev-server-docker-nethernet.md), [0142](0142-place-the-bulldozer-in-the-suvs-space.md), [0143](0143-place-the-camper-in-the-suvs-space.md)

## Context

Issue #1011 reports that a seated player's head protrudes a little above the SUV roof on PC and touch. ADR 0170 estimated 1.28125 model pixels of head room at `SIZE_SCALE = 1.30`; that model-derived estimate did not establish actual client clearance. The owner approved trying 1.45 while preserving the vehicle's proportions. ADR 0192's detailed body and texture treatment remain unchanged.

## Decision

Use `SIZE_SCALE = 1.45` in `tools/suv_dims.py`, an increase of 1.45/1.30, approximately 11.54 percent. Continue applying this one uniform transform at export to every length, pivot, locator and animation translation. Keep the thirteen proportion targets, completed ratios and tolerances from 0170. Preserve textures, UVs, palette, paint colors, the eight-slot grille, no-logo rule and bone names. Do not change speeds, accelerations, turn rate, step height, headlight reach or camera preset. The camper and bulldozer retain their geometry, collision boxes and clearance.

Re-derive the rideable positions, profile and test seat probe together:

| Seats | x (blocks) | y (blocks) | z (blocks, forward positive) |
| --- | ---: | ---: | ---: |
| Front driver / passenger | -0.551 / +0.551 | 0.58 | -0.04984375 |
| Rear driver side / passenger side | -0.551 / +0.551 | 0.58 | -1.16 |

Here x is +/-0.38 times scale, y is 0.4 times scale, and z is `(seat back z + 5.2) * scale / 16`. Retain `FRONT_SEAT_Z = -5.75` and rear seat back z=-18 in construction coordinates. Rechecking the front riders against the actual exported raked glass gives 2.366421 model pixels of separation along its normal after growing the head box by 0.5 px. The retained front offset therefore needs no further movement. The roof underside is 25.9*1.45=37.555 px; using 0170's unchanged outer head estimate gives head top 0.58*16+24.06875=33.34875 px, leaving 4.20625 px before the roof. Keep the strict all-four-seat test of the grown head against the roof, glass and leaning frame parts. These estimates do not establish client clearance for animated players, armor or arbitrary skins.

Measure the generated, unanimated model as 0170 does: apply `cube_tilt.cube_matrix` about each cube pivot to all eight exported corners, without rounding the transformed coordinates. Use `body` plus closed `door_*` bones for shell bounds, `headlights` for lamp reach, road wheel bones for wheel width, and every bone for the horizontal footprint. Measure road height from the lowest rotated road tire corner and roof height including ribs with `suv_proportions.measure`.

| Measured extent | Model px | Blocks |
| --- | ---: | ---: |
| Shell forward reach | 42.8475 | 2.67796875 |
| Shell half width | 23.925 | 1.4953125 |
| Lamp forward reach | 42.949 | 2.6843125 |
| Wheel hub half width | 26.1 | 1.63125 |
| Farthest horizontal corner, rear hover glow | 54.341156134 | 3.396322258 |
| Roof to road | 38.317560666 | 2.394847542 |

Round enclosing probes upward to `bodyFront=2.69`, `bodyHalfWidth=1.64` and `footprint=3.40`. The square engine collision box remains proportional to the original 1.8-wide, 1.6-high envelope: width=1.8*1.45=2.61 and height=1.6*1.45=2.32. Set `carHeight=2.32`, `hitboxFront=2.61/2=1.305`, `floatDraft=2.32*0.75=1.74` and `gearProbeOffset=1.305*(1-0.1/0.9)=1.16`. The visible roof remains within the unchanged maximum 0.30-block allowance above `carHeight`.

Keep SUV placement `halfX=halfZ=1`: collision half width 1.305 remains below the 1.5-block cell boundary and the placement guard passes. Vertical clearance stays `ceil(carHeight)=3`. This preserves 0142 and 0143's shared horizontal placement space. The visible body, wheels and folded assemblies extend outside those cells; placement promises clearance for the collision box, not all visible geometry. Nearby walls and doors still require client inspection.

The submarine test pool remains `ceil(carHeight)=3` blocks deep. With dev ground y=-60 its floor stays at -60-3-1=-64, the world's minimum. No deeper pool or world change is needed. Advance the Resource Pack header/module and Behavior Pack resource dependency from 0.1.213 to 0.1.214 (0015).

## Consequences

The SUV becomes larger in every direction and gains estimated head room without changing its proportions or driving tuning. The exported model tests preserve strict head clearance and check the new measured extents, scaled seats, collision envelope and pool-depth bound. Regenerate all assets and previews with `pnpm model`; unchanged textures and other vehicle outputs remain byte-identical.

Actual in-game head clearance, first-person visibility, wall overlap, passage and door clearance remain unverified until the owner checks PC and touch clients. The 1.45 scale is a first guess, not an accepted client measurement. No server restart or in-game tests were run for this change at the owner's request. Revisit this proposal if client inspection still finds clipping or unacceptable size.
