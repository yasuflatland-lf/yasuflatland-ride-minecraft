# 0165. Cylindrical sports boat tower speakers

- Status: Proposed
- Date: 2026-10-26
- Extends: [0051](0051-sports-boat.md) (tower speakers), [0164](0164-long-sports-boat-bimini-panels.md) (`roof_top()` for the speaker mount height)

## Context

The two wake-tower speakers under the bimini read as octagonal stars: `disc()` builds every round section from two squares turned 0 and 45 degrees about z. The owner wants each round section to be a true-looking cylinder with the same silhouette and dimensions. The work runs as a series, one pull request per step, each branched on the previous one: 1/3 refactors the speaker block with no visual change, 2/3 and 3/3 then swap the round sections for cylinders.

## Decision

- Step 1/3 extracted `SPEAKER_SECTIONS`, `SPEAKER_SPOKES`, `SPEAKER_MOUNT` and `speaker(sx)` without changing the model. Step 2/3 replaced the bezel, LED ring and four stepped pod sections with `cylinder()`. Step 3/3 completes all round sections and edits this ADR in place while it stays Proposed.
- `SPEAKER_SECTIONS` keeps all eight radii, z ranges and swatches unchanged, relative to `G = B_REAR + 1.4`. The 12 split spokes and gloss mount stay unchanged. The speaker block no longer calls `disc()`.
- Hollow `cylinder()` sections use `SPEAKER_SIDES = 12` (even, allowed range 8..16) tangent panels with `SPEAKER_WALL = 0.5`, clamped to the radius. Each panel has width `2 * r * tan(pi / sides)`, spans local y `r - wall .. r`, and turns about z only. Thus `r` is the polygon inradius and outer corners reach `r / cos(pi / sides)` without extra overlap.
- Add `solid=False` to `cylinder()`. For `solid=True`, use `sides // 2` diametral panels, each spanning y `cy - r .. cy + r`, with the same tangent width, pivot `[cx, cy, z0]`, and z-only rotation `360 * k / sides`. This merges opposite radius-thick panels into one box through the axis: the union is identical, and same-swatch coplanar overlap is acceptable. Add no other cubes. Any solid section with `r < 1.0` uses `min(SPEAKER_SIDES, 8)` sides, including the hub and pod tip.
- Make the back and hub solid. A literal radius-thick panel per side would bring the model's two speakers to 210 cubes, above the 186 budget. Diametral panels reduce the back to six cubes and hub to four per speaker.
- Drop the hidden bezel rear cap: the bezel panels' own rear faces cover radii 1.4..1.9 and the solid back of radius 1.6 covers the middle. Also make `pod_3` solid, a deliberate deviation from changing only the back and hub: its hollow body and tip cap cost 14 cubes, while the solid eight-sided section costs four. Its cap is unnecessary. Remove the `caps` argument entirely; no caller needs it.
- The spokes' radial outer ends are `1.05 + 0.55 = 1.6`, inside the bezel's inscribed circle `1.9 * cos(pi / SPEAKER_SIDES)`, approximately 1.835. Their split offsets and thickness also keep all corners inside this circle; no spoke changes are needed.

| Section | Radius | Sides | Construction | Cubes per speaker |
|---|---:|---:|---|---:|
| Back | 1.6 | 12 | Solid diametral panels | 6 |
| Hub | 0.45 | 8 | Solid diametral panels | 4 |
| Bezel | 1.9 | 12 | Hollow tangent panels | 12 |
| Blue LED ring | 1.95 | 12 | Hollow tangent panels | 12 |
| `pod_0` | 1.9 | 12 | Hollow tangent panels | 12 |
| `pod_1` | 1.6 | 12 | Hollow tangent panels | 12 |
| `pod_2` | 1.15 | 12 | Hollow tangent panels | 12 |
| `pod_3` | 0.6 | 8 | Solid diametral panels | 4 |
| Split spokes | | | Unchanged | 12 |
| Mount | | | Unchanged | 1 |
| Total | | | | 87 |

| Stage | Both speakers | Complete model |
|---|---:|---:|
| 1/3, before cylinders | 58 | 1,109 |
| 2/3, hollow sections with caps | 186 | 1,237 |
| 3/3, final | 174 | 1,225 |

- Enforce the final count of 174 speaker cubes, below the 186 budget. Tests check all sections' panel counts, z-only rotation spacing, tangent outer faces, shared vertices, silhouette bounds, spoke clearance, and swatch counts. Every speaker cube must be a section panel, spoke or mount; no two-square discs or separate caps remain.
- Bump both Resource Pack manifest versions and the Behavior Pack's resource dependency to 0.1.156. Regenerate the model and previews; manual test B27 checks the result on PC and mobile.

## Consequences

- One table holds every dimension of the speaker, so the cylinder steps change a single builder.
- `disc()` still serves the steering wheel pad without modification.
- The four axial pod steps remain; manual test B27 must assess whether their taper needs an intermediate section. No extra section is added without visual evidence.
- PC and mobile checks remain pending: inspect from the rear, below and side against `docs/images/sportsboat-rear.png`, keeping the blue ring and spoke grille unchanged.
