# 0073. Keep the hover sound on a riderless vehicle until its wheels come down

- Status: Accepted
- Date: 2026-10-20
- Extends: 0030

## Context

0030 plays the engine only while `query.has_rider`, and 0041 plays the sonar under water only while `query.has_rider`; 0041's Consequences say an unattended submarine is silent, as a parked car is. 0030 does not say what the hover sound does when nobody rides.

The SUV and the camper share one form controller layout: `controller.animation.yasu_ride.suv.form` (`suv.ac.json`) and `controller.animation.yasu_ride.camper.form` (`camper.ac.json`). Its `hover` state is active from the moment the wheels finish folding until the landing gear comes down (0033), so through the takeoff, hover and landing forms. That state plays one of `hover_sound_0` to `hover_sound_4`, picked only by `query.ground_speed`, with no `query.has_rider` test. The engine levels are not in the form controller: the client entities `suv.ce.json` and `camper.ce.json` play `engine_sound_0` to `engine_sound_5` only while `query.has_rider` and `yasu_ride:form` is `car`.

A flying vehicle with neither a driver nor test input starts landing at once (0021). So when the last rider gets out while the wheels are folded, the vehicle sinks with nobody aboard and keeps the rushing air. The gear comes down once a solid block lies within `SUV_SPEC.gearDownHeight` or `CAMPER_SPEC.gearDownHeight` (both 4) blocks below it, at touchdown if it sinks through deeper water (0033), or when it goes under water and becomes a submarine, which lowers the gear. Then the controller moves from `hover` to `retract`. The sports boat does not fly and has no hover sound.

## Decision

- The `hover` state of the SUV and camper form controllers plays its hover level whether or not anyone rides. Its conditions do not test `query.has_rider`
- This is a deliberate difference from the engine and the sonar, which keep their `query.has_rider` guard: the engine levels in the client entities' `scripts.animate`, and `submarine_sound` in the `submarine` state of the form controller (0041)
- The hover sound ends as before: the gear comes down and the controller leaves `hover` for `retract` (0033). No new hover level starts after that; a clip already playing finishes within its 1 s length, as 0030 notes for any level change
- A vehicle with a passenger but no driver has `query.has_rider` true, so its hover sound does not depend on this decision

## Consequences

- Nearby players hear that a riderless vehicle is still in the air and descending, and where it is coming down
- A riderless vehicle in `car` form or in the submarine form is still silent, as 0030 and 0041 say
- `tests/packs/resourcePack.test.ts` checks that no hover level of either controller tests `has_rider`. Adding a rider guard to the hover state needs a new ADR that supersedes this one
