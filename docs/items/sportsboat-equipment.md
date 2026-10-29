# Sports Boat Equipment

Equipment for the sports boat. The Sports Boat Equipment group of the Items tab holds the Icebreaker Switch ([ADR 0171](../adr/0171-sports-boat-equipment-and-icebreaker-mode.md), [ADR 0174](../adr/0174-show-only-the-icebreaker-switch-in-the-equipment-group.md)). Back to the [item groups](README.md).

| Item | Recipe | What it does |
|---|---|---|
| Sports Boat Equipment Box (not in the creative menu) | None | Given once per player on their first sports boat placement, or dropped at their feet when the inventory is full ([ADR 0093](../adr/0093-decorate-the-parked-camper.md)). Use it to open it: it is used up and gives one Icebreaker Switch. It can still be obtained with `/give @s yasu_ride:sportsboat_equipment_box`. |
| Icebreaker Switch | Shapeless, a lever, an iron ingot, and packed ice | Switches the sports boat's icebreaker mode on and off. While driving, hold it to show its icon and OFF or ON on the dash monitor, and use it to toggle the mode. Passengers cannot toggle it. Holding the box or another item restores the usual display. The state survives reloads and server restarts; while afloat on water or lava, pushing forward with a blocked bow clears obstacles. |

With icebreaker mode ON, forward input and a blocked bow clear a box covering the boat, plus three blocks to each side, above and ahead of the bow. The bed under the hull stays. There is no extra clearance behind the stern. Water, flowing water, lava, flowing lava, item holders and the add-on's laid blocks stay in place. The mode does not cut while beached, reversing, creeping sideways, receiving neutral input, without a driver, or with a clear bow. If something it keeps still blocks the bow, it tries again once a second until the boat moves. The channel is only as long as the water reaches, so a dry channel head stops the boat; reversing brings it back. A new boat starts with the mode OFF.
