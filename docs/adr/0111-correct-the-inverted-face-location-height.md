# 0111. Correct the inverted face location height

- Status: Accepted
- Date: 2026-10-22
- Extends: 0110 (picking decor slots along the line of sight)

## Context

After 0110, a saucepan still landed on the same stove burner whichever burner the player pressed (#434). Debug logs on the dev BDS, played from a touch client with the camper parked facing 180, showed that `PlayerInteractWithBlockBeforeEvent.faceLocation.y` is 1 minus the real height of the press within the block. The x and z values are right:

| Press | Box top (real y) | Reported `faceLocation.y` |
|---|---|---|
| Up face of `yasu_ride:camper_furniture` at the stove (height 15) | 0.9375 | 0.0625 |
| Up face of `yasu_ride:camper_furniture` at the table (height 12) | 0.75 | 0.25 |
| Up face of `yasu_ride:camper_floor` | 1 | 0 |
| Up face of a transformed `saucepan_decor` | its untransformed box top | 1 minus that top |
| West face of the stove's furniture block, tapped just under its top edge | about 0.8 | 0.203 |

The raw lines:

```
press yasu_ride:camper_furniture {"yasu_ride:height":15} loc=(320,-59,-520) face={"z":0.1502685546875,"y":0.0625,"x":0.75244140625} dir=Up eye=(318.9638671875,-57.47998809814453,-520.3090209960938)
press yasu_ride:camper_furniture {"yasu_ride:height":15} loc=(320,-59,-520) face={"z":0.3963623046875,"y":0.20313644409179688,"x":0} dir=West eye=(318.9638671875,-57.47998809814453,-520.3090209960938)
press yasu_ride:camper_furniture {"yasu_ride:height":12} loc=(318,-59,-522) face={"z":0.49951171875,"y":0.25,"x":0.24188232421875} dir=Up
press yasu_ride:camper_floor loc=(320,-60,-520) face={"z":0.134033203125,"y":0,"x":0.30279541015625} dir=Up
```

With the reported y, an Up-face press on the stove top is taken as a point 0.875 blocks below the top. 0110 then crosses the line of sight from the eye through that point with the burner plane, far from where the player pressed, and the burner nearest the player wins every time. For the first press above, the reported point picks `stove`; the press was over `stove_wall`.

The measurement was made on a touch client only. The PC (mouse) client has not been measured.

## Decision

- The handler corrects the y of the pressed point before it builds the point passed to `PlaceDecor`. The correction is one pure function, `pressedHeight` in `src/infrastructure/vehicle/bedrock/faceHeight.ts`, with the block shapes it relies on (`pressedShape`) next to it, so it can be removed in one place if the engine changes
- On the Up face of a room block whose selection box is known, y is the box top, whatever was reported. On the Down face, y is the box bottom. The known boxes are the furniture block's (its height state over 16, or 6/16 to 1 for height 0, the box under the ceiling hook), the floor, the door, the shower-toilet, the bed, and the ceiling. A test checks them against the block files. The wall has no selection box and the deck floor has none either, so neither is ever pressed
- On a side face, and on any face of a block whose box is not known, y is 1 minus the reported y, as measured
- On the Up face of a decor block, y is the block's slot height over 16 (its transformation's lift) plus 1 minus the reported y: the report measures the untransformed box. Side faces of a decor block use 1 minus the reported y. A press on decor always goes to another free slot, so its height matters less
- x and z are used as reported

## Consequences

- An Up-face press on the stove picks the burner under the pressed x and z. The ray from the eye crosses the burner plane at the pressed point itself, so the eye no longer moves the choice. `tests/infrastructure/vehicle/bedrock/faceHeight.test.ts` replays the logged presses and checks this for any press on the stove top
- If the PC client turns out to report the real y, the Up and Down rules still give the right height, since they ignore the report. Only side faces and decor tops would then be off, by the same inversion as before. Manual test C111 checks side-face presses on PC so this shows up
- Only scripts change. A `/reload` is enough
- The stove still holds one item at a time on four burners (0107). If burner choice stays unreliable, one burner in the middle of the stove is an accepted fallback
