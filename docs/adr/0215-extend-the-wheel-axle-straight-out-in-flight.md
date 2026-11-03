# 0215. Extend the wheel axle straight out in flight

- Status: Accepted
- Decided in: #1280
- Date: 2026-11-04
- Supersedes in part: [0043](0043-wheel-arms.md): the diagonal flight arm, its root, the fold offsets and manual translation synchronization
- Related: [0022](0022-fold-wheels-and-glow-in-flight.md): wheel folding and exclusive bone transforms
- Related: [0033](0033-lower-the-wheels-before-touchdown.md): landing gear transitions
- Related: [0214](0214-replace-the-suv-with-the-rubicon-shape.md): larger wheels and overfenders

## Context

The Rubicon wheels have construction radius D/2, where D = 26.1/2.064 = 12.645 px. The old 6 px outward travel and 4 px drop were chosen for the smaller model. The body side is 0.885 D from the centre, but its overfenders and mirrors reach about 1.16 D. At each axle the side wall is an open wheel well: a flight shaft must continue the solid axle beam, which ends at the tyre's inner face, rather than emerge from a side wall above the axle.

## Decision

- Keep the four `arm_*` bones parented to `root`. Each contains one unrotated gunmetal shaft along x, `ARM_THICK` = 1.4 px square in y and z. Its pivot is at `ARM_ROOT_X` = `HUB_X - TIRE_HALF_WIDTH`, `ARM_ROOT_Y` = `HUB_Y`, at the wheel's axle z. The cube starts 0.2 px inside the beam end and finishes at the folded hub centre.
- In `tools/suv_dims.py`, set `OVERFENDER_HALF_WIDTH` = 1.16 D and `FOLD_CLEARANCE` = 0.5 px. Derive `FOLD_OUT` = `OVERFENDER_HALF_WIDTH + FOLD_CLEARANCE + ROAD_WHEEL_RADIUS - HUB_X` (9.1621 px). The folded tyre clears the overfenders in plan. If collision tests require more travel, extend the axle farther out.
- Derive `FOLD_DROP` = `TIRE_HALF_WIDTH + ARM_THICK / 2` (3.4188 px) and `FOLDED_WHEEL_TOP_Y` = `HUB_Y - FOLD_DROP + TIRE_HALF_WIDTH`. The tyre hangs directly below the shaft. Its tread face stays about 0.185 px above the ground; its hub cap reaches about 0.495 px below it, retaining the old folded pose's ground relationship.
- Keep the hand-authored one-second timing and opposite 90-degree z rotations. `sync_animation()` rebuilds translations from the dimensions on every model generation. Deploy scales each flight shaft from `[0, 1, 1]` to `[1, 1, 1]`; retract reverses it. Hover holds `[1, 1, 1]`; ground, dive, submerged and surface pin `[0, 0, 0]`.
- Keep the existing form controller: its states already serialize wheel spin, fold and submarine transforms, and each state selects exactly one animation that controls the arms. Keep `SUB_OUT` = 8 px, submarine arms and props, and the rear wheels' submarine y rotations unchanged.
- Verify each wheel's cubes after cube rotation, wheel rotation about its pivot and animation translation, using the game's x/z rotation signs. An exact oriented-box separating-axis test against every body and descendant cube checks the folded pose and deploy at t = 0.25, 0.5 and 0.75. Keep road shafts invisible and existing seat and head clearance tests intact.

## Consequences

The SUV loses 32 cubes: four nine-cube diagonal assemblies become four single shafts. Its folded hubs sit about 21.491 px out, close to the old model's 21.5 px. The generated preview shows straight shafts without a renderer special case. Resource Pack version 0.1.250 invalidates cached assets.

The geometric samples and existing submarine clearance tests pass without additional outward travel or submarine changes. They do not replace a client check of attachment and appearance during animation. Revisit the axle travel if a future wheel or body change fails these collision checks; keep the drop tied to the shaft underside.
