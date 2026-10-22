# 0125. Forget a vehicle removed from a loaded chunk

- Status: Proposed
- Date: 2026-10-23
- Extends: 0066 (the per-owner and per-kind fleet limits), 0124 once PR #470 is merged (the take-back of an eviction)

## Context

0038 records that a vehicle lost through `/kill`, rather than broken by hand, stays in the fleet and takes a slot until newer vehicles push it out. It then occupies the evicted list for a chunk that never loads. 0066 keeps this limitation while making limits apply per owner and kind, with a shared group of 10 unowned vehicles.

The stable `@minecraft/server` 2.0.0 typings describe `WorldAfterEvents.entityRemove` as firing when an entity is removed, "potentially unloaded, or removed after being killed". `WorldBeforeEvents.entityRemove` likewise covers entities "unloaded or removed after being killed", and `EntityRemoveAfterEventSignal` includes unloading and removal a few seconds after death. The after event provides only `removedEntityId` and `typeId`. There is no `Dimension.isChunkLoaded` in stable 2.0.0. The `Dimension.getBlock` typings say it returns `undefined` for a block in an unloaded chunk, but the call can also throw `LocationInUnloadedChunkError`.

Forgetting on every remove event would forget parked vehicles whenever their chunks unload. On load, `LimitVehicles.found` would admit them as the oldest of their group, resetting their age. With the eviction take-back proposed in 0124 (PR #470), each false forget would also restore the group's latest evicted vehicle, allowing the group to exceed its limit while the parked vehicle is away.

The `fleet_remove_spike` in-game scenario (0010) measures three cases: targeted `/kill` in the ticking arena, script `entity.remove()` in that arena, and removing a distant ticking area containing a summoned SUV. It records before/after remove events and death events in arrival order with entity ids and ticks. The before event captures the dimension and location, then probes the block and `world.getEntity(id)` twice: a deferred read through `system.run`, and a next-tick read through `system.runTimeout(..., 1)`. A missing entity is expected in both kill and unload cases and is recorded only for comparison. Script removal shows the signal for paths that already call `retireVehicle`.

Results of the first run (CI in-game shard 1/4, 75 ticks), which had only the deferred read:

| Case | Death event | Before remove | Deferred read | Block at deferred read |
| --- | --- | --- | --- | --- |
| `/kill` | tick 810 | tick 831 | tick 831 | loaded |
| `entity.remove()` | none | tick 850 | tick 851 | loaded |
| ticking area removed | none | tick 879 | tick 879 | unloaded |

- `system.run` from a before event that the engine raises (kill and unload) runs later in the same tick, not one tick later. Only a remove started from script defers to the next tick. The deferred read is therefore a same-tick read for the cases that matter
- The deferred block read separates `/kill` (loaded) from unload (unloaded)
- `/kill` raises `entityDie` despite the damage sensor, 21 ticks before the remove events. Unload and script removal raise none. The death event also separates the cases
- The next-tick read was added after this run and has no measurement yet. The scenario's pass condition uses only the deferred read

The runner entry uses the measured 75 ticks (0054). This change adds measurements only and changes no production behavior. The unloaded probe car remains in the dev world without a test tag; the fleet may evict it on a later load like any other unowned vehicle.

## Decision

Proposed, until a follow-up picks a signal and implements it:

- When `world.beforeEvents.entityRemove` fires for a vehicle type, capture its id, dimension, and location while the entity is still readable. Before events are read-only; defer the probe and fleet write through `system.run`, which for an engine-raised removal still runs within the removal's tick
- In that deferred read, read the block at the captured location. A defined block means the chunk remains loaded and the vehicle is gone: forget its id from the fleet, including the take-back of the latest eviction from its group under 0124 once merged
- An undefined block or a thrown block lookup is treated as unloaded: keep the vehicle in the fleet with its existing age
- Forgetting an unknown id changes nothing. Break-by-hand and eviction paths already forget the vehicle through `retireVehicle`, so a subsequent remove event has no further effect
- `entityDie` for a vehicle also separates `/kill` from unload, and arrives before the remove events. The follow-up may forget on the death event instead, or use it to confirm the block read, and records which one it chose here before implementing it. Rely on the next-tick read only after the spike has measured it

## Consequences

- Once implemented in a follow-up, a killed vehicle frees its slot in the tick it is removed instead of causing a later placement to evict a live vehicle too early
- Unloading a parked vehicle preserves its fleet age and does not take back an eviction
- A vehicle removed in the same tick its chunk unloads is still kept. This rare case ages out as it does today
- The evicted-list cap of 64 stays for vehicles lost in unloaded chunks
- The deferred read runs in the removal's tick for kill and unload, so there is no window for a chunk to reload before it. A remove started from script defers to the next tick, but those paths already forget the vehicle through `retireVehicle`
- Revisit when a stable API can distinguish an unload from a removal directly
