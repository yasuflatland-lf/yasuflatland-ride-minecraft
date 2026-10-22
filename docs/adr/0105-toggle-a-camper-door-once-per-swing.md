# 0105. Toggle a camper door once per swing

- Status: Accepted (extended by [0114](0114-open-the-camper-wall-cabinet.md): the wall cabinet doors keep a window each)
- Date: 2026-10-22
- Extends: 0068, 0094

## Context

0068 makes a tap on any entry door cell open or close the door, and 0094 (with the block from 0098) does the same for the shower-toilet door. Each tap that reaches the door block's custom component toggles the door.

In the play test on 2026-10-22 (#423) the entry door often did not open with an empty-hand tap. Temporary server logging showed that one tap often arrives as two `playerInteractWithBlock` events, both with `isFirstEvent` true, 150 to 200 ms (3 to 4 ticks) apart. The door opened on the first and closed on the second, so it looked as if nothing happened. The second event likely comes from the client pressing again after the door's selection box changed under the pointer: the shut door is a 2 px plate, the open door fills its cell. `isFirstEvent` cannot tell the two apart.

## Decision

- A tap toggles a camper door only when that door's last toggle was at least one swing, `CAMPER_SPEC.doorSwingTicks` (10 ticks, half a second), earlier. A tap inside that window does nothing
- The window runs from the last toggle, not from the last tap, so an ignored tap does not push the next toggle back. A player who taps again after the swing has finished always toggles the door
- The entry door and the shower-toilet door each keep their own window. The shower run (0094) is not a toggle and is not limited
- The drive keeps the window, with the tick passed in from the use case's clock, as the headlight switch does (0024). `doorSwingTicks` is also the number of swing steps, so the window and the animation cannot drift apart
- The window is not saved. After a reload the first tap always toggles

## Consequences

- One tap opens or closes the door once, even when the client sends it twice
- Two deliberate taps within half a second toggle the door once. A player who changes their mind mid-swing has to wait for the swing to finish, which matches what they see
- The seat press idle time (0097) differs on purpose: a held seat press repeats every few ticks and must place one item, so each press restarts its idle time. A door tap does not repeat that way, and restarting would let a fast tapper lock the door
