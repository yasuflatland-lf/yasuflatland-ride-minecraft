# 0170. Measure SUV proportions before reshaping

- Status: Proposed
- Date: 2026-10-27

## Context

Issue #731 starts a four-part SUV proportion revision. The owner supplied an oblique model preview with a blue greenhouse outline and a side photograph with blue and red outlines. The images remain local and are not repository assets. Only proportions inform this decision; no lettering, badge, logo, or other brand mark is copied. The eight-slot grille and model contracts in 0009 remain.

The blue frame means the greenhouse from the belt line to the roof top, and from its rear edge to the windshield foot. The red frame means everything below the belt line to the ground, including the wheels, over the full bumper-to-bumper length. The rear spare also contributes to the overall rear extent. The oblique preview identifies parts, but its perspective cannot supply side-view ratios directly.

On the reference photograph (2050 x 1130 source pixels, displayed at 2048 x 1129), approximate stroke-center readings are: red rear x=94, front x=1846, belt y=394, ground y=855; blue rear x=155, windshield foot x=1285, roof y=92. Thus L=1752 image pixels, greenhouse length=1130, height=302, rear gap=61, front gap=561, and belt height=461. The blue lower stroke is slightly above the red belt stroke; use the shared red belt datum rather than treating that drawing gap as a vehicle part. A road tire spans approximately y=535 to 840 (305 pixels). Stroke thickness, perspective, and the frame's margin around the silhouette limit precision: these are annotated-frame targets, not engineering dimensions of the photographed vehicle.

The generated model takes precedence over the issue's rough current-SUV estimates. In the final front-at-minus-z geometry, the body spans z=-29.55 to 35.5, so L=65.05 model pixels, not 67.5. This includes bumper details and the spare. The roof rear is z=32, the rotated windshield foot is z=-12.953154, the belt is y=17, and the highest roof ribs reach y=30.3. Road tire bounds span y=-0.025904 to 12.025904, slightly beyond the nominal radius-six circle because of the tread cubes.

## Decision

Record the following ratios to L. Each tolerance is absolute, not a percentage of the target. `TARGETS` in `tools/suv_proportions.py` uses these keys and exposes each row as `ratio` and `tolerance`.

| Measure / key | Target | Tolerance | Current generated SUV |
|---|---|---|---|
| Greenhouse length / `greenhouse_length` | 0.645 | +/-0.01 | 0.691055 |
| Greenhouse height / `greenhouse_height` | 0.172 | +/-0.01 | 0.204458 |
| Greenhouse rear edge to overall tail / `greenhouse_rear_gap` | 0.035 | +/-0.01 | 0.053805 |
| Windshield foot to front end / `windshield_front_gap` | 0.320 | +/-0.01 | 0.255140 |
| Belt height from ground / `belt_height` | 0.263 | +/-0.01 | 0.261736 |
| Road wheel diameter / `wheel_diameter` | 0.174 | +/-0.01 | 0.185270 |

Load the pure measurement module through `tools/tool_loader.py`. `measure(cubes_by_bone)` accepts a mapping of bone names to cube lists in the generated coordinate frame, before animation. It reads only the `body` and four road wheel bones, does not import the writing generator, performs no I/O, and leaves its arguments unchanged. Other bones, including doors and sealed glass, do not define these landmarks.

Measure each cube's eight corners about its pivot with the shared rotation convention `Rz(-rz) * Ry(ry) * Rx(-rx)` (0167), as in the camping gear bounds calculation. Use these geometric landmark rules rather than cube indices, UV colors, or fixed generator coordinates:

- The widest body cube with a negative x-only rotation is the windshield lower frame. Its pivot y is the belt datum and its rotated minimum z is the windshield foot.
- The unrotated horizontal plate above the belt with the largest x-z area is the roof. Its maximum z is the greenhouse rear. The body's maximum y includes the roof ribs.
- Body minimum and maximum z define overall length, including the bumpers and spare. The greenhouse rear gap is to that overall tail, not to the tailgate panel.
- The lowest road wheel bound defines ground. Average the four wheels' vertical bound spans for diameter; this remains meaningful under a z-only stretch.

First name the generator dimensions without changing output (#732). Then reshape the greenhouse (#733), followed by the lower body (#734). Keep the colors and parts list. Keep wheel hub positions and size, seats, doors, hitbox, and wheel animations fixed unless a later PR explicitly changes them and records its reason. The wheel target is therefore diagnostic while wheel size is fixed; this ADR does not authorize resizing wheels to satisfy it. Preserve the camper and bulldozer placement rules in 0142 and 0143, including their own clearance heights and the shared SUV-sized footprint, unless a later PR justifies a change.

This first step adds measurement and property tests only. Do not assert target compliance yet; the greenhouse and lower-body PRs enable the relevant checks. Do not change generator output, packs, manifests, or previews.

## Consequences

The series has repeatable measurements and an explicit baseline rather than relying on the oblique preview or stale estimates. The current greenhouse is longer relative to overall length than the annotated target, contrary to the initial estimate, so later edits must use measured results rather than blindly lengthening it.

Shape-based landmark selection depends on the current construction: a different windshield, a larger horizontal accessory above the belt, or an accessory taller than the roof requires revisiting the selectors. Tests cover known geometric fixtures, rotation about an offset pivot, uniform scaling, z-only stretching, determinism, and input preservation; they do not prove arbitrary models have SUV landmarks. Revisit these rules if the construction or interpretation of the frames changes. The photograph's loose frames and fixed mechanical contracts may prevent all targets being met simultaneously; resolve that explicitly in the later PR rather than silently changing tolerances or mechanical dimensions.
