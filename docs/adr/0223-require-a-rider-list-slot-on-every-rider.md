# 0223. Require a rider-list slot on every rider

- Status: Accepted
- Date: 2026-11-04
- Supersedes: [0126](0126-choose-a-new-driver-with-one-tick-of-motion.md)
- Supersedes in part: [0025](0025-jump-on-touch-and-a-sticky-driver.md): remaining sticky driver selection
- Supersedes in part: [0128](0128-settle-every-crews-seats-by-rider-list.md): optional slots, position-only driver selection, and the motion argument

## Context

Every production rider snapshot already has a slot. The sole assembly path,
`BedrockLoadedVehicles.riders`, takes each rider's index in the engine list
before filtering players. Players waiting to reboard retain their pending slot
from `waitingRiders`. Slot-less snapshots survive only in tests and an older
selection path.

That path can keep a slot-less current driver while another rider occupies
settled seat 0. Its sticky driver and the one-tick velocity correction of 0126
are unused in production. Keeping them makes the domain contract less precise
and allows tests to exercise states that production never supplies.

## Decision

- Require `slot: number` on `RiderView` and `RiderPos`. It represents the rider's
  index in the engine rider list, including fillers before player filtering;
  waiting players retain the slot at which they are to reboard.
- Move `RiderPos` from `seats.ts` to `seating.ts`, the domain owner that uses
  rider positions to settle seats.
- Read the seat from the slot when it is below the layout's seat count. Keep the
  nearest-seat fallback for an out-of-range slot and the deterministic unique
  settlement of 0128.
- Select only the rider whose settled seat is `DRIVER_SEAT`. Retire position-only
  driver selection, the sticky driver, and the one-tick velocity correction.
- Remove the motion argument from `Seating.update` and `Crew.update`.
  Restore uses the same settlement and driver selection as an ordinary update.
- Keep profiles, chosen-seat layouts, drive tuning, handover timing, and
  production rider assembly unchanged.

## Consequences

Production behavior does not change. Unit tests use riders with required slots;
tests solely for position-only selection and 0126's correction are removed.
Indexed seating, lag stability, collision settlement, and out-of-range fallback
remain covered.

If `holdSeat` fails, actual list indices can drift from the intended layout and
a waiting player's slot can collide with a real rider's slot; deterministic
settlement still resolves that collision. This existing risk is unchanged.

An out-of-range slot remains supported, but does not justify an optional slot.
Revisit the contract if the engine stops assigning seats by rider-list index or
provides a stable seat identifier.
