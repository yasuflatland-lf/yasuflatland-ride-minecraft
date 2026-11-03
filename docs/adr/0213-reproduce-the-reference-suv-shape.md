# 0213. Reproduce the reference SUV shape

- Status: Proposed
- Acceptance condition: the series tracked in #1245 meets these targets or lists its residual differences, and the owner checks the result on the verification branch on the iPad (Vibrant Visuals) and PC
- Date: 2026-11-03
- Supersedes in part: [0170](0170-measure-suv-side-view-proportions.md): the target values of the side-view proportion table and the windshield rake (not its method)
- Extends: [0169](0169-a-lantern-for-the-oil-lamp-and-a-noga-chair.md): its panel helpers (`tools/panels.py`) also build the SUV body
- Extends: [0192](0192-suv-detailed-body.md): new parts and bones
- Related: [0009](0009-vehicle-model-conventions.md): eight-slot grille, no marks
- Related: [0194](0194-enlarge-the-suv-for-seated-head-clearance.md): size anchor
- Related: [0196](0196-raise-the-suv-seats-for-first-person-visibility.md): seat height
- Related: [0015](0015-dev-server-docker-nethernet.md): Resource Pack version bump

## Context

Tracking issue #1245 covers the whole-body massing and four characteristic parts: a hood air scoop, squared fender flares, a winch front bumper and rock-rail side steps. The reference vehicle is a lifted four-door Wrangler Rubicon. The [design document](../superpowers/specs/2026-11-03-suv-rubicon-shape-design.md) records the owner's decisions: body size values may change, and fidelity outranks size limits. Placement may grow past 3x3x3 cells; report the fallout. When the reference form conflicts with roof height, windshield rake, seat height or the head-clearance tests (0170, 0194, 0196), keep the tests and ride comfort and approximate the form. Use panels instead of plain cubes where they read as sheet metal. Judge the metal look through MER on the owner's iPad with Vibrant Visuals. Keep the eight-slot grille, no logo or lettering, and unchanged paint colour.

### Reference images and method

The five blueprints are in the owner's `~/Downloads/suv/`, outside the repository. Neither the images nor renders of them are committed. The following records the supplied measurement evidence; the scratch measurement script is not a repository input.

| Image                                 | Size (px) | SHA-256                                                            |
| ------------------------------------- | --------- | ------------------------------------------------------------------ |
| `rubicon_right_side_blueprint.png`    | 2112x1126 | `97f862055044c4123471459db6ab910817919313e1dff33004b4180780bd58ac` |
| `rubicon_left_side_top_blueprint.png` | 2038x1210 | `8b0aead72035d2461396d93adc8cac43cb09eb8ee8dd5fb4868af3a2e1e00feb` |
| `rubicon_front_blueprint.png`         | 1536x1232 | `36e790ac4a04c6613278677c1b781580b4d35571a221b6069a14f8e9726537ff` |
| `rubicon_left_front_blueprint.png`    | 2000x1234 | `33018fcc6a41f5ccac9cfa692f8cff17754528df7a62c8cd156144e5bd900e1c` |
| `rubicon_left_back_blueprint.pnt.png` | 1902x1242 | `96c9bf272936f33760bc431de9e83fdd16c6af7340e80cd4dcfa83e6dced4dd9` |

Coordinates are pixels from the upper left, x right and y down. A scratch Python script (not committed) decoded the PNGs with `zlib`, produced gridded crops and scanned rows and columns for the first and last pixel darker than a threshold. Landmarks were then read on the gridded crops.

These blueprints are not orthographic. Both side images are perspective renders from above and slightly off the beam: the right side is nearly square-on at the rear axle and sees the front recede; the left side looks down more steeply and slightly from ahead. The front image is a near-front perspective view. Each row therefore uses D from the same image and the tyre nearest the landmark. Horizontal lengths use the tyre's horizontal diameter. Vertical lengths in the body side plane use the tyre's vertical scale, twice the hub-to-contact distance, which includes the cosine of the elevation. Ground under the body side is shifted up from tyre contact by the side's inboard depth times the sine of the elevation. Each side row uses the mean of the two side images where both provide a measurement; single-view estimates are identified below.

