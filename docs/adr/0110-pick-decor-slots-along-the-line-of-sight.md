# 0110. Pick decor slots along the line of sight

- Status: Accepted
- Date: 2026-10-22
- Supersedes in part: 0107 (measuring a slot's nearness from the hit point)

## Context

0107 puts a press on the stove on the burner whose point is nearest the hit point, and a press elsewhere on the free slot nearest it. On the dev server a saucepan landed on the same burner whichever burner the player pressed (#431). A debug log showed the reason:

```
press yasu_ride:camper_furniture face={"x":0,"y":0.207,"z":0.648} dir=West eye={"x":319.67,"y":-57.48,"z":-520.19} (block x 320, y -59)
slot stove_rear
```

The player stood in the aisle beside the stove and looked down at the near burner. The line of sight entered the stove cell's furniture block through its aisle-side face, 0.207 blocks above the cell bottom. The furniture block's selection box fills the cell from its bottom up to the furniture top (0097), so a ray aimed steeply down near the edge of the top, as a player standing next to the furniture does, reaches the box's side face first. The hit point is then on the side, low in the cell. Its distance to the burner points is decided by which side face it is on and by the height difference, not by the burner the player looked at. The same happens on the side faces of the shelves, the table, and the counter, and when a press under a model-only top reaches the floor block below.

Facts this decision builds on:

- `PlayerInteractWithBlockBeforeEvent` gives the pressed block and `faceLocation`, the hit point relative to the block's bottom north-west corner. `Player.getHeadLocation()` gives the eye, and both can be read in a before event
- A slot's point is its spot on its cell at the slot's height (`slotPoint`, 0107). For the ceiling hook, the height is the lift that puts the hanging item's top at the cell top (0102)
- The press on a dinette deck seat names one slot exactly (0104), and its point is the seat entity's location, not a point on the line of sight

## Decision

- A press on a room block carries the player's eye with the hit point. The infrastructure reads `getHeadLocation()` and passes a plain `Vec3` through `PlaceDecor` and the drive's `decorSlotFor` to `slotForPress`; the domain never sees the engine
- For each candidate slot, the ray from the eye through the hit point is intersected with the horizontal plane at the height of that slot's point. The slot whose point is nearest that crossing wins; on a tie, the slot listed first, as before. The pressed-cell rule and the nearest-free-slot rule of 0107 both measure this way
- When the ray does not descend to a slot's plane (the hit point is level with or above the eye, or the plane is level with or above the eye), that slot is measured from the hit point, as before
- The hanging slot uses its point's height for its plane, like every other slot. It is the only slot that takes a hanging item, so the plane only matters if more hanging slots are added
- The press on a dinette deck seat passes no eye and keeps measuring from its point. It names one cell, and every dinette cell has one slot, so the measure never changes the result there
- The eye is optional in the domain and the application. A caller without one, such as a test that presses a slot's point directly, gets the old measure

## Consequences

- A press that hits a furniture block's side face, or the floor under a model-only top, picks the slot over which the player's line of sight crosses the furniture top. For the logged press above, the saucepan now goes to `stove`, the aisle-side burner nearest the player, instead of `stove_rear`
- A ray aimed straight at a slot's point picks that slot wherever along the ray the press lands, which the property tests in `tests/domain/vehicle/kinds/camper/decorPlacing.test.ts` check
- Two slots stacked in one column, such as the high and low shelves, are told apart by the plane each one is measured on: a ray aimed at the low shelf crosses the high shelf's plane away from its point
- Only scripts change. A `/reload` is enough; neither pack's files change
- Check in game that a press on each burner from the aisle, standing close and standing back, puts the item on that burner, and that presses on the side faces of the shelves, the table, and the counter still pick the slot looked at
