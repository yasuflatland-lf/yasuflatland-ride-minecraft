# 0220. Separate room capability from Drive

- Status: Accepted
- Date: 2026-11-04
- Related: [0055](0055-kind-neutral-vehicle-core.md): supplement the kind-neutral drive contract

## Context

The core `Drive` interface has nine optional methods for room doors, beds, shower-toilets, decor and storage. Only the camper implements them. `Vehicle` delegates each method and supplies defaults for kinds without a room, making every drive and aggregate expose camper operations.

## Decision

- Keep kind-specific capabilities in separate interfaces, detected through type guards, rather than adding optional methods to `Drive`.
- Define `RoomDrive` in `src/domain/vehicle/dock/roomDrive.ts` with required `useDockDoor`, `bedSpawnCell`, `pressShowerToilet`, `decor`, `setDecor`, `decorSlotFor`, `placeDecor`, `removeDecor` and `pressStorage` methods. Keep `DecorPlacement` and `StoragePress` alongside it in `dock/decor.ts`.
- The camper drive implements `RoomDrive`. The core's `isRoomDrive` checks that all nine methods are functions without importing kinds. `Vehicle.asRoom()` returns that drive as `RoomDrive`, or undefined.
- Remove the nine delegates from `Vehicle`. Callers obtain the capability through `asRoom()` and preserve unsupported-vehicle results: false, undefined or no action, and an empty decor list where needed. Gear placement still shows the no-slot message for a known vehicle without a room.
- Leave the optional seat-taken, ceiling-light and tool-state methods on `Drive` unchanged in this split. Game behavior and saved data remain unchanged.

## Consequences

Room callers narrow once to an interface whose methods are all available. Non-room drives carry no room methods, and the core depends only on capability contracts. Adding a room method requires updating the interface, guard and implementations together. Revisit the capability boundary if a future kind supports only part of the room operations.
