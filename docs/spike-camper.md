# Camper spike: findings

The spike was throwaway code on `spike/camper`, built to find out whether a parked camper can be walked through, slept in, and used for storage, and how its model should look. Its code was not merged. This page records the findings from the dev BDS on 2026-10-13 to 2026-10-18, tested by the owner on a phone (touch). The decisions for the camper kind are in [0067](adr/0067-camper.md); parking and living inside are decided in later ADRs.

## Questions

1. Can players walk inside a stopped camper, and does the body stay put?
2. Can a player sleep in the camper and keep things in it?
3. Can players place any block inside the camper and on its roof, and get the same blocks back after driving?
4. Can taps inside the camper reach blocks instead of the camper entity?
5. What should the camper look like?

## What was tried

When the camper stopped, a script snapped it to a cell center at a multiple of 90 degrees, turned off its physics, held it with a teleport every tick, and laid invisible custom blocks around it: a full floor block in every cell of its 3 x 7 footprint, a ceiling plate, wall plates along the edges, a door block in the right wall, and a step outside the door. A vanilla chest at the rear right took the camper's stored items; two bed blocks at the rear left handled sleep. On departure the script recorded every block players had placed inside or on the roof, with its rotation relative to the camper, and cleared the cells.

## Findings

| Item | Result |
|---|---|
| Walking inside | Players walk on the floor blocks inside the parked camper |
| Holding the camper | Physics off, a small collision box, and a teleport every tick kept it in place |
| Sleeping | Tapping a custom bed block (9 px high, `onPlayerInteract`) set the spawn point, faded the camera, and skipped to morning at night (time 12542 to 23459). An entity with `minecraft:interact` never showed a sleep button. A script-set vanilla bed was invalid; `setblock` of the head with a direction placed both halves |
| Storage | A vanilla chest filled from the camper's 27 inventory slots on parking and emptied back on departure; it opens with a tap |
| Placing blocks | Blocks placed inside (two layers) and on the roof came back after departing and parking again, rotated with the camper for logs, stairs, furnaces, chests with their items, and roof blocks over 90 and -90 degree turns. The record is 300 to 520 characters of JSON in a dynamic property |
| Door | A custom door block with closed and open states toggled by a tap; the model's door bone follows an entity property tweened 0.1 per tick and swings outward on a hinge at its front edge. While open, the whole cell has to be selectable or a tap from inside misses it |
| Roof and ladder | With the roof 4.0 blocks up, roof blocks sit flush. A script lifts a player in the ladder column who jumps or pushes forward, by `applyKnockback` with 0.15 vertical strength, and pushes them onto the roof at the top; the owner found that speed right |
| Taps on touch | Inside a parked camper, short taps aimed at blocks landed on the camper entity. Shrinking `minecraft:custom_hit_test` and the collision box with a component group after spawn did not reach the client. Removing `minecraft:inventory` and `minecraft:rideable` was also needed. A separate stand-in entity whose hit box was tiny from spawn let every tap reach the blocks: door, bed, chest, placing, and breaking |
| Stale state | The laid cells lived only in script memory, so `/reload` or a restart left blocks or a stand-in behind. A world block already in a cell of the room stayed there and showed inside the camper |
| Model detail | About 3,400 cubes, many of them quarter- and half-pixel slices for slopes, ran without stutter near the camper on the owner's phone. Collision never uses them |

## Recommendations

- Build the camper as a kind of its own that drives, flies, and dives like the SUV, after moving the SUV's transforming drivetrain into shared code (0050, 0055).
- When it parks, replace the driving entity with a stand-in that has a tiny hit box from spawn, and keep the laid cells and the stand-in's id on the entities so they survive `/reload` and restarts.
- Decide what to do with world blocks already in the room's cells before parking.
- Keep the look the owner approved; the model description is in the camper design spec.
