# 0159. A PBR rear-view mirror on the sports boat

- Status: Proposed
- Date: 2026-10-26
- Extends: [0051](0051-sports-boat.md), [0147](0147-light-the-lamps-with-a-pbr-emissive-layer.md)

## Context

The owner wants the sports boat's rear-view mirror to be a mirror surface that reflects what is behind the boat (#637). The mirror is a stalk, a gloss housing, and a 6.2 x 1.0 px glass cube facing aft over the helm half of the windshield's top rail. The glass used the shared `chrome` swatch, which the dash trim and other chrome parts also use, and had no texture region of its own.

A literal live rear view would need a camera rendered into a texture. Neither the stable Script API (0001) nor Resource Packs offer that. What Bedrock does offer is PBR: since 0147 the Resource Pack declares the `pbr` capability, and a texture set's MER map can make a surface metallic and smooth. Vibrant Visuals then reflects the environment it provides for PBR surfaces (sky, sun and moon highlights, ambient and nearby light) on it. The fire pit uses this for its polished steel (0153).

Texture sets are static and attach to one color texture. Putting MER on the 16 paint atlases would need 16 texture sets and would change the PBR look of the whole hull. 0147 already solved the same problem for the lamps with a separate pass that draws one bone with its own atlas and texture set.

## Decision

- Move the glass cube, unchanged in position and size, from `body` into a new `mirror` bone (parent `body`, pivot `[0, 7, 0]`) after `windshield`. The stalk and housing stay in `body`. Existing bone names and order are unchanged (0009).
- Append a `mirror` swatch `(200, 214, 228)` to the palette (cell 23, x 92-95) for the glass's thin edges. The aft face uses a new 16 x 8 tile at `uv [16, 16]`: a 1-texel rim `(54, 58, 64)` around a 14 x 6 glass area whose rows run linearly from sky `(150, 192, 232)` at the top to horizon `(236, 242, 246)` at the bottom. Every paint atlas carries the tile.
- Generate `sportsboat_mirror.png`, a copy of the default atlas, and `sportsboat_mirror_mer.png` with MER `(255, 0, 0)` (metalness 255, emissive 0, roughness 0) on the `mirror` swatch and the tile's glass area, and `(0, 0, 255)` elsewhere including the rim. `sportsboat_mirror.texture_set.json` uses format `1.16.100` with `color` `sportsboat_mirror` and `metalness_emissive_roughness` `sportsboat_mirror_mer`.
- Add `Texture.mirror` and an always-on `controller.render.yasu_ride.sportsboat.mirror` pass between the base pass and the conditional lit pass. It draws only the `mirror` bone with `Material.default` (`entity`). The base pass hides the `mirror` bone so the glass is not drawn twice.
- Raise the Resource Pack and the Behavior Pack's dependency on it to the next patch version (0015).

## Consequences

On Vibrant Visuals the glass is a smooth metal surface that reflects the environment the renderer provides and shifts as the boat turns. It is not a true image of the scene behind the boat: other players, mobs, and blocks behind the boat do not appear in it as in a real mirror. Without PBR (Vibrant Visuals off, or a device without support) the texture set is ignored and the baked gradient with its dark rim is what reads as a mirror.

The previews color each face by the center texel of its UV, so they show the glass in the middle gradient color. The scripts, collision, paint, lamps, and the other kinds do not change. Rendering is client side, so automated in-game tests cannot check the reflection; the owner checks it on a Vibrant Visuals device and on a device without it ([manual checklist](../manual-test.md), M1-M3). If the reflection looks wrong there, raise the roughness in `MER_MIRROR` before changing the wiring.
