# 0220. Separate room capability from Drive

- Status: Accepted
- Date: 2026-11-04
- Related: [0055](0055-kind-neutral-vehicle-core.md): supplement the kind-neutral drive contract

## Context

The core `Drive` interface has nine optional methods for room doors, beds, shower-toilets, decor and storage. Only the camper implements them. `Vehicle` delegates each method and supplies defaults for kinds without a room, making every drive and aggregate expose camper operations.

## Decision

- Define `CapabilityKey<T>` in the vehicle core. Each key is frozen and compared by identity. The name describes the capability, and the type parameter identifies its value type.
- Add the optional `Drive.capability(key)` hook. `Vehicle.capability(key)` forwards the request and returns undefined when the drive has no match. A kind uses `offer` to return a capability value for its key.
- Declare `CAMPER_ROOM` in the camper kind with decor, storage and fixture interfaces. The camper drive creates one frozen room object per drive. Application and infrastructure callers obtain the key and types through `kinds/index.ts`.
- Pass a `StoragePressRequest` object to `pressStorage` with the press cell, tick and optional targeting and interaction fields.
- Preserve unsupported-vehicle results. Room operations return false or undefined and have no effects. Pickup uses an empty decor list, and gear placement on a known vehicle without a room shows the no-slot message.
- Keep seat-taken, ceiling-light and tool-state hooks on `Drive`. Preserve game behavior, saved data and event order.

## Consequences

The core forwards capability requests without importing any kinds. Each capability's key gives callers the types for the operations they can use. Adding a capability requires a key and an offer from each drive that supports it. A change to a room operation is local to its host contract, implementation and callers.
