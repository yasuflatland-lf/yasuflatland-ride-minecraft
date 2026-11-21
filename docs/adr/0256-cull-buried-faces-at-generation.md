# 0256. Cull buried faces at generation

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

## Measurements

Date: 2026-11-21. Face counts come from the `tests/packs/fixtures/render-budget/*.json` fixtures, compared between commit `a4c2c82a4` (unculled, Resource Pack 0.1.445) and `main` with all culling pull requests (Resource Pack 0.1.452). Small items (camping gear singles) also lose faces; the largest changes are below.

| Geometry                        | Faces before | Faces after | Change |
| ------------------------------- | ------------ | ----------- | ------ |
| camper                          | 64,974       | 50,154      | -22.8% |
| bulldozer                       | 22,164       | 19,011      | -14.2% |
| suv                             | 12,654       | 11,197      | -11.5% |
| tent                            | 10,254       | 9,096       | -11.3% |
| sportsboat                      | 8,508        | 7,555       | -11.2% |
| scooter                         | 15,363       | 14,940      | -2.8%  |
| scooter_paint                   | 3,038        | 3,034       | -0.1%  |
| camper drawer items             | 12,012       | 11,334      | -5.6%  |
| board / table decor pair (each) | 28,608       | 27,091      | -5.3%  |
| drawers decor pair              | 14,310       | 13,548      | -5.3%  |

Client frame rate was observed on an iPad with no FPS counter, so the result is qualitative ([ADR 0247](0247-precise-camping-gear-rotations-textures-and-cube-budget.md)). Camper 10, SUV 10 and gear 64 were smooth both before and after, with the same device, settings, position and heading. Vehicle counts are 10 rather than 16 because unowned vehicles are capped at 10 world-wide ([ADR 0066](0066-limit-vehicles-per-player-and-kind.md)).

Decision: inconclusive. The iPad could not tell the builds apart (likely capped at its refresh rate or under too little load), so the 10 percent frame-rate criterion was not evaluated. This ADR remains Proposed; it is neither Accepted nor Rejected. The face and vertex reduction is measured and real; its effect on frame rate is unmeasured. A device with a numeric FPS readout (Windows Game Bar or the Mac Metal HUD) running the same render benchmark in [manual-test.md](../manual-test.md) would settle it.
