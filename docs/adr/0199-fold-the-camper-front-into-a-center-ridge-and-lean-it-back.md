# 0199. Fold the camper front into a center ridge and lean it back

- Status: Accepted
- Date: 2026-10-31
- Related: [0067](0067-camper.md), [0084](0084-camper-hitbox-spans-the-bumper.md), [0106](0106-raise-the-camper-dashboard-to-the-windshield.md), [0190](0190-ribbed-camper-shell-atlas.md), [0166](0166-tilted-two-axis-sports-boat-helm-assemblies.md), [0167](0167-compound-rotation-assemblies-as-a-vehicle-neutral-rule.md)
- Pull requests: #1067 (1/5), #1068 (2/5), #1069 (3/5), #1070 (4/5), #1071 (5/5)

## Context

The camper front was drawn as one flat plane across its width, with only a 45 degree cut at each corner. The owner's front and front-right reference photos of a cab-over motorhome (no manufacturer name or logo is used) show a different shape. Seen from above, the two halves of the front fold back from a center ridge, so the middle sticks out like a flattened pyramid. Seen from the side, the whole face from the hood edge down to the bumper leans back.

None of the earlier camper ADRs fixes the front-face shape in its Decision. 0067 sets the body size and collision, 0084 the hitbox at the bumper, 0106 the dashboard height behind the windshield, and 0190 the rib atlas and trim. This ADR changes the front-face shape that those ADRs describe in passing, so it supersedes none of them; their links are enough.

## Decision

- Fold each zone back from a center ridge by a fixed depth, measured between the ridge line and the outer edges (model pixels, 16 px = 1 block):

| Zone | Ridge depth | Angle per side |
|---|---|---|
| Windshield (both panes) and the corner glass beside it | 4 px | about 11 degrees |
| Cab-over lower face, one panel per side, on the same ridge line as the windshield | 4 px | about 11 degrees |
| Hood front edge and the three-section upper grille | 2 px | about 5.5 degrees |

- Lean the whole front face, from the hood front edge down to the bumper, by 5 degrees from vertical about the hood edge height, so the top is the foremost point.
- Keep these parts flat across their width, with only the 5 degree lean: the lamp pods, the lower grille, the lamps, and the bumper. The roof lip, its five lamps, and the straight roof edge of the cab-over upper face stay as they were; the upper face's lower edge follows the crease ridge.
- Leave the headlight, turn signal, and grille slat designs, the side-view chevron of the cab-over, the dashboard, the seats, and the hitbox (0084) unchanged.
- Build the front in `tools/camper_front/`, split out of `tools/gen_camper.py` without changing its output: `shape.py` holds `FrontShape` (the ridge depths, the lean angle, the hood edge height, and the grille half span) with `ridge_dz` and `lean_dz`, `context.py` the shared build context, and `hood.py`, `grille.py`, `glass.py`, and `cap.py` one construction zone each. A tilted or yawed cube assembly goes through `tools/cube_tilt.py` and `ASSEMBLIES` (0166, 0167), never a hand-written compound rotation.
- Bump the Resource Pack version once for the whole series (0015) and regenerate the camper previews.

## Consequences

The front reads as a cab-over motorhome from the front and the front-right, and the side view shows the lean. The model gains many small cubes, because a leaning or folded face is cut into slices; the geometry file grows accordingly. Every value lives in `FrontShape`, so retuning is a one-line change and a `pnpm model` run. The ridge and lean values are chosen by eye from the photos; revisit them if the owner finds the nose too pointed or the lean too strong in game. The dev server caches the Resource Pack, so check the result after `pnpm server:restart` (0062).
