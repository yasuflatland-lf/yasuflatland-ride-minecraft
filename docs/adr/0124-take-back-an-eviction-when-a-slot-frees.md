# 0124. Take back an eviction when a slot frees

- Status: Extended by [0125](0125-forget-a-vehicle-removed-from-a-loaded-chunk.md)
- Date: 2026-10-23
- Extends: 0066 (the fleet limit per owner and kind)

## Context

A vehicle evicted while its chunk is unloaded waits in the evicted list and is removed when its chunk loads (0038, 0066). Until then nothing takes the eviction back. When the owner breaks another vehicle of the same group by hand, the group drops below its limit, yet the evicted vehicle is still removed when the owner drives back to it. A model check of the fleet found this without any `/kill`: place eleven SUVs, drive away from the first, break one of the others by hand, and the first is removed on return although the owner holds only nine.

## Decision

- When a vehicle that holds a slot leaves the fleet (a break by hand, 0008), the latest vehicle evicted from the same group, if any, leaves the evicted list and goes back into the order as the oldest of its group. Every vehicle in the group arrived after it, so that is its place
- Only a slot freed in the same group takes an eviction back. The group is the owner and kind, or the one unowned group (0066)
- The evicted list stores the kind and owner of each vehicle, so the fleet can tell its group. The stored fleet becomes version 3. A version 2 or older save keeps its evictions by id only, and those are never taken back
- Removing an evicted vehicle when it loads frees no slot, so it takes nothing back

## Consequences

- A player who breaks one of their vehicles keeps the one they would otherwise lose on return, as long as it was the latest eviction of that group
- A vehicle taken back may already be gone, for example after `/kill`. It then holds a slot as any vanished vehicle does (0038) until a newer one pushes it out again
- A build before this one cannot read a version 3 fleet; it logs the error and starts over with an empty fleet (0038)
- Covered by unit tests of the fleet and its JSON; the in-game tests cannot set an owner (0066)
