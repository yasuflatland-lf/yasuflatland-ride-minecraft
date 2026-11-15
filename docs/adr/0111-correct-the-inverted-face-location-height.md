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

- Existing decor placement corrects the y of the pressed point before building the point passed to `PlaceDecor`. Its height correction is the pure function, `pressedHeight` in `src/infrastructure/vehicle/kinds/camper/faceHeight.ts`, with the block shapes it relies on (`pressedShape`) next to it, so it can be removed in one place if the engine changes
- On the Up face of a room block whose selection box is known, y is the box top, whatever was reported. On the Down face, y is the box bottom. The known boxes are the furniture block's (its height state over 16, or 6/16 to 1 for height 0, the box under the ceiling hook), the floor, the door, the shower-toilet, the bed, and the ceiling. A test checks them against the block files. The wall has no selection box and the deck floor has none either, so neither is ever pressed
- In existing decor placement, on a side face or any face of a block whose box is not known, y is 1 minus the reported y, as measured
- On the Up face of a decor block, y is the block's slot height over 16 (its transformation's lift) plus 1 minus the reported y: the report measures the untransformed box. Side faces of a decor block use 1 minus the reported y. A press on decor always goes to another free slot, so its height matters less
- Drawer routing corrects the entire face location once with the engine-free `touchCorrectedFaceLocation` in `src/infrastructure/vehicle/kinds/camper/touchFaceLocation.ts` (0121). For input mode `"Touch"` (`InputMode.Touch`), it returns `(1-x,1-y,z)`; all other modes, including undefined, use identity pending PC measurement. The corrected x/z build the world point for rays and floor footprints. Corrected y selects drawer side-face height, including floor side faces routed toward drawers. Up/Down faces of the drawers and floor have known room boxes, so `pressedHeight` ignores the supplied y and uses box bounds without another inversion
- Other decor placement and removal handlers retain their existing coordinate rules in this change. Hit-point slot picking on touch needs a follow-up check for mirrored x

## Consequences

- An Up-face press on the stove puts the ray endpoint on the burner plane at the reported x/z, so the eye no longer moves the choice. `tests/infrastructure/vehicle/kinds/camper/faceHeight.test.ts` replays the logged heights and checks this for any press on the stove top. Touch x remains uncorrected in this existing decor path and needs the follow-up slot-picking check
- If the PC client turns out to report the real y, the Up and Down rules still give the right height, since they ignore the report. Only side faces and decor tops would then be off, by the same inversion as before. Manual test C111 checks side-face presses on PC so this shows up
- `tests/infrastructure/vehicle/kinds/camper/touchFaceLocation.test.ts` checks the touch mapping, identity for other modes, involution and the wool reports. `drawerRouting.test.ts` replays the recorded floor and East-face reports through the handler and real drive
- Only scripts change. A `/reload` is enough
- The stove still holds one item at a time on four burners (0107). If burner choice stays unreliable, one burner in the middle of the stove is an accepted fallback
