# 0166. Tilted two-axis assemblies on the sports boat helm

- Status: Proposed
- Date: 2026-10-26
- Extends: [0009](0009-vehicle-model-conventions.md) (one rotation axis per cube), [0051](0051-sports-boat.md) (x rotation sign)

## Context

The owner wants the sports boat's helm to look like a modern boat helm: the steering wheel tilted 30 degrees and the display tilted 45 degrees, both with the top leaning away from the driver, plus a painted switch plate and a controller block. The work runs as a series, one pull request per step, each branched on the previous one (1/7 to 7/7, issues #664 to #670): 1/7 adds a painted tile registry, 2/7 (this step) adds the helper and this ADR, 3/7 adds a clear coat to the dash swatch, 4/7 reworks the display, 5/7 tilts the wheel, 6/7 adds the switch plate and 7/7 the controller block.

ADR 0009 allows one rotation axis per cube. That is enough for the display, which is a single plate turned about x. The wheel is different: its 40 rim segments (three rings, so 120 cubes), spokes and chrome strips are each turned about z, the wheel's own axis. Tilting the wheel turns all of them about x as well, so a tilted wheel is an assembly of cubes that each carry two non-zero rotation axes.

## Decision

- `tilt_assembly(cubes, pivot, axis, degrees)` in `tools/cube_tilt.py` (re-exported by `tools/gen_sportsboat.py` next to `pair()`) moves a list of cubes rigidly, as one body, about the world line through `pivot` along `axis`. Only `"x"` is supported. Each cube's `origin`, `pivot` and `rotation` are rewritten, and `degrees == 0` returns unchanged copies. A cube without a `pivot` gets its origin as pivot.
- `degrees` has the sign of a cube's x rotation, so tilting a cube turned `[rx, 0, 0]` gives `[rx + degrees, 0, 0]`. A negative value tips +y toward +z before the 180-degree turn, which is a top leaning away from the driver (ADR 0051).
- Composition order assumed: `tools/render_preview.py` negates the x and z turns (`game_turn`) and then applies x, then y, then z about the cube's pivot, so a cube with game rotation `[rx, ry, rz]` has the matrix `Rz(-rz) * Ry(ry) * Rx(-rx)` in the preview's math. This is the order Blockbench uses for Bedrock models (z outermost, x innermost) and the same convention the existing x and z rotations were pinned against in game (0051, 0058). The tilt multiplies the cube's matrix on the left by `Rx(-degrees)`, and the product is decomposed back into the same order, with gimbal lock (y at +-90 degrees) putting the whole turn on z. A cube turned `[0, 0, rz]` ends up with `Rx(-a) * Rz(-rz)` in that order.
- `ONE_AXIS_EXCEPTION` lists the assemblies that may carry a two-axis rotation. Today it holds only `"wheel"`, used by 5/7. `tilt_assembly` takes an optional `assembly` name and raises if a result would have more than one non-zero axis and the name is not listed. A test fails for any cube in the shipped model with more than one non-zero axis, so only a change that adds the wheel tilt can relax it, and only for the wheel's cubes.
- In-game check: the order above is an assumption made from the preview and from earlier in-game pins, not a measurement of a two-axis cube. 5/7 is not done until a device check (a row in `docs/manual-test.md`) shows the tilted wheel with no skew of the rim. If the game composes the axes in another order, change the one function and regenerate.
- Tests: property tests (fast-check) show that tilting by `a` and then `-a` returns the original cubes within 1e-9, that the distance between any two cube pivots is preserved, and that the composed matrix of a tilted cube equals `Rx(-a) * Rz(-rz)`.
- Helm cube count (the block "Helm console ... throttle", including the passenger console, the cupholders and the throttle): 164 before this step and 164 after. The whole model stays at 1109 cubes, and the generated `sportsboat.geo.json` does not change.
- No Resource Pack change, so the manifest versions stay as they are.

## Consequences

- 5/7 can tilt the wheel by one call instead of hand-composing angles, and the exception stays limited to the wheel.
- A cube with two rotation axes is harder to edit by hand and is only trusted after the device check; the helper is the only way the series adds one.
- Later steps of the series edit this ADR in place while it stays Proposed.
