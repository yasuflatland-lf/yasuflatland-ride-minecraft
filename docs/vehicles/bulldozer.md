# Bulldozer

## Getting one

Every player receives one bulldozer item on joining, including players who already received their SUV. At a crafting table, combine an SUV item, an iron block, and an iron shovel, or use `/give @s yasu_ride:bulldozer_item`. Place it on top of a block with a clear 9 by 9 area, three blocks high. A placed bulldozer starts with its blade raised. One driver rides it. Each player can keep one bulldozer; placing another replaces that player's oldest bulldozer. Hit an empty vehicle three times with an empty hand to take its item back.

## Controls

Push forward or back to drive straight. A sideways stick past 0.35 (A/D on PC) pivots, braking by 0.02 blocks/tick every tick while turning. From rest it turns in place; from top speed it slides up to about 7 blocks over about 23 ticks before it stops, and the blade does not cut during that slide. This works on land, in flight, and under water; takeoff ignores the stick. There is no handbrake or creep.

Tap Jump to hop one block on the ground. Double-tap within 8 ticks to take off or land. In flight and under water, hold Jump to climb and pull the stick back to sink. Sneak gets out. The left door opens for two seconds when boarding or leaving.

Hold the Blade Up/Down switch while driving and use it (right-click on PC, long press on mobile) to raise or lower the blade. Only the driver can use it. It switches once per press, and again after 10 ticks at the earliest. The blade takes 10 ticks (half a second) to travel, and the lift rods visibly shorten when it is raised. Craft the switch from a lever and an iron ingot. Hold Wide Blade and use it to switch widths independently, raised or lowered; the monitor shows NORM or WIDE. Craft it from a lever and two iron ingots. Both switches are in [Building Tools](../items/building-tools.md).

## How it moves

Ground top speed is 9 blocks/s, half the SUV's, with half its acceleration. Flight and water also cap at 9 blocks/s. The bulldozer never banks, drives straight without steering, and climbs 1- and 2-block steps automatically with the blade raised, like the SUV, and does not step up with the blade lowered. Tracks move only in car form. A single rear propeller spins under water; blue glow comes from the thruster in flight.

## Clearing

The blade cuts only when fully lowered. Wide Blade doubles its width: at heading 0 from the center of a block it clears 11 columns instead of 5. Raised or lowered, the ram also widens to hit mobs beside the tracks ([ADR 0180](../adr/0180-a-wide-bulldozer-blade-switched-from-the-cab.md)).

While moving forward above 0.02 blocks/tick, the blade clears the columns it touches ahead. On the ground, cutting starts in the row above the block under the tracks, even a block lower than a full cube such as a dirt path, farmland, mud, or a bottom slab, and continues upward until the first air gap, leaving an overhang above a gap. In flight it cuts a tunnel up to the top of the 2.9-block body, including at fractional heights. The tick a hop starts still cuts, because the bulldozer is still on the ground; the airborne ticks after a hop, falling off a ledge, pivoting, reversing, standing, and diving do not cut.

Water, lava, containers with their contents, and the add-on's own blocks are kept. Bedrock, barriers, command blocks, structure blocks, reinforced deepslate, end portal frames, and light blocks are cut. The cut works in every game mode, Adventure included. Neighbor updates may drop unsupported blocks; nearby new item drops from the cut are removed as described in [ADR 0137](../adr/0137-clear-block-columns-with-the-blade.md).

## Build mode

While you drive and hold the Selection Wand or the Build Tool, the camera moves to the third-person view and the bulldozer selects, fills, replaces, copies, pastes, and undoes blocks. See [Building tools](../items/building-tools.md).

## Headlights

Use the headlight switch while driving. The headlights and rear beacon glow, and five road beams reach 6, 10, 15, 21, and 27 blocks ahead. The first two are dimmer (levels 8 and 12), keeping the cab dark; the others use level 15.

## Paint

Yellow is the default. Hit with any of the sixteen dyes to recolor the yellow panels; trim, glass, tracks, and lamps stay the same. Brown restores the default yellow. Brown or yellow on an already yellow bulldozer keeps the dye. Breaking the vehicle returns the plain item.
