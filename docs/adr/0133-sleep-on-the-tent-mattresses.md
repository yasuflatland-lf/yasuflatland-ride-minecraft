# 0133. Sleep on the tent mattresses

- Status: Proposed (to be Accepted once the mattress checks under Tent in [manual-test.md](../manual-test.md) pass)
- Date: 2026-10-23
- Extends: [0092](0092-a-bed-in-the-parked-camper.md) (the 9 px bed block and the shared sleep rule), [0131](0131-pitch-a-tent-in-the-camp.md) (the tent's laid cells, its hit rule, and the hitbox that keeps taps inside off the entity)

## Context

The tent model (0130) draws two mattresses in the bedroom, 9 px high, but 0131 laid
nothing in their cells. A tap on a mattress went through to the ground and did nothing.

0092 found that a custom block 9 px high with an `onPlayerInteract` custom component is
the only stable way to sleep: it can set the spawn point, fade the camera, and skip the
night, on a phone too. The camper bed already does this through the shared `SleepInBed`
use case. A custom component id can be registered only once at startup, so the tent
cannot reuse the camper bed's component, and the camp feature cannot import the vehicle
feature's handler (0046).

## Decision

- A new block `yasu_ride:tent_mattress` carries its own custom component
  `yasu_ride:tent_mattress`. Its file is the camper bed's block file with only the
  identifier and the component changed: hidden cube geometry, `light_dampening` 0, not
  destructible by mining or explosion, and collision and selection boxes of
  `origin [-8, 0, -8]`, `size [16, 9, 16]`. The model draws the mattress; the block draws
  nothing. A pack test ties the block's 9 px to the model's mattress bones.
- The mattress cells are `TENT_MATTRESSES`: index 0 at local x 1 and index 1 at x -1,
  both at depth 9..10 and layer 0, so each mattress fills the bedroom's depth and x 0
  stays free as the walkway from the bedroom flap. They are now tent cells:
  `tentCells` lays them last, after the walls, flaps (0132), and ceilings, as
  `{ type: "mattress", index }`, through the tent's `CellLayer`. They do not depend on
  the tent state: the same four cells are laid whichever flaps are open. The saved cells gain this member and no new property key; a tent saved
  before gets its mattresses on the next lay, and a block a player put in a mattress
  cell stays and is not recorded.
- The tent reuses the shared `SleepInBed` unchanged: the same overworld rule, the same
  night window (12542 to 23459), and the same "You can sleep only at night" message.
  Camp builds its own stateless instance with `BedrockBedWorld` and the shared
  `playerById` lookup.
- A player standing or asleep on a mattress has feet inside the tent (`insideTent`), so
  0131's hit rule refuses the take-down while someone is on it.
- The bed handler moves to `infrastructure/shared/bedBlock.ts` as
  `registerBedBlock(componentId, bed)`. It takes the component id because each id
  registers once, so every feature registers its own bed component with it.

## Consequences

- Taking the tent down clears a mattress cell only while it still holds the mattress
  block. A block placed on top of a mattress stays floating, as on the camper bed.
- The low chair still refuses every `yasu_ride:` block, so it cannot stand on a mattress.
- The in-game tests have no player, so the sleep itself is covered by `SleepInBed`'s unit
  tests and by the manual rows. Revisit if a stable API gains a way to sleep a player
  in a vanilla bed set by a script.