Perspective leaves 5-15 percent uncertainty on most rows, much more than 0170's 2-3 px on an orthographic-like render. The uncertainty column records that measurement uncertainty. Fitting tolerance stays 0.05 D and 3 degrees as in 0170: tolerance is how close the model must come to the recorded target, not the measurement error. Do not substitute manufacturer specifications.

### Per-image scales

- Right side: the rear near tyre spans x=460..840 at y=870, a horizontal D of 380 px. Its hub is (655,885) and contact is y=1055; column scans x=650..660 end at 1056. Vertical D is 2x170=340 px, with cosine of elevation about 0.89. The front near tyre hub is (1760,765), contact about y=918, and vertical D is 306 px. Front horizontal D is taken as 0.9x380=342 px. Mid-car scales are 361 px horizontal and 320 px vertical.
- Left side: the front tyre spans x=292..655 at y=960, a horizontal D of 363 px. Its hub is (470,960), contact y=1102, and vertical D is 284 px, with cosine of elevation about 0.78. The rear tyre face is about 322 px wide, hub (1585,885), contact y=1022, and vertical D 274 px. Mid-car vertical D is 280 px and mean horizontal D is 342.5 px.
- Front: ground is y=1146 (column scans x=220..300) and roof top is y=103 (column x=768), giving height 1043 px. The side-chain overall height ratio 2.13 gives 1 D = 490 px in this image. Visible front tyre height, y=650..1146 or 496 px, agrees within about 1 percent; its top is partly behind the flare.

### Measured targets and current model

Image columns give pixel landmarks, the per-image D and the resulting ratio. Targets, uncertainty and model values are in D except for rake, which is in degrees. A dash means no measurement from that image. The model is the exported, closed-door, unanimated model measured by `tools/suv_proportions.py`.

