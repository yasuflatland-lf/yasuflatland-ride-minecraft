# 0252. Budget client entity texture memory

- Status: Accepted
- Date: 2026-11-19
- Extends: [0193](0193-shared-texture-tooling.md): decoded texture memory and content deduplication
- Extends: [0251](0251-add-the-scooter-kind.md): appearance-preserving scooter texture allocation

## Context

The iPad client was killed for memory shortly after joining from v0.54.0. Bisection on a seeded DEFAULT world at view-distance 32 found no crash without the add-on or with v0.53.0; v0.57.0 crashed within 30 seconds. The same v0.57.0 with only scooter textures downscaled did not crash. Its 17 colour textures and 17 MER maps at 2048 x 1951 occupied about 518 MiB decoded, 91 percent of the Resource Pack. Clients load these textures on joining even when no scooter is visible. A device run with about 162 MiB of scooter textures plus the rest of the pack joined at view-distance 32 without crashing; 208 MiB is the resulting validated total ceiling, not a guarantee for every device or world.

Of 27,816 scooter faces, 20,550 already sampled shared swatches. Roughly 1,600 alpha-masked outline plates occupied about 94 percent of the atlas. Identical and mirrored region sharing reduced unique atlas area by about 35 percent; 15,844 faces already used negative UV sizes. Lit bones sampled only 0.78 percent of the full atlas. Paint occupied 62 percent, with the other 38 percent repeated across paints. Duplicate colour and MER files also occurred across the other generators.

After replacing the scooter paint MER map with a uniform value, the collected 149 pack files total 187,735,168 decoded bytes (179.038208 MiB). Rounding upward to an 8 MiB multiple gives 184 MiB.

## Decision

`tests/packs/textureMemory.test.ts` collects every texture referenced by `description.textures` in Resource Pack `entity/**/*.ce.json`, plus each string-valued `metalness_emissive_roughness`, `heightmap` and `normal` companion in its texture set. Texture paths omit `.png`; companion names resolve beside the texture set. Count each distinct file once as PNG header width times height times four bytes. The player override's vanilla `steve` and `cape_invisible` references are excluded only when the pack supplies neither file; other missing files fail.

Set `ENTITY_TEXTURE_BUDGET_BYTES` to 184 MiB. Assert both that the total fits and that the budget never exceeds 208 MiB. To update it, measure all collected files, round the total up to the next multiple of 8 MiB, and record the measurement. If the measurement exceeds 208 MiB, stop and report it in the issue; do not raise the ceiling.

A second test fails when two distinct files hold identical decoded pixels within the same role: a colour texture is identified by the pair of its pixels and its MER pixels or uniform MER value, because the client resolves a texture set by the colour path (0193), and a MER map is identified by its pixels alone. PNG compression does not affect equality. Both tests report the ten largest files with decoded MiB so failures identify useful reduction targets.

A variant may explicitly use `UniformMer` when every sampled texel in its pass has the same MER value. Write that value as a `[metalness, emissive, roughness]` list in the Bedrock texture set, without a companion PNG; do not infer uniformity automatically. Compare uniform MER values by value when deduplicating (colour, MER) pairs. Only scooter paint variants use `UniformMer(MER_BY_MATERIAL[Material.PAINT])`, producing `[0, 0, 90]`; the fixed pass retains its MER PNG. Existing leftover cleanup removes `scooter_paint_mer.png` and reports it stale under `--check`. This saves 9,306,624 decoded bytes (8.875488 MiB).

Use shared regions and mirrored UV mappings for identical texels. Give lit passes their own geometry and compact atlas, and partition fixed and paint faces into their own geometries so fixed texels are not repeated for every paint. Preserve the sampled texels of every shipped face in every paint and render pass. Committed preview PNGs must remain byte-identical; the preview renderer and `pnpm model:check` remain part of appearance verification under 0193.

After packing and relocating UVs, use `partition_geometry` to assign every scooter source face to exactly one of the fixed and paint passes. Use `select_faces` on each partition to drop fully transparent faces before finishing the passes. A face is clear when every texel in its `UvRect.texels()` rectangle has alpha 0 on its pass atlas. Both passes use `entity_alphatest`, so those faces draw nothing. Drop a cube from the pass when all its faces are removed. Keep every face of `headlights`, `tail_lights` and `glow_*` in their respective passes because those bones use materials without alpha testing.

The fixed and paint atlas layouts, regions and surviving face UVs stay the same. This decision saves no decoded paint atlas memory because the paint atlas is reused without repacking. Paint plate cropping is future work in [#2017](https://github.com/yasuflatland-lf/yasuflatland-ride-minecraft/issues/2017).

Multiplicative tint is rejected by owner decision. Rebuilding outlines with SUV-style geometry changes silhouettes and adds about 27,000 cubes, so it is rejected. Downscaling provided diagnostic evidence but changes appearance and is not the production solution.

## Consequences

Pack tests prevent future models from silently consuming the device-tested memory allowance or duplicating colour and MER content. The budget has roughly 5 MiB of headroom over the measured baseline, and new textures may require sharing or pass partitioning. Decoded RGBA size is a reproducible guard, not a measurement of total GPU or process memory; mipmaps and engine allocations are outside it. Revisit device evidence if rendering or loading changes, while keeping the 208 MiB ceiling for this policy.
