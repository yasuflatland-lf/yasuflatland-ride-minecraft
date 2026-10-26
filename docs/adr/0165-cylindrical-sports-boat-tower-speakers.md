# 0165. Cylindrical sports boat tower speakers

- Status: Proposed
- Date: 2026-10-26
- Extends: [0051](0051-sports-boat.md) (tower speakers), [0164](0164-long-sports-boat-bimini-panels.md) (`roof_top()` for the speaker mount height)

## Context

The two wake-tower speakers under the bimini read as octagonal stars: `disc()` builds every round section from two squares turned 0 and 45 degrees about z. The owner wants each round section to be a true-looking cylinder with the same silhouette and dimensions. The work runs as a series, one pull request per step, each branched on the previous one: 1/3 refactors the speaker block with no visual change, 2/3 and 3/3 then swap the round sections for cylinders.

## Decision

- Step 1/3 (this step): turn the "Tower speakers" block of `tools/gen_sportsboat.py` into data plus one function, with no change to the generated `sportsboat.geo.json`.
- `SPEAKER_SECTIONS` lists the eight round sections as `(name, r, z0, z1, swatch)`, with z relative to `G = B_REAR + 1.4`: `back`, `hub`, `bezel`, `ring` and four stepped `pod_*` sections. `SPEAKER_SPOKES` and `SPEAKER_MOUNT` name the 12 grille spokes and the mount box. Values are unchanged.
- `speaker(sx)` returns the cubes of one speaker. The module appends the result for `sx` in `(-B_HALF / 2, B_HALF / 2)`. Cube order in the model is unchanged: the spokes still sit between the back disc and the hub.
- Later steps replace the `disc()` call per section with a cylinder built from thin flat panels laid tangent around the z axis, each turned about z only (0009). They edit this ADR in place while it stays Proposed.
- Speaker cube count before this step (both speakers): 58, that is 29 per speaker (16 disc cubes, 12 spokes, 1 mount). After this step: 58.
- A test counts the speaker cubes in the shipped model by swatch, as the baseline that 2/3 and 3/3 change in place.
- No Resource Pack change, so the manifest versions stay as they are.

## Consequences

- One table holds every dimension of the speaker, so the cylinder steps change a single builder.
- `disc()` still serves the steering wheel pad and is not touched.
