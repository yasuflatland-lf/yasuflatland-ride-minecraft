# 0212. Close a tent flap beside a neighbouring body

- Status: Accepted
- Date: 2026-11-03
- Supersedes in part: [0132](0132-open-and-close-each-tent-flap-alone.md): the player-or-mob closing blocker rule in Decision and the neighbouring-body blocker statement in Consequences

## Context

The trapezoid tent has a narrow front room. Adding 0.3 blocks of reach to
flap queries prevents closing beside the entrance: feet at
(1.13, -60, 10.59) are outside the bedroom flap cell at x=0, z=10,
but match the expanded query.

Removing that reach alone still refuses an intended close from the bedroom.
The visible bedroom extends into the doorway cell. In a live tent at yaw
180, feet at (0.67, -60, 10.74) look inside the bedroom but occupy its flap
cell at x=0, z=10. A closed flap fills that whole cell, so a player standing
there must move before it closes.

## Decision

- Keep queries at each flap cell's location with volume {1,1,1}, with no added
  reach. Check every cell, including both layers of every flap column. A
  neighbouring body overlapping the cell does not block closing.
- A mob-family entity (`families: ["mob"]`) with feet in a flap cell still
  refuses closing. Items and experience orbs do not block it.
- Players with feet in flap cells can close the flap. Move each player to
  the horizontal centre of the orthogonally adjacent cell on their side of
  the wall. Front and bedroom flaps use the tent's depth axis; left and
  right flaps use its local x axis. Determine the preferred side from the
  half of the flap cell containing the feet along that axis. At exactly
  the centre, prefer inside: larger depth for front and bedroom, toward
  the tent centre for left and right.
- The target's feet block and head block (cell y and y+1) must both be air
  or an open `yasu_ride:tent_flap`. An unreadable block is not free. If the
  preferred side is blocked, try the opposite neighbour; if neither is
  free, refuse closing.
- Check mobs and all player destinations before moving anyone. A refused
  close moves nobody, shows the existing blocker hint to the tapper, and
  leaves the tap window free. On success, teleport each player with
  `keepVelocity: false`, their original y and rotation, and no facing
  override. Moving the tapper shows no extra message.
- Keep pure exit geometry in `src/domain/camp`. The application calls
  `TentFlapWorld.clearPlayersForClose`; `BedrockTentWorld` implements the
  queries, block checks and teleports, preserving the layers of 0012.
  Opening, animation, restoration and retries retain 0132's rules.

## Consequences

A player can close the bedroom flap from the visible bedroom doorway,
including while their feet occupy the open flap cell. This explicitly
moves them up to an adjacent cell centre. A neighbouring body's overlap
is still left to the engine when the full-cell closed block is laid.

The two-block destination test accepts only air and open tent flaps. It
does not search farther away, test ground support, or reserve separate
cells for multiple players. We accept refusal when neither immediate
neighbour is free and accept multiple players sharing a free target.

Domain property tests verify adjacency, wall normals, feet-side choice,
inside centre ties, and targets outside the flap at arbitrary poses.
Application and adapter tests cover free tap windows, mob refusal,
all-or-nothing destination planning, fallback, open-flap targets, and
teleports preserving height and rotation. No live in-game relocation
scenario has been added yet; device behavior and engine displacement
remain unverified. Revisit if closing traps players or changes their
facing in game.
