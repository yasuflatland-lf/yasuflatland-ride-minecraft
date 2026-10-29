# 0092. A bed in the parked camper

- Status: Accepted (extended by [0093](0093-decorate-the-parked-camper.md) and [0129](0129-share-room-primitives-between-features.md): the bed rule is shared; extended by [0133](0133-sleep-on-the-tent-mattresses.md): the tent mattresses)
- Date: 2026-10-21
- Extends: 0068

## Context

The owner long-pressed the bed in a parked camper at night and could not sleep. The bed is drawn only by the camper model (`tools/gen_camper.py`). The parked room of 0068 lays no block in its cells, so the tap reaches the floor block below, which does nothing. 0067 left the bed to a later ADR.

The [camper spike](../spike-camper.md) found on a phone that a custom bed block 9 px high with an `onPlayerInteract` custom component could set the spawn point, fade the camera, and skip the night (time 12542 to 23459). An entity with `minecraft:interact` never showed a sleep button, and a vanilla bed set by a script was invalid.

## Decision

- The parked room lays `yasu_ride:camper_bed` in the two cells under the model's bed: local x 1 (left), z -2 and -3, one layer above the floor. The block draws nothing (the model draws the bed) and cannot be broken. Its collision and selection boxes cover the whole cell up to 9 px, the height of the model's mattress. The room grows from 103 to 105 cells
- The bed cells belong to the room, not to the interior. Parking still checks 168 cells: the room's 105, the 40 interior cells at layers 1 and 2 outside the bed, the 21 roof cells, and the 2 exit cells. Departure reads 61 cargo cells (40 interior, 21 roof) and the 2 exit cells. A block placed on top of the bed is in an interior cell, so it keeps the camper parked like any other block
- Long-pressing or using a bed cell in the overworld sets the player's spawn point to that cell. From time of day 12542 to 23459, the player's screen also fades to black over 0.5 s, stays black for 1 s, and fades back over 0.5 s, and the time of day becomes 0 when the screen is fully black (10 ticks). At any other time, the player sees "You can sleep only at night". Outside the overworld the bed does nothing
- One player's sleep skips the night for everyone. The `playersSleepingPercentage` game rule is not read, because a player in a camper bed is not sleeping as far as the engine knows

## Consequences

- Players can stand on the bed but cannot walk through its cells
- After the camper departs, a player whose spawn point is in its bed respawns where it was parked, one block above the ground
- Unlike a vanilla bed, sleeping does not clear the weather, and a daytime thunderstorm does not allow sleeping
- Check on a phone that a player respawns standing on the bed, not stuck inside its 9 px box. If they get stuck, move the spawn point one cell up
