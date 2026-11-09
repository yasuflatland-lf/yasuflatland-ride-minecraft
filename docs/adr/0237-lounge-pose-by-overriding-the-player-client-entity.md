# 0237. Lounge pose by overriding the player client entity

- Status: Proposed
- Acceptance condition: the owner verifies the five manual spike checks on the dev BDS and resolves any late-join resend requirement
- Date: 2026-11-09
- Related: [0206](0206-seat-the-roof-tent-occupant-on-a-rideable-seat.md): separate roof tent pose decision

## Context

Issue #1443 (4/10 of the beach chair work) tests a lounge pose before implementing the chair. Stable Script API has no direct player posture setter. The owner chose a Resource Pack override of the vanilla player client definition, adding an animation played through stable `Entity.playAnimation`.

The unchanged fixture at `tests/packs/fixtures/vanilla-player.ce.json` came from [Mojang bedrock-samples player.entity.json](https://raw.githubusercontent.com/Mojang/bedrock-samples/v1.26.60.5/resource_pack/entity/player.entity.json), tag `v1.26.60.5`, the release line of dev BDS `1.26.62.1`. The file was last changed in commit `5bd2d76b` ("v1.26.0.2"). The downloaded SHA-256 was `7e520d872fc72be266223b3db2883c2818742a9a450330753a6de4d2ad813608`; repository formatting may change whitespace.

## Decision

Copy the fixture to `packs/yasu_ride_rp/entity/yasu_ride/player.ce.json`. Preserve the full vanilla definition and add exactly one animations entry, `lounge: animation.yasu_ride.player.lounge`. Do not add it to `scripts.animate`. Exempt only this file's `minecraft:player` client entity from the pack namespace and local reference checks; a dedicated test compares its complete definition with the fixture.

Define `animation.yasu_ride.player.lounge` in `animations/yasu_ride/player.anim.json` with `loop: true`. Both `leftleg` and `rightleg` use rotation `["-90.0 - this", "-this", "-this"]` to cancel the vanilla riding rotations and point straight forward. Rotate `waist` by `[-55.0, 0.0, 0.0]`: its hip-height pivot in `geometry.humanoid.custom` and parent relationship to body, head, and arms lean the torso backward. Negative x swings an upward torso backward and a downward leg forward. The initial backrest angle is 55 degrees, subject to owner adjustment.

The self-contained test-pack probe subscribes to `scriptevent yasu_ride_test:lounge`. For a source player who is not riding, select the nearest rideable entity within four blocks and call its `addRider`. Report no nearby rideable or a failed mount in chat. Already riding players keep their seat. Play the animation with `stopExpression: "!query.is_riding"` and `controller: "yasu_ride.lounge"`. An existing Low Chair is sufficient for the spike; no chair interaction is wired to this animation yet.

If checks 1–3 fail, stop the chair pose work and report to the owner for a decision. Do not switch approaches automatically or open a PR claiming the spike passed.

## Consequences

This override conflicts with other add-ons that override `player.entity.json`. The copy must follow vanilla updates: on every BDS update, compare the fixture against bedrock-samples and update the fixture and override together. The contract test pins the shape and preserves all vanilla animation, controller, material, geometry, texture, and script entries; it cannot prove runtime visual compatibility.

This is a separate judgment from the roof tent's statement that overriding is fragile in [Camping gear](../specs/camping-gear.md). The roof tent keeps its current rideable seat, invisibility, and sleeping bag representation (0206). This spike does not change that approach.

## Spike results

1. PC: the player lounges in first person and third person, and other players see the pose. **Not yet checked (manual, on the dev BDS)**.
2. Mobile: the same pose and visibility checks. **Not yet checked (manual, on the dev BDS)**.
3. Dismounting restores the normal pose. **Not yet checked (manual, on the dev BDS)**.
4. A player joining while the animation is playing sees the pose. **Not yet checked (manual, on the dev BDS)**. If late joiners do not see it, 9/10 (#1448) must resend the animation on an interval.
5. Walking, swimming, sleeping, arm swings, and other ordinary animations remain intact. **Not yet checked (manual, on the dev BDS)**.
