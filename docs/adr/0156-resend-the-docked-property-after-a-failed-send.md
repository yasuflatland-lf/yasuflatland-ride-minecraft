# 0156. Resend the docked property after a failed send

- Status: Proposed
- Date: 2026-10-26
- Extends: [0127](0127-resend-every-synced-entity-value-after-a-failed-send.md) (resend after a failed send)

## Context

The sports boat and the camper send the `docked` property only on the tick they dock or depart, inside the dock and undock commands ([0063](0063-walk-on-a-stopped-sports-boat.md), [0068](0068-park-the-camper-with-room-blocks.md)). It is not a `SyncedValue`, so `resync()` (0127) never resent it. When the run carrying the dock commands failed, a held boat or parked camper kept `docked: false` on the entity for as long as it stayed held, and after a failed departure the entity kept `docked: true` while the vehicle drove. A rebuild after `/reload` reads that stale value back and restores the wrong state. The entity mirror property in `driveVehicles.test.ts` found the boat case with fast-check seed 1464152721.

## Decision

- After `resync()`, the next step of a sports boat or camper drive appends the `docked` property with its current held state, once.
- A step that docks or departs already sends the property in its dock or undock commands, so it sends nothing extra.
- A drive that has never held sends nothing, so the entity keeps its default value and no new property is written.
- Each kind keeps its own flag in its drive (0050); the shared `dockedCommand` in `motion/dockEntity.ts` builds the command.
- The dock and undock events stay one-shot, as 0127 decided. Only the property is resent.

## Consequences

A held or driving vehicle whose dock or departure send failed brings its `docked` property up to date on the next successful tick, so a later rebuild restores the right state. The extra write is idempotent.

A lost dock or undock event is still not retried, so the entity can keep the other state's component group (collision and gravity) until the next transition. The hold teleports a held vehicle every tick, which hides most of this. Revisit if a lost event shows up in play.
