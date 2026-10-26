# 0127. Resend every synced entity value after a failed send

- Status: Accepted; extended by [0136](0136-bulldozer.md) (Proposed) and [0156](0156-resend-the-docked-property-after-a-failed-send.md) (Proposed)
- Date: 2026-10-23
- Extends: [0055](0055-kind-neutral-vehicle-core.md) (step command delivery)

## Context

Drives latch entity values while building commands, before the application sends them. The bank ([0026](0026-bank-into-turns-in-flight.md)), gear ([0033](0033-lower-the-wheels-before-touchdown.md)), and sports boat trim and roll ([0059](0059-sports-boat-wake-trim-and-roll.md)) therefore stop sending unchanged values even when delivery failed. Camper doors, shower and ceiling lights use the same latch. Form changes also send gravity events, with gravity first ([0021](0021-flight-mode.md)).

Sending step commands first ([0055](0055-kind-neutral-vehicle-core.md)) prevents later world failures from skipping them, but cannot prevent a failure within that run. A run can stop after any command, and `Vehicle.tick` can throw after the drive built its commands. The domain then advances while the entity retains old values, potentially leaving a landed vehicle without gravity indefinitely.

## Decision

- Keep `SyncedValue` as the single latch. `resync()` marks it unsent, so its next `next(value)` sends the current value regardless of the previous value. An optional `{ value }` constructor argument primes a known entity value, including `undefined`.
- Prime only the transforming drive's form with its restored form. A rebuild still sends bank, gear, trim, roll, room and storage values on its first tick, and sends form only if it changes.
- Require `Drive.resync()` and delegate to it from `Vehicle.resync()`. Reset every synced value, including each storage door and the camper's inherited transforming values.
- Wrap `Vehicle.tick` and the first world `run` together. If either throws, the application calls `Vehicle.resync()` and rethrows the same error for the existing per-vehicle isolation and logging. Later world calls stay outside this catch.
- The next tick sends all current synced values again, preserving command order: gravity before form, then bank and gear. Resend even values delivered before a partial failure: setting a property to the same value and repeating gravity events are idempotent.
- Do not latch or retry one-shot commands: dock and undock events, door sounds and animations, switch clicks, and final commands retain their existing behavior. No world port or infrastructure change is needed.

## Consequences

A successful tick after a failed send brings the entity's synced values up to date even if they no longer change. Repeated failures cause repeated attempts. Successful delivery followed by a later world failure does not resend values.

A partial failure can cause redundant property writes and gravity events on the next tick. This is accepted because delivery acknowledgements per command would complicate the domain and world port. One-shot events can still be lost, and resync does not roll back motion or seating state. Revisit if a synced command becomes non-idempotent or one-shot delivery needs retry guarantees.

Properties cover arbitrary resync points, unchanged command behavior, restored forms, each kind's values, and reference-versus-failing entity mirrors. A landing example checks gravity recovery and the single warning. These checks follow the property-based testing strategy (0010).