| Row                                                | Right side                                                     | Left side                                                       | Front                                                                 | Target / D                      | Uncertainty             | Current model / D                         | Pending until             |
| -------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------- | ----------------------- | ----------------------------------------- | ------------------------- |
| `wheelbase`                                        | Hubs 655..1760: 1105 / 361 = 3.06                              | Hubs 470..1585: 1115 / 342.5 = 3.26                             | -                                                                     | 3.16                            | +/-0.10                 | 3.5264                                    | 6/13                      |
| `front_overhang`                                   | Axle to near bumper tip 1760..2008: 248 / 342 = 0.73           | 110..470: 360 / 363 = 0.99                                      | -                                                                     | 0.86                            | +/-0.13                 | 0.7053                                    | 6/13                      |
| `rear_overhang` (spare excluded)                   | 278..655: 377 / 380 = 0.99                                     | 1585..1880: 295 / 322 = 0.92                                    | -                                                                     | 0.95                            | +/-0.05                 | 0.9127                                    | Met now                   |
| `ground_clearance` (rock-rail underside)           | At x=1250: ground 936 minus rail y=750; 186 / 320 = 0.58       | At x=1000: ground 1008 minus rail y=840; 168 / 280 = 0.60       | -                                                                     | 0.59                            | +/-0.05                 | 0.5914                                    | Met now                   |
| `belt_height`                                      | Sill-to-belt (750-455) / 320 = 0.92                            | Sill-to-belt (840-578) / 280 = 0.94                             | -                                                                     | 0.59 + 0.93 = 1.52              | +/-0.07                 | 1.5289                                    | Met now                   |
| `overall_height` (roof side edge)                  | Belt-to-roof (455-270) / 320 = 0.58                            | Belt-to-roof (578-400) / 280 = 0.64                             | -                                                                     | 1.52 + 0.61 = 2.13              | +/-0.10                 | 2.1927 (0.063 over)                       | 6/13                      |
| `side_window_height` (front door glass)            | 285..455: 170 / 320 = 0.53                                     | 420..578: 158 / 280 = 0.56                                      | -                                                                     | 0.545                           | +/-0.03                 | 0.5393                                    | Met now                   |
| `hood_height` (windshield foot)                    | -                                                              | -                                                               | Cowl about y=360, level with mirror arms at belt; belt + about 0.04 D | 1.56                            | +/-0.08                 | 1.5787                                    | Met now                   |
| `hood_length` (outer A-pillar foot to bumper tip)  | 1400..2005: 605 / 342 = 1.77                                   | 110..755: 645 / 363 = 1.78                                      | -                                                                     | 1.77                            | +/-0.08                 | 1.7955                                    | Met now                   |
| `windshield_rake` (from vertical)                  | (1310,180) to (1400,400): atan(90 / (220 / 0.89)) = 20 degrees | (790,230) to (745,300): atan(45 / (70 / 0.78)) = 27 degrees     | -                                                                     | 24 degrees                      | +/-5 degrees            | 35 degrees                                | 6/13; head clearance wins |
| `front_bumper_length` (along car)                  | End cap 1920..2005: 85 / 342 = 0.25                            | 110..230: 120 / 363 = 0.33                                      | -                                                                     | 0.29                            | +/-0.05                 | 0.3319                                    | Met now; 9/13 rebuilds it |
| `rear_bumper_length`                               | 278..460: 182 / 380 = 0.48                                     | 1770..1880: 110 / 322 = 0.34                                    | -                                                                     | 0.41                            | +/-0.08                 | 0.4149                                    | Met now                   |
| `bumper_height` (front winch face)                 | -                                                              | -                                                               | y=735..905: 170 / 490 = 0.35                                          | 0.35                            | +/-0.04                 | 0.3485                                    | Met now                   |
| `overall_length` (bumper tips, spare excluded)     | 278..2008: 1730 / 361 = 4.79                                   | 110..1880: 1770 / 342.5 = 5.17                                  | -                                                                     | 4.97 (sum of three length rows) | +/-0.20                 | 5.1445                                    | 6/13                      |
| `overall_width` (flare to flare, mirrors excluded) | -                                                              | -                                                               | At y=560, x=194..1275: 1081 / 490 = 2.21                              | 2.21                            | +/-0.20                 | 2.7382 (body bone, including bumper ends) | 6/13                      |
| `track_width` (tyre centres)                       | -                                                              | -                                                               | Outer faces 170..1298: (1128 - tyre width 210) / 490 = 1.87           | 1.87                            | +/-0.15                 | 2.6137 (wheel bounds include hub caps)    | 6/13                      |
| `tyre_width`                                       | -                                                              | -                                                               | Left tyre x=170..380: 210 / 490 = 0.43                                | 0.43                            | +/-0.05; upper estimate | 0.3734                                    | 6/13                      |
| `flare_reach` (beyond body side)                   | -                                                              | -                                                               | Flare x=195 to cowl x=335: 140 / 490 = 0.29                           | 0.29                            | +/-0.05                 | No landmark yet                           | 8/13                      |
| `flare_top_height` (front outer crest above road)  | (1770,490) to contact 918: 428 / 306 = 1.40                    | (480,675) to contact 1102: 427 / 284 = 1.50                     | -                                                                     | 1.45                            | +/-0.07                 | No landmark yet                           | 8/13                      |
| `hood_scoop_height`                                | -                                                              | -                                                               | Opening y=412..447: 35 / 490 = 0.07                                   | 0.07                            | +/-0.03                 | 0.066767                                  | Met now (7/13)            |
| `hood_scoop_length` (along car)                    | -                                                              | x=295..375: 80 / 363 = 0.22                                     | -                                                                     | 0.22                            | +/-0.05                 | 0.221898                                  | Met now (7/13)            |
| `front_bumper_reach` (ahead of grille)             | Grille x=1905 to tip 2005: 100 / 342 = 0.29                    | Hood front x=235 to tip 110: 125 / 363 = 0.34                   | -                                                                     | 0.31                            | +/-0.06                 | 0.333852 D (7.28625 px)                   | Met now; 9/13             |
| `step_height` (rock-rail face)                     | y=710..750: 40 / 320 = 0.125                                   | y=805..840: 35 / 280 = 0.125                                    | -                                                                     | 0.125                           | +/-0.03                 | 0.1246                                    | Met now                   |
| `step_reach` (outboard of body side)               | Hidden                                                         | Top surface band about 12 px / sin(elevation) 0.58 / 342 = 0.06 | Hidden                                                                | 0.06                            | +/-0.03                 | 0.0584                                    | Met now                   |

