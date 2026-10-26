# 0165. Cylindrical sports boat tower speakers

- Status: Proposed
- Date: 2026-10-26
- Extends: [0051](0051-sports-boat.md) (tower speakers), [0164](0164-long-sports-boat-bimini-panels.md) (`roof_top()` for the speaker mount height)

## Context

The two wake-tower speakers under the bimini read as octagonal stars: `disc()` builds every round section from two squares turned 0 and 45 degrees about z. The owner wants each round section to be a true-looking cylinder with the same silhouette and dimensions. The work runs as a series, one pull request per step, each branched on the previous one: 1/3 refactors the speaker block with no visual change, 2/3 and 3/3 then swap the round sections for cylinders.

## Decision

- Step 1/3 extracted `SPEAKER_SECTIONS`, `SPEAKER_SPOKES`, `SPEAKER_MOUNT` and `speaker(sx)` without changing the model. Step 2/3 replaces the bezel, LED ring and four stepped pod sections with `cylinder()`; step 3/3 follows on this branch and edits this ADR in place while it stays Proposed.
- `SPEAKER_SECTIONS` keeps all eight section radii, z ranges and swatches unchanged, relative to `G = B_REAR + 1.4`. The back and hub remain `disc()` sections, with the 12 split spokes and gloss mount unchanged.
- `cylinder()` uses `SPEAKER_SIDES = 12` (allowed range 8..16) tangent panels with `SPEAKER_WALL = 0.5`, clamped to the radius. Each panel has width `2 * r * tan(pi / sides)`, spans local y `r - wall .. r`, and turns about z only. Thus `r` is the polygon inradius and the outer corners reach `r / cos(pi / sides)` without extra overlap.
- Only the bezel rear and `pod_3` front ends get caps: each is a two-cube `disc()` of radius `r - 0.05` and thickness 0.1, in the section's swatch. Other ends meet their neighbours.
- Speaker cube count before step 2/3 (both speakers): 58 (29 per speaker). After: 186 (93 per speaker: 72 panels, 4 cap cubes, 4 back/hub disc cubes, 12 spokes and 1 mount). The complete model grows from 1,109 to 1,237 cubes.
- Tests check panel counts, z-only rotation spacing, tangent outer faces, shared vertices, silhouette bounds, end caps and per-swatch speaker counts.
- Bump both Resource Pack manifest versions and the Behavior Pack's resource dependency to 0.1.155. Regenerate the model and previews; manual test B27 checks the result on PC and mobile.

## Consequences

- One table holds every dimension of the speaker, so the cylinder steps change a single builder.
- `disc()` still serves the steering wheel pad, back and hub without modification.
- The four axial pod steps remain; manual test B27 must assess whether their taper needs an intermediate section. No extra section is added without visual evidence.
