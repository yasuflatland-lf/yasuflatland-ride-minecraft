# 0259. Bedrock draws east on the minimum x side

- Status: Accepted
- Decided in: #2243
- Date: 2026-11-22
- Extends: [0009](0009-vehicle-model-conventions.md): face side convention
- Related: [0255](0255-forbid-visible-coplanar-faces-with-a-ratcheted-model-test.md)
- Related: [0256](0256-cull-buried-faces-at-generation.md)

## Context

The buried-face cull (0256), the preview renderer and the pack tests all assumed that a cube's `east` face sits on its maximum x side. In game it does not: Bedrock draws `east` on the minimum x side and `west` on the maximum x side. The cull therefore removed faces that face outwards. The camper showed a white body, an outline-only "W", a missing skirt, missing rim discs and holes.

The owner confirmed this on an iPad on 2026-11-22 with diagnostic builds of the camper geometry served from the dev BDS.

| Dev Resource Pack     | Change to `camper.geo.json`                        | Result in game                                                    |
| --------------------- | -------------------------------------------------- | ----------------------------------------------------------------- |
| 0.1.10123 / 0.1.10124 | Interior faces removed (12,039 and 25,061 faces)   | Exterior still wrong, so face count is not the cause              |
| 0.1.10125             | Side trim plates moved 0.4 px outwards             | Still wrong, so depth precision is not the cause                  |
| 0.1.10126             | All 14,652 culled faces restored                   | Correct                                                           |
| 0.1.10127             | Only the 5,867 culled `east`/`west` faces restored | Correct (`north`, `south`, `up` and `down` are handled correctly) |

An earlier hypothesis blamed swatch mip filtering. That change improved mip filtering but was not the cause of this symptom.

## Decision

In geometry files, each named face sits on this side of its cube:

| Face    | Side      |
| ------- | --------- |
| `east`  | minimum x |
| `west`  | maximum x |
| `north` | minimum z |
| `south` | maximum z |
| `down`  | minimum y |
| `up`    | maximum y |

Every tool that reasons about where a named face sits (the cull, the preview renderer, the pack tests) must use this convention through one shared value object, `tools/face_sides.py`, mirrored in `tests/support/modelFaces.ts` and checked by a parity test.

Generators that only name faces in UV maps are not affected: the names are what Bedrock reads.

## Consequences

- Every culled geometry is regenerated with the corrected convention in a follow-up change.
- Side-face UV orientation in the preview renderer stays position-based and is not changed by this decision.
- A wrong convention cannot be detected offline. A new convention of this kind needs an in-game check before tools depend on it.
