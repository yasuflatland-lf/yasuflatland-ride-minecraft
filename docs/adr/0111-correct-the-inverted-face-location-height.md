# 0111. Correct the inverted face location height

- Status: Accepted
- Date: 2026-10-22
- Extends: [0110](0110-pick-decor-slots-along-the-line-of-sight.md): picking decor slots along the line of sight

## Context

After 0110, a saucepan still landed on the same stove burner whichever burner the player pressed (#434). Debug logs on the dev BDS, played from a touch client with the camper parked facing 180, showed that `PlayerInteractWithBlockBeforeEvent.faceLocation.y` is 1 minus the real height of the press within the block. The original experiment did not establish the x mapping; later controlled touch measurements below show that x is mirrored too. z is preserved:

| Press                                                                    | Box top (real y)          | Reported `faceLocation.y` |
| ------------------------------------------------------------------------ | ------------------------- | ------------------------- |
| Up face of `yasu_ride:camper_furniture` at the stove (height 15)         | 0.9375                    | 0.0625                    |
| Up face of `yasu_ride:camper_furniture` at the table (height 12)         | 0.75                      | 0.25                      |
| Up face of `yasu_ride:camper_floor`                                      | 1                         | 0                         |
| Up face of a transformed `saucepan_decor`                                | its untransformed box top | 1 minus that top          |
| West face of the stove's furniture block, tapped just under its top edge | about 0.8                 | 0.203                     |

The raw lines:

```
press yasu_ride:camper_furniture {"yasu_ride:height":15} loc=(320,-59,-520) face={"z":0.1502685546875,"y":0.0625,"x":0.75244140625} dir=Up eye=(318.9638671875,-57.47998809814453,-520.3090209960938)
press yasu_ride:camper_furniture {"yasu_ride:height":15} loc=(320,-59,-520) face={"z":0.3963623046875,"y":0.20313644409179688,"x":0} dir=West eye=(318.9638671875,-57.47998809814453,-520.3090209960938)
press yasu_ride:camper_furniture {"yasu_ride:height":12} loc=(318,-59,-522) face={"z":0.49951171875,"y":0.25,"x":0.24188232421875} dir=Up
press yasu_ride:camper_floor loc=(320,-60,-520) face={"z":0.134033203125,"y":0,"x":0.30279541015625} dir=Up
```

With the reported y, an Up-face press on the stove top is taken as a point 0.875 blocks below the top. 0110 then crosses the line of sight from the eye through that point with the burner plane, far from where the player pressed, and the burner nearest the player wins every time. For the first press above, the reported point picks `stove`; the press was over `stove_wall`.

The measurement was made on a touch client only. The PC (mouse) client has not been measured.

A controlled experiment on iPad touch, Minecraft 1.26.63, used yellow wool at (-6,-60,0), with the player at (-5.5,-60,-1.6) facing +z (left is world +x). Top-face reports (x,z) were t1 (0.083,0.207), t2 (0.974,0.921), t3 (0.089,0.447), t4 (0.954,0.392), and t5 (0.540,0.021). Left-edge intents t1/t3 report x near zero; right-edge intents t2/t4 report x near one. The near edge t5 reports z=0.021, so z is not mirrored. East-face presses report x=0 where the true x is 1, and Up-face presses report y=0 where the true y is 1. Together with side-face height measurements, this establishes touch `faceLocation = (1-x,1-y,z)` in block units and world axes.

## Decision

- Decor placement, drawer presses, decor removal and storage component presses use `pressedPoint` in `src/infrastructure/vehicle/kinds/camper/faceHeight.ts` before adding the block's world position. Touch mirrors x in world axes (`1 - x`). Other input modes keep the reported x. Every mode keeps the reported z.
- Every input mode uses the same height rule. `pressedShape` resolves the selection box or decor lift from the pressed block's type and height state. On a known room block, an Up press uses the box top and a Down press uses its bottom. On the Up face of a decor block, the height is its transformation's lift plus `1 - reportedY`, because the engine reports the untransformed box. On all remaining faces the height is `1 - reportedY`.
- PC mouse input uses this height rule pending in-game measurement. Issue #1704 tracks PC drawer verification, and manual test C111 compares side-face placement on PC and touch.

## Consequences

- The drawer ray, floor footprint and ordinary placement after a floor miss share one world point. The storage component selects a drawer from the corrected side height. Decor placement and take-back use corrected x when choosing between the ends of a pair.
- `tests/infrastructure/vehicle/kinds/camper/faceHeight.test.ts` checks the room bounds against the block files and replays the stove and wool measurements. `tests/infrastructure/vehicle/bedrock/subscriptions.test.ts` checks the points sent by the block and component handlers. `tests/application/vehicle/room/pressRoom.test.ts` replays the normalized floor and East-face points against the camper room.
- Only scripts change. A `/reload` is enough
- The stove still holds one item at a time on four burners (0107). If burner choice stays unreliable, one burner in the middle of the stove is an accepted fallback
