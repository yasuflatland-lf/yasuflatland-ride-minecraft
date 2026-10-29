# 0163. A glossy clear-coat sports boat hull

- Status: Proposed
- Date: 2026-10-26
- Extends: [0051](0051-sports-boat.md), [0147](0147-light-the-lamps-with-a-pbr-emissive-layer.md), [0159](0159-a-pbr-rear-view-mirror-on-the-sports-boat.md)

## Context

The owner asked for a black mirror finish on the sports boat hull (#642). The default hull is black, but all 16 paints already recolor its swatch (0051, 0031). The planks, sheer strake, gunwale cap, core, end caps, and gunwale walls all use that swatch, including the panels from 0161 and 0162.

As in 0159, "mirror" on Vibrant Visuals means environment reflections: sky, sun and moon highlights, ambient and nearby light. It does not show a live image of nearby blocks, mobs, or players. Stable APIs and Resource Packs do not supply a live camera texture.

0159's separate always-on pass draws a fixed atlas. Reusing it for the hull would force black under every paint, breaking the paint promise, or require 16 extra color atlases plus a hull bone. The path to `sportsboat_hull_light_blue.texture_set.json` would be 82 characters including the pack folder, exceeding the 80-character limit (0047).

## Decision

- Let the gloss follow the paint. Generate one texture set per paint atlas, including `sportsboat` for variant 0 and `sportsboat_black`, with no new bone, pass, render controller, or client entity change.
- Use `MER_HULL = (0, 0, 16)`: metalness 0, emissive 0, roughness 16/255 (about 0.06). This is a smooth dielectric clear coat. A metal takes its reflection color from its albedo; a near-black `(20, 20, 22)` metal would reflect almost nothing and look dull dark gray. The dielectric reflects the environment at Fresnel strength over the black base, like piano-black paint.
- Set `HULL_SLOT = NAMES.index("hull")`, cell 0, to MER_HULL on its 16 texels (x 0-3, y 0-3). Every other texel uses `MER_OFF = (0, 0, 255)`, as in 0147; alpha is 255 throughout. Each MER image is 128 x 32, matching its color atlas.
- For each atlas N, write `N_mer.png` and `N.texture_set.json` with format `1.16.100`, color N, and `metalness_emissive_roughness` N_mer. Keep 16 identical MER copies because sharing one MER between texture sets is untested. The longest texture-set paths, light_blue and light_gray, are 77 characters including the pack folder.
- Keep every color texel, geometry, lamps, mirror assets, and item icon unchanged. The non-PBR fallback remains flat paint with no baked highlight: a painted streak would read wrong as the boat rolls and pitches. Previews ignore MER and remain unchanged.
- Bump the Resource Pack header and module and the Behavior Pack's Resource Pack dependency from 0.1.145 to 0.1.146 to invalidate client caches (0015).

## Consequences

All paints get the same gloss; a new boat gets the requested glossy black hull. Automated tests pin each texture set, every MER texel, and the confinement of every hull cube's face UVs to cell 0. Existing lamp and mirror tests remain unchanged.

Owner device verification is pending. After a Resource Pack restart under the shared BDS lock, run H7-H10 in [the manual checklist](../manual-test.md) on black, white, and red before widening to all paints. Compare this dielectric against a locally generated `(255, 0, 0)` metal alternative on the device, then record the chosen result here. The metal alternative is not the shipped default; neither comparison has been confirmed. Check both a Vibrant Visuals device and a device without PBR. Automated server tests cannot establish client rendering behavior.

Two questions remain open. Should the gloss stay black whatever the paint, with paint moved elsewhere such as the stripe? This proposal preserves the existing paint behavior until the owner decides. Does MER_OFF on the non-hull texels look identical to having no texture set in Vibrant Visuals? 0147 uses the same value, but H9 must confirm the seats, teak, bimini, consoles, and tower. If H9 shows a change, raise it before merging. The fallback is a hull bone drawn by a pass whose texture array has 16 short-named per-paint hull atlases; adopting it requires an ADR change.
