# 0255. Cull buried faces at generation

- Status: Proposed
- Acceptance condition: the owner records the before and after numbers in parts 3/13 and 13/13 of the rendering series
- Date: 2026-11-21

## Context

Bedrock draws each face declared in a cube's per-face UV map. A static scan
found 28,547 of the camper's 64,670 faces inside another cube. The scan
ignored cut-outs and glass, so its count is an upper bound on potential
savings. Removing a buried face saves four vertices.

## Decision

Remove a face only when all four rules hold.

1. The target and occluder are distinct cubes in the same bone. A bone moves
   both together. Its scale is affine, including non-uniform and zero scale,
   so containment survives animation.
2. The occluder has positive size on all three axes. Its present faces must
   sample only alpha-255 texels in every bound texture, including paint
   variants, lit, mirror, and fixed passes. The generator supplies the
   textures and their UV spaces for each face.
3. Shift each of the target face's four corners 0.001 px along its outward
   normal and apply the inverse of the occluder's cube rotation about its
   pivot. All four shifted corners must be strictly inside along the normal
   axis and inside within an inclusive 1e-6 px tolerance laterally. For an
   oblique face, use the axis with the largest absolute component of the
   transformed normal. A single convex box must contain all four corners.
   Flush faces facing the same way and faces covered only by a union of
   boxes remain.
4. The target and occluder belong to a bone outside the generator's excluded
   globs. Exclude all bones that can bind a blend material and exclude every
   bone of a block using a blend render method. Excluded bones keep all
   their faces. Zero-thickness cubes can lose faces, and only cubes with
   positive size on every axis can serve as occluders.

## Consequences

Keep cube order and bone order. Drop cubes that lose all their faces and
return an index map for callers that refer to the original cubes. When a
generator adopts the pass, it records the textures, exclusions, and removal
counts in a tracked fixture. The pack tests check the record against the
render bindings and the model freshness check checks the generated record.

Cross-bone culling would allow moving or toggling a door, wheel, or folding
part to expose a removed face. Hand deletion would lose the changes on
regeneration.
