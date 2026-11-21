# 0255. Forbid visible coplanar faces with a ratcheted model test

- Status: Accepted
- Decided in: #2174
- Date: 2026-11-21
- Extends: [0009](0009-vehicle-model-conventions.md): visible coplanar faces
- Extends: [0010](0010-testing-strategy.md): generated model regression checks

## Context

Overlapping cube faces on the same plane can flicker as the depth buffer alternates between them. The existing flicker was barely noticeable in game, so preserve the current models and block new findings. The camper fridge already has a stricter color-blind overlap check.

## Decision

Check each geometry in the main and test Resource Packs in Vitest. Apply the cube rotation and then the bone rotations from the owning bone to the root before comparing faces. Compare unordered pairs from different cubes in the same geometry. Count a pair when all five conditions hold.

1. The outward unit normals agree within 0.001, the plane offsets differ by at most 0.0001 model pixels, and the faces overlap by more than 0.0001 square model pixels.
2. The bones can render together. The exclusivity table covers decor-pair options at each end, camper item options in each drawer, beach chair and table forms, narrow and wide bulldozer blades, and monitor switch options within each switch group. A bone without its own option inherits the nearest ancestor's option. Two bones are exclusive when they have different options in the same slot.
3. The two faces are above ground contact or at least one has a side other than `down`. Two `down` faces within 0.0001 model pixels of the geometry's lowest world y are excluded.
4. Their mean RGB differs by more than 12 in at least one channel. Sample texel centers inside each normalized UV rectangle on the configured render texture, scaling from geometry texture dimensions to PNG dimensions. Use the nearest texel when the rectangle contains no texel center.
5. Each face samples at least one texel with nonzero alpha.

Assert that each geometry's count equals its fixture. Use zero when the fixture is absent. When removing findings, lower that geometry's count in the same change and optionally list cleaned bones in `cleanBones` to keep them free of findings. A mismatch reports the actual count and up to five pairs with the largest overlaps. Specify the bound render texture and any known exclusive bones in the [test configuration](../../tests/packs/coplanarFaces.config.ts).

Use at least 0.01 model pixels of offset when a generator separates a trim face from the surface below it. This is modeling guidance. The test checks coplanarity within its plane tolerance.

A Python check in `pnpm model:check` was rejected because the unit tests already generate the assets and own the pack assertions. Automatically deleting coincident faces was rejected because animation and visibility changes can expose those faces.

## Consequences

Existing findings can be fixed per geometry. The test covers per-face UV-mapped faces with positive geometric area in the model's unanimated pose. Cross-geometry overlays, such as `scooter_lit` over `scooter`, are outside its scope. The fridge test still rejects any qualifying overlap above 0.0001 square model pixels regardless of texture color.