The left side sees the front bumper from slightly ahead, lengthening its apparent overhang. The right-side ground at x=1250 is contact line 981 minus a 45 px inboard shift, giving 936; the left-side ground at x=1000 is 1064 minus 56, giving 1008. The height chain uses mean sill-to-belt 0.93 and mean belt-to-roof edge 0.61, rather than treating those as additional rows. Overall height uses the outer roof side edge as 0170 did, excluding antenna and spare. The steep side views show the hood top surface rather than a clean edge, so the hood height uses the front-view relationship to the belt.

The rake correction gives right-side dy=220/0.89, about 247 px, and left-side dy=70/0.78, about 90 px. Perspective enlarges the near tyres in the front view, making the tyre width an upper estimate. The rear flare crest is lower than the front: right (650,650) to contact 1055 gives 405/340=1.19 D; left (1590,675) to contact 1022 gives 347/274=1.27 D, about 1.23 D on average for 8/13. Scoop width across the hood is front x=580..895, 315/490=0.64 D; it is not an additional row. Bumper reach is measured at its near end, the forward-most point in both side views.

The left-front and left-back cross-check images were viewed for form only; no numbers were taken from them. The front flare sits higher than the rear, flares are squared with flat outer faces, the winch bumper projects ahead of the grille with end caps, and rails run between the arches below the doors.

## Decision

