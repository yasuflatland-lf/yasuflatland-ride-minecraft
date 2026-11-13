# 0199. Square the camper front and fold the grille

- Status: Proposed
- Acceptance condition: the owner checks the squared camper front and the folded grille on a client and sees no shimmer or z-fighting (#1077)
- Date: 2026-11-01
- Supersedes in part: [0067](0067-camper.md): the camper front geometry
- Supersedes in part: [0091](0091-alpha-blend-only-the-camper-glass.md): corner glass, now removed
- Supersedes in part: [0190](0190-ribbed-camper-shell-atlas.md): front geometry

## Context

The owner's play-test request on 2026-11-01 asked for a squarer camper front:
no 45-degree chamfered corners, a windshield running edge to edge, and the
black panel around the lights reaching the edge. The owner supplied reference
photos of a square-fronted camper-van.

## Decision

Generate the front with `tools/gen_camper.py` without 45-degree corners. The
windshield and grilles run edge to edge, and the black panel around the lights
reaches the edge. The upper and lower grilles each consist of two thin panels
meeting at a crease, at 175 degrees seen from the front. Each half is rolled
2.5 degrees. The lower louvers are laid out from the upper frame's bottom edge
downward, so no black gap shows under it. The outer trim keeps a 0.4 px inset
(`EDGE_INSET`). A property test in `tests/packs/camper/front.test.ts` caps any dark run
under the upper frame at 0.5 px (the model measures 0.45 px).

Remove the corner glass from 0091's `glass` bone. The windshield, side windows,
mirror, and rear window stay in that alpha-blended bone.

The squaring changed only cubes whose origins were ahead of z = -47.5; every
previous cube at or behind that boundary remains unchanged. The golden snapshot
in `tests/packs/fixtures/camper-cubes/` was regenerated deliberately for the
new geometry. `tests/packs/camper/snapshot.test.ts` now compares every non-glow cube
against that snapshot in full, including the squared front.

## Consequences

Use Resource Pack version 0.1.225 so clients refresh the assets (0015).
Regenerate the previews in `docs/images` and the pack icons with `pnpm model`.

The panels are thin, so the crease is only visible head-on. The client look
needs an owner check. Revisit the panels if the crease shimmers or z-fights.
