# 0125. Forget a vehicle removed from a loaded chunk

- Status: Proposed
- Date: 2026-10-23
- Extends: 0066 (the per-owner and per-kind fleet limits), 0124 once PR #470 is merged (the take-back of an eviction)

## Context

0038 records that a vehicle lost through `/kill`, rather than broken by hand, stays in the fleet and takes a slot until newer vehicles push it out. It then occupies the evicted list for a chunk that never loads. 0066 keeps this limitation while making limits apply per owner and kind, with a shared group of 10 unowned vehicles.

The stable `@minecraft/server` 2.0.0 typings describe `WorldAfterEvents.entityRemove` as firing when an entity is removed, "potentially unloaded, or removed after being killed". `WorldBeforeEvents.entityRemove` likewise covers entities "unloaded or removed after being killed", and `EntityRemoveAfterEventSignal` includes unloading and removal a few seconds after death. The after event provides only `removedEntityId` and `typeId`. There is no `Dimension.isChunkLoaded` in stable 2.0.0. The `Dimension.getBlock` typings say it returns `undefined` for a block in an unloaded chunk, but the call can also throw `LocationInUnloadedChunkError`.

Forgetting on every remove event would forget parked vehicles whenever their chunks unload. On load, `LimitVehicles.found` would admit them as the oldest of their group, resetting their age. With the eviction take-back proposed in 0124 (PR #470), each false forget would also restore the group's latest evicted vehicle, allowing the group to exceed its limit while the parked vehicle is away.

The `fleet_remove_spike` in-game scenario (0010) measures three cases: targeted `/kill` in the ticking arena, script `entity.remove()` in that arena, and removing a distant ticking area containing a summoned SUV. It records before/after remove events and death events in arrival order with entity ids and ticks. The before event captures the dimension and location; `system.run` probes the block and `world.getEntity(id)` one tick later. A missing entity is expected in both kill and unload cases and is recorded only for comparison. A death event might distinguish them, but the vehicle's damage sensor suppresses all damage, so `/kill` producing a death event must also be measured. Script removal shows the signal for paths that already call `retireVehicle`.

Results: pending the `fleet_remove_spike` run. The runner uses an initial estimate of 300 ticks, to be replaced with the measured duration (0054). This change adds measurements only and changes no production behavior. The unloaded probe car remains in the dev world without a test tag; the fleet may evict it on a later load like any other unowned vehicle.

## Decision

Proposed, subject to the spike confirming that the next-tick block probe separates kill from unload:

- When `world.beforeEvents.entityRemove` fires for a vehicle type, capture its id, dimension, and location while the entity is still readable. Before events are read-only; defer the probe and fleet write through `system.run`
- One tick later, read the block at the captured location. A defined block means the chunk remains loaded and the vehicle is gone: forget its id from the fleet, including the take-back of the latest eviction from its group under 0124 once merged
- An undefined block or a thrown block lookup is treated as unloaded: keep the vehicle in the fleet with its existing age
- Forgetting an unknown id changes nothing. Break-by-hand and eviction paths already forget the vehicle through `retireVehicle`, so a subsequent remove event has no further effect
- If the block probe fails to separate the cases but `entityDie` separates them, revise this Proposed Decision to use death events and record the measurements before implementing it. If neither separates them, keep this ADR Proposed and retain the known limitation of 0038

## Consequences

- Once confirmed and implemented in a follow-up, a killed vehicle frees its slot on the next tick instead of causing a later placement to evict a live vehicle too early
- Unloading a parked vehicle preserves its fleet age and does not take back an eviction
- A vehicle removed in the same tick its chunk unloads is still kept. This rare case ages out as it does today
- The evicted-list cap of 64 stays for vehicles lost in unloaded chunks
- A chunk reloaded before the probe could be mistaken for a removal. The spike must establish whether this signal is adequate; it is not yet an accepted production rule
- Revisit when a stable API can distinguish an unload from a removal directly