1. Keep the seated player as the size anchor (0170 Size anchor note, 0194, 0196). Do not re-derive `SIZE_SCALE`, seat heights or head-clearance tests from these ratios. Proportions are ratios to road wheel diameter D measured on the blueprints, with D from the same image as each row.
2. Head clearance, seat comfort and their tests (0170, 0194, 0196) take precedence over the reference form, as owner decision 3 requires. Where a row conflicts, likely overall height or windshield rake, approximate the form, leave the row pending and list it in the round 3 residuals in 12/13.
3. Build or rebuild the hood air scoop, squared fender flares, winch front bumper with a winch and no lettering, and rock-rail side steps. Build body surfaces from panels (`tools/panels.py`, 0169) where that reads as sheet metal. Keep the eight-slot grille and no logo, vehicle name, badge or lettering (0009). Keep the palette and paint colours unchanged. Ship MER metal values separately in 13/13 and tune them on the owner's iPad with Vibrant Visuals, not in the renderer.
4. These targets supersede 0170's target values and windshield rake, not its method: measure the exported model's rotated corners, select landmarks by bone and shape, and skip pending rows visibly. Do not rewrite any Accepted Decision; 0009's collision numbers remain superseded only by Proposed ADRs as before.
5. Keep all 24 rows (13 old and 11 new) in `tools/suv_proportions.py`, with 23 linear ratios to road wheel diameter D at tolerance 0.05 D and the windshield rake in degrees at tolerance 3 degrees. `PENDING` lists rows the model does not yet meet and new rows without a landmark. `measure` returns `None` for a pending row without a landmark. Skip pending rows for tolerance assertions and permit missing landmarks only for pending rows; check every non-pending row for positivity and tolerance, and keep its completed ratio within 0.005 of its recorded value. The current tests also check positivity for pending rows that already have a measurement. Every `None` row must be pending. Initially pending are `wheelbase`, `front_overhang`, `overall_height`, `windshield_rake` and all eleven new rows; the other nine old rows already meet the new targets.
6. Later PRs of #1245 add the landmark selectors for their rows and remove completed rows from `PENDING`. If a row cannot meet its target because of the precedence rule, leave it pending and explain why. The assignments are:
   - 6/13 (#1251): `wheelbase`, `front_overhang`, `overall_height`, `windshield_rake`, `overall_length`, `overall_width`, `track_width`, `tyre_width`.
   - 7/13 (#1252): `hood_scoop_height`, `hood_scoop_length`.
   - 8/13 (#1253): `flare_reach`, `flare_top_height`.
   - 9/13 (#1254): `front_bumper_reach`, keeping `front_bumper_length` and `bumper_height` within tolerance.
   - 10/13 (#1255): `step_height`, `step_reach`, keeping `ground_clearance` within tolerance.
7. Each PR changing the body outline still re-derives enclosing probes and reviews the collision box, seats and placement clearance as 0170 and 0194 require. Report the fallout if placement grows beyond 3x3x3 cells. This ADR's PR changes no pack: `pnpm model` output must remain byte-identical, with no version bump. Later Resource Pack changes require the version bump in 0015.

## Consequences

The reference is a perspective render, so the targets are approximate. Wheelbase, overall width and track width indicate that the current model is longer and much wider for its wheels than the reference: track 2.61 D against 1.87 D and width 2.74 D against 2.21 D. Shrinking width or enlarging D changes the collision box, seats and placement; 6/13 decides and reports those effects.

The rake target of 24 degrees is more upright than the current 35 degrees. Recheck front-seat head clearance when changing it, and preserve the tests even if that leaves a residual difference.

Revisit these measurements when an orthographic reference becomes available, or when a row's measurement disagrees with the part built in a later PR by more than its recorded uncertainty. Pending rows remain explicit until completed or reported as residuals; acceptance still requires the owner's verification-branch checks on iPad and PC.

## Notes

### 2026-11-03: 6/13 (#1251), SUV massing and gameplay envelope

Keep `SIZE_SCALE=1.45` and body half width 13 construction pixels, anchored to two seated players side by side. Grow `Wheels.road_radius` from 6 to 7.5: measured road wheel diameter D grows from about 12.05 to 15.05 construction pixels. Grow vertical massing and overhangs with D so the already-met rows stay met while width and track fall to their targets. The initial Context table above remains the pre-6/13 measurement record; the following values describe the rebuilt model.

Re-running `tools/suv_proportions.py` through `tool_loader` on the exported closed-door model gives all seventeen measured rows below. Ratios are rounded to six decimals; rake is in degrees. All meet the unchanged 0.05 D or 3-degree tolerance.

| Row                   | Measured / D |
| --------------------- | -----------: |
| `wheelbase`           |     3.162463 |
| `front_overhang`      |     0.863698 |
| `rear_overhang`       |     0.950068 |
| `ground_clearance`    |     0.591353 |
| `overall_height`      |     2.136043 |
| `belt_height`         |     1.529794 |
| `side_window_height`  |     0.539811 |
| `hood_height`         |     1.579622 |
| `hood_length`         |     1.740862 |
| `windshield_rake`     |   24 degrees |
| `front_bumper_length` |     0.290668 |
| `rear_bumper_length`  |     0.415239 |
| `bumper_height`       |     0.348801 |
| `overall_length`      |     4.976228 |
| `overall_width`       |     2.212395 |
| `track_width`         |     1.873560 |
| `tyre_width`          |     0.431849 |

The eight 6/13 rows are now removed from `PENDING`: `wheelbase`, `front_overhang`, `overall_height`, `windshield_rake`, `overall_length`, `overall_width`, `track_width`, and `tyre_width`. 7/13 removed `hood_scoop_height` and `hood_scoop_length` from `PENDING`, 8/13 removed `flare_reach` and `flare_top_height`, 9/13 measured and removed `front_bumper_reach`, and 10/13 completed `step_height` and `step_reach`. No row remains pending.

9/13 (#1254) rebuilds the bumpers without moving their measured bars: the front band gains a 1 px deep winch cut-out with a fairlead plate and hook inside it, a winch drum sits between the frame horns behind the bar's top, two upright shackles stand on the bar, and the fog lamps sit in rectangular pockets; the rear bar gains a centre step pad, a top tread and dark end cut-outs holding the reflectors. No brand plate or lettering is reproduced. The front tip, the fog lens reach and the rear bumper corner stay where they were, so `SUV_SPEC.bodyFront` (3.10), `bodyHalfWidth` and `footprint` are unchanged. Resource Pack manifest version rises to 0.1.250 (0015).

The floor, dash, steering, and seat cushions rise by `DIMS.hood.interior_rise=4.75` construction pixels with the hood top, preserving their relation to the rider's estimated eye. All four rideable seats and the cow seat probe rise from 0.73 to 1.16 blocks: `round(0.73 + 4.75 * 1.45 / 16, 2)`. Seat x/z stay unchanged. The head-clearance and sealed-windshield tests are not relaxed. The owner must still confirm the horizon at the 1.16-block seat height on the iPad; the earlier observation in 0196 covered 0.73 blocks.

The collision box stays square from above and 2.61 blocks wide. Its height becomes `(31.825 - 0.5) * 1.45 / 16 = 2.838828125` blocks, retaining the 0.5 construction-pixel gap below the roof slab. `carHeight=2.838828125`, `hitboxFront=1.305`, `floatDraft=2.12912109375`, and `gearProbeOffset=1.16` follow from the box. These replace 0194's height and draft for this model.

Round the enclosing probes upward to `shellFront=3.10`, `shellHalfWidth=1.58`, and `footprint=3.95` blocks; these supply `SUV_SPEC.bodyFront`, `bodyHalfWidth`, and `footprint`. The fog lamp lenses reach 3.092125 blocks forward, wheel hub caps reach 1.57234375 blocks sideways, and the farthest rotated corner reaches radius 3.945698957 blocks. The shell alone reaches 3.08578125 forward and 1.50890625 sideways. `roofTop=2.884140625` blocks follows the 31.825-pixel roof slab top. All eight rotated corners of every exported cube give max |x|=2.38796875, model z=-3.092125..3.933125, and max y=2.911328125 blocks, including hidden fold assemblies in their unanimated pose.

The visible roof including ribs reaches 2.911328125 blocks, 0.0725 above `carHeight`. Road-to-roof height is 2.913664437 blocks, including the lowest rotated tire corner at -0.002336312, leaving a 0.074836312-block margin. Retain the pre-growth margin below 0.075 blocks; do not enlarge it to the broader 0.30-block allowance. The roof tent mount follows `roofTop`; its ladder length follows the roof rise and its anchor and entrance follow the shell half width.

Placement stays `halfX=halfZ=1` and height 3: the 3x3x3 cells still hold the collision box. The visible model can extend outside those cells. `DIVE_DEPTH=ceil(carHeight)=3` stays unchanged. The 3.95-block footprint fits the existing arena starts, pool lane, and roof tent spot; the turn scenario checks its entire footprint against the arena floor.

The hardtop rib panel now uses `HARDTOP_FLAT_DENSITY=2` so its enlarged flat faces fit the atlas; rib sides retain density 4 and paint colours stay unchanged. Resource Pack manifest version rises from 0.1.248 to 0.1.249, with the matching Behavior Pack dependency (0015). The 7/13 hood scoop raises it to 0.1.250.

Geometry and pack tests check the measured proportions, enclosing probes, collision box, seat positions, placement, roof tent, and unchanged head-clearance guard. In-game scenarios run in CI through `.github/workflows/integration-test.yml` against BDS in four serial shards and a four-lane full-suite job. This note records no local BDS run or completed CI result. Client checks, including the owner's iPad horizon and the verification-branch silhouette on iPad with Vibrant Visuals and PC, remain pending.

### 2026-11-03: 8/13 (#1253), squared panel flares

Squared flares now use a flat top plate, vertical legs, a rubber lip, and a dark wheel-well panel, with a front fender vent and the lamp strip and turn signal on the front face. Shape-based landmarks complete `flare_reach` at 0.253296 D and `flare_top_height` at 1.446746 D; both leave `PENDING`. The front crest is 21.75 construction px and the rear crest is 18.5 construction px (about 1.23 D above the road). The flares define the widest shell point, changing `overall_width` from 2.212395 D to 2.233988 D; all three rows meet the unchanged 0.05 D tolerance. Five rows remain pending: the two hood scoop rows, `front_bumper_reach`, `step_height`, and `step_reach`. The shell half width grows to 1.5236328125 blocks, below the wheel hub caps at 1.57234375 blocks, so the rounded-up enclosing half width stays 1.58 blocks. Collision, seats, and placement clearance stay unchanged. Resource Pack version rises to 0.1.250 with its matching Behavior Pack dependency (0015); client verification remains pending.
