# 0075. Name the shared medium step after the medium

- Status: Accepted
- Date: 2026-10-20
- Supersedes in part: 0039 (keeping the name `stepFlightMotion`)

## Context

0039 renamed the flight vocabulary to forms but kept the name `stepFlightMotion` for the step that moves a vehicle horizontally while gravity is off (0021). That step has since grown past flight. The shared `TransformingDrive` calls it in every form except `car`, that is `takeoff`, `hover`, `landing` and `submarine` of both the SUV and the camper, and the sports boat calls it whenever it is afloat (0051), with gravity on and a buoyant hull. What these cases share is the medium, not flight: the engine applies a drag that the script pre-divides out of the impulse, with no ground friction to estimate. The boat also reads the field `MotionState.airExpected` ("velocity flight aimed for") as its water drag sample (0053), so the old names mislead whoever reads the drag estimator.

`MotionLimits` sat in the core's `profile.ts`, though only the motion building blocks and the kinds read it (0055, point 5).

## Decision

- Rename `stepFlightMotion` to `stepMediumMotion`, and the motion state field `airExpected` to `mediumExpected`. Name the step for any medium whose engine drag the script pre-divides: air or water with gravity off, or a buoyant hull
- Rename the test file `tests/domain/vehicle/motion/flightMotion.test.ts` to `mediumMotion.test.ts`
- Move `MotionLimits` from `src/domain/vehicle/profile.ts` to `src/domain/vehicle/motion/limits.ts`, with no re-export from the core
- Rename the sports boat's `BoatDrive` and `BoatDriveState` to `SportsboatDrive` and `SportsboatDriveState`, matching `SuvDrive` and `CamperDrive`
- Behavior, every tuning value, the in-game test names (`flight_*`, `boat_*`), and every other name 0039 kept stay unchanged

## Consequences

- The names say which vehicles share the step, so a new medium (a rail car in a tunnel, a lava boat) has an obvious place to plug in, and the boat's drag sample is no longer called "air"
- 0053 and 0055 still use the old names in their text. Their decisions do not change, only the identifiers, so their status stays as it is and each gets a name note at its end. The same holds for 0050
- The spike record `docs/spike-sportsboat.md` keeps the old names on purpose, because it records what the code was called when the spike ran
- `MotionLimits` still carries `handbrakeGrip`, which only the ground step reads, and the sports boat still declares a `handbrakeGrip` that nothing reads. `creepSpeed` is not tyre-only: the boat reads it through the shared speed update when the stick creeps (0018). Splitting `handbrakeGrip` out is left to a later decision
- Revisit the name if a medium appears whose drag the script cannot pre-divide
