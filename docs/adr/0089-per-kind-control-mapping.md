# 0089. Each kind maps the stick to handbrake and creep

- Status: Extended by 0136 (Proposed)
- Date: 2026-10-21
- Extends: 0018, 0051, 0055
- Supersedes in part: 0087 (the boat's handbrakeGrip)

## Context

0018 turns a stick held sideways into creep: the vehicle speeds up or slows down to 0.12 blocks/tick and turns at its full rate. The handbrake comes from 0002, and Jump pulls it; the mapping lives in `driveInput.ts` (0021). Both meanings were decided in the core: `toDriveInput` returned `{ throttle, steer, handbrake, creep }` for every kind. Kinds then took them back. The transforming drive cleared the handbrake out of car form (0021, 0040). The sports boat (0051) ignored the handbrake on both of its paths, and still had to declare `handbrakeGrip: 0.6`, equal to its grip, because `MotionLimits` required it. No code read that value. 0055 moved the motion limits out of the shared profile into each drive, but the tyre values stayed in `MotionLimits`, and 0087 kept the boat's unused handbrake grip in its spec table.

The sports boat also creeps: afloat, a sideways stick drives it at 0.12 blocks/tick and it keeps turning at 6 degrees/tick. 0051 does not mention this. It works today because the boat's medium step reads the creep flag, not because anyone decided it.

## Decision

- The core gives a kind-neutral control input: `ControlInput { throttle, steer, jump, sideways }` from `toDriveInput` in `src/domain/vehicle/driveInput.ts`. `throttle` and `steer` follow 0005 and 0018. `jump` is Jump held. A missing input, or a stick value that is not a finite number, gives the neutral control, with `jump` false. `sideways` is true when 0018's sideways rule applies (left/right past 0.1 and the stick within 20 degrees of horizontal), and the throttle is then 0
- Each kind maps `jump` and `sideways` itself:
  - The transforming drive (SUV, camper): `jump` is the handbrake in car form only, and `sideways` is creep in every form. Out of car form the throttle is clamped to 0 or more (0032, 0040). During takeoff the controls are ignored (0021)
  - The sports boat: afloat, `sideways` is creep and `jump` does nothing. Beached, it drives by `beachedInput` (0080): reverse and steering only, no creep, no handbrake
- `MotionLimits` in `motion/limits.ts` keeps the values every movement step reads: speeds, acceleration, braking, drag, turn rate, `steerFullSpeed` and `grip`. The tyre values move to `TyreLimits { handbrakeGrip, creepSpeed }`, which only the ground step (`stepMotion`) takes. The medium step (`stepMediumMotion`) and `updateSpeed` take the creep speed as an argument
- The SUV and the camper keep their values (`handbrakeGrip` 0.04, `creepSpeed` 0.12) in `SUV_TYRES` and `CAMPER_TYRES`, read from `SUV_SPEC` and `CAMPER_SPEC`. The sports boat has no `handbrakeGrip`. Its `creepSpeed` (0.12) stays in `SPORTSBOAT_SPEC`
- Behavior does not change for any kind. Tests compare every kind tick by tick with a copy of the old mapping

## Consequences

- A new kind decides what Jump and a sideways stick do. It declares only the values its own mapping reads. The compiler does not catch a leftover tyre value in a kind's limits: each `*_MOTION` is built with `Object.freeze({ ... })`, and TypeScript runs no excess-property check on the result of a generic call. The tests in `profile.test.ts` that compare `SUV_MOTION` and `SPORTSBOAT_MOTION` with the whole expected object catch it
- `grip` stays in `MotionLimits`, because the medium step cancels sideways velocity with it in the air, under water, and afloat
- The beached sports boat still goes through `stepMotion`, which takes `TyreLimits`. Its drive passes `{ handbrakeGrip: grip, creepSpeed }` built from its own limits. `beachedInput` never sets the handbrake or creep, so these values are never read
- Open product question: should the sports boat keep creeping afloat? Today it does, at 0.12 blocks/tick, below the ram threshold of 0.15 (0006). Dropping it would change only `afloatInput` in the boat's drive. Revisit when that is decided
