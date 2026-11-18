# Scooter rider root roll (design)

Size: a small change, in one pull request. The owner chose option A (roll the player `root` bone) over rolling the legs separately (B) and over keeping the waist-only lean (C).

## Intent

When the scooter leans into a turn, the whole rider leans with it, legs included. Today only the `waist` bone rolls (ADR 0250), so the torso, head and arms tilt while the legs stay vertical and the scooter body tilts away from them.

## Why the legs stay still today

In the vanilla player geometry the torso, head and arms are children of `waist`; the legs are siblings under `root`. The six `scooter_lean_*` and six `scooter_pillion_lean_*` animations roll `waist` about z (8, 16, 24 degrees) and leave the legs on the grip pose. The scooter model, by contrast, rolls its own `root` bone by `lean - bank` (`scooter.anim.json`).

## Decisions

- Move the stepped roll from `waist` to the player's `root` bone in all twelve lean animations, driver and passenger. Positive is left, as today. `waist` keeps no roll.
- Why `root` works geometrically: the player model's origin is at the feet, and Bedrock seats a rider 0.4 blocks below the seat position (ADR 0029), so the origin sits about 4 px above the ground. That is close to the scooter's own roll axis. A rigid roll about that point moves the hips sideways by roughly the same amount as the scooter's seat moves (about 5 px at 20 degrees), which a waist roll cannot do. The engine seat itself does not lean, so the rider has to move with the model.
- The angle steps become a tuning value. Starting values: 7, 13 and 20 degrees, so the strongest step matches `SCOOTER_SPEC.maxLean` (20). These are my call, not the owner's; the old 8, 16 and 24 degrees were chosen for a waist roll and would over-tilt a whole body.
- The grip pose (arms -70 or 20, legs -35, each with the `this` cancel) is unchanged, and so is everything outside `player.anim.json`: the profile pose tables, `RiderPoseState`, `BedrockRiderPose`, the refresh logic and the test-pack probe commands. The level count (3 per side) stays.
- The roll is additive: it does not use the `this` cancel. If the vanilla `riding.root` animation also writes `root` rotation, cancel only that term, and only if the device shows a wrong angle or offset.

## Approaches considered

1. Roll `root` (chosen): one bone, legs and everything follow, the axis matches the scooter's. Risk: it composes with the vanilla `riding.root` animation, and the hips can look off the seat.
2. Roll `waist` plus both legs about the hips: smaller risk to the seat, but the pivot is the hip, so the feet swing the opposite way from the scooter and leave the floorboard.
3. Keep the waist-only lean: no work, but the legs and the scooter visibly disagree.

## Non-goals

First-person camera roll (the camera does not follow the model bone), other vehicle kinds, scooter model changes, the arm swing investigation (#1930), changing how lean levels are derived.

## Parts

- `packs/yasu_ride_rp/animations/yasu_ride/player.anim.json`: replace the `waist` entry with a `root` entry in the twelve lean animations; update the step angles.
- `tests/packs/playerOverride.test.ts`: the tests that pin the six waist angles for the driver and the passenger now pin the `root` roll and assert that `waist` has no roll.
- Specs and ADRs, edited in place (AGENTS.md: no new ADR for a tuning change): ADR 0250 Decision, Context where it says "waist roll", and its Owner checks; `docs/specs/seats-and-driver.md` rules for the probe (`l1`-`r3`) and the rider pose. Pending checks stay Pending until the owner confirms on a device.
- Bump the Resource Pack manifest version (0015). The dev BDS needs `pnpm server:restart`; `/reload` is not enough for Resource Pack changes.

## Verification

- Unit: the updated pack test, plus `pnpm lint`, `lint:lang`, `lint:docs`, `lint:unused`, `lint:deps`, `typecheck` and `test`. `pnpm model:check` too if a generator input changes.
- Device, judged by the owner on PC and mobile in third person: `scriptevent yasu_ride_test:scooter_pose l3` and `r3` for the probe with one and two riders, then a real turn on the ground and in flight. Look for: the roll sign matches the scooter, the feet stay on the floorboard, the hips stay on the seat, the angle matches the scooter's, and dismounting restores the normal pose. Other players should see the same.

## Fallback

If `root` cannot be animated this way or the result is wrong on the device, stop and report. Switching to approach 2 needs the owner's agreement (ADR 0250: do not switch approaches automatically).

## Left to the builder

- The exact step angles after the device check.
- Whether a small counter-roll on `waist` keeps the head steadier.
- Whether the vanilla `riding.root` term needs cancelling.
