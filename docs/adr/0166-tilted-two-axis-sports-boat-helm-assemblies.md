# 0166. Tilted two-axis assemblies on the sports boat helm

- Status: Proposed
- Date: 2026-10-26
- Extends: [0009](0009-vehicle-model-conventions.md) (one rotation axis per cube), [0051](0051-sports-boat.md) (x rotation sign)

## Context

The owner wants the sports boat's helm to look like a modern boat helm: the steering wheel tilted 30 degrees and the display tilted 45 degrees, both with the top leaning away from the driver, plus a painted switch plate and a controller block. The work runs as a series, one pull request per step, each branched on the previous one (1/7 to 7/7, issues #664 to #670): 1/7 adds a painted tile registry, 2/7 adds the helper and this ADR, 3/7 (this step too) adds a PBR clear coat to the dash swatches, 4/7 reworks the display, 5/7 tilts the wheel, 6/7 adds the switch plate and 7/7 the controller block.

ADR 0009 allows one rotation axis per cube. That is enough for the display, which is a single plate turned about x. The wheel is different: its 40 rim segments (three rings, so 120 cubes), spokes and chrome strips are each turned about z, the wheel's own axis. Tilting the wheel turns all of them about x as well, so a tilted wheel is an assembly of cubes that each carry two non-zero rotation axes.

## Decision

- `tilt_assembly(cubes, pivot, axis, degrees)` in `tools/cube_tilt.py` (re-exported by `tools/gen_sportsboat.py` next to `pair()`) moves a list of cubes rigidly, as one body, about the world line through `pivot` along `axis`. Only `"x"` is supported. Each cube's `origin`, `pivot` and `rotation` are rewritten, and `degrees == 0` returns unchanged copies. A cube without a `pivot` gets its origin as pivot.
- `degrees` has the sign of a cube's x rotation, so tilting a cube turned `[rx, 0, 0]` gives `[rx + degrees, 0, 0]`. A negative value tips +y toward +z before the 180-degree turn, which is a top leaning away from the driver (ADR 0051).
- Composition order assumed: `tools/render_preview.py` negates the x and z turns (`game_turn`) and then applies x, then y, then z about the cube's pivot, so a cube with game rotation `[rx, ry, rz]` has the matrix `Rz(-rz) * Ry(ry) * Rx(-rx)` in the preview's math. This is the order Blockbench uses for Bedrock models (z outermost, x innermost) and the same convention the existing x and z rotations were pinned against in game (0051, 0058). The tilt multiplies the cube's matrix on the left by `Rx(-degrees)`, and the product is decomposed back into the same order, with gimbal lock (y at +-90 degrees) putting the whole turn on z. A cube turned `[0, 0, rz]` ends up with `Rx(-a) * Rz(-rz)` in that order.
- `ONE_AXIS_EXCEPTION` lists the assemblies that may carry a two-axis rotation. Today it holds only `"wheel"`, used by 5/7. `tilt_assembly` takes an optional `assembly` name and raises if a result would have more than one non-zero axis and the name is not listed. A test fails for any cube in the shipped model with more than one non-zero axis, so only a change that adds the wheel tilt can relax it, and only for the wheel's cubes.
- In-game check: the order above is an assumption made from the preview and from earlier in-game pins, not a measurement of a two-axis cube. 5/7 is not done until a device check (a row in `docs/manual-test.md`) shows the tilted wheel with no skew of the rim. If the game composes the axes in another order, change the one function and regenerate.
- Tests: property tests (fast-check) show that tilting by `a` and then `-a` returns the original cubes within 1e-9, that the distance between any two cube pivots is preserved, and that the composed matrix of a tilted cube equals `Rx(-a) * Rz(-rz)`.
- Helm cube count (the block "Helm console ... throttle", including the passenger console, the cupholders and the throttle): 164 before this step and 164 after. The whole model stays at 1109 cubes, and the generated `sportsboat.geo.json` does not change.
- No Resource Pack change in 2/7, so the manifest versions stayed as they are there.
- 3/7, dash clear coat (extends [0163](0163-a-glossy-clear-coat-sports-boat-hull.md)): `MER_GLOSS = (0, 0, 24)` (metalness 0, emissive 0, roughness 24/255) is written to the `gloss` and `frame` swatch cells (`GLOSS_SLOTS`, 16 texels each) of every paint atlas's MER image, next to `MER_HULL` on the hull cell. Roughness 24 is slightly softer than the hull's 16, so the large flat dash reflects the sky and light softly rather than mirroring like water. Every other texel stays `MER_OFF`, and the lamp and mirror atlases are unchanged. Colour atlases, UVs and `sportsboat.geo.json` do not change, so previews and item icons stay as they are. Tests pin all MER texels of the 16 paint atlases.
- Cubes that use `gloss` or `frame`, and so all change look together (by region): the helm dash, the passenger console and their tops; the display and its side panel and the switch plate; the steering wheel's pad centre, cap-side parts, cowl and column; the throttle housing and lever arm; the cupholder inserts; the engine tunnel, centre housing, keel and bores and the dash rail; the cone; the rear-view mirror stem and bar; the speaker mount and each speaker's back disc; and the `frame` rails, posts and cross bars of the windshield, bimini side rail and tower rack. If the owner wants a region left flat, it needs its own swatch.
- Helm cube count: 164 before 3/7 and 164 after; the model stays at its cube count because this step changes no geometry.
- Resource Pack and Behavior Pack dependency manifests go to 0.1.157 for 3/7, because the MER images change.
- Open question for the owner: on a Vibrant Visuals device the dash, consoles and display bezel should show soft sky and light reflections (manual test row B31). The verdict is recorded here once known.

## Consequences

- 5/7 can tilt the wheel by one call instead of hand-composing angles, and the exception stays limited to the wheel.
- A cube with two rotation axes is harder to edit by hand and is only trusted after the device check; the helper is the only way the series adds one.
- Later steps of the series edit this ADR in place while it stays Proposed.
