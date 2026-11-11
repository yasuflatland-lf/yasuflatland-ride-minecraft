# 0246. Toilet and Washstand: interact shows, cut-out textures, baked chrome, and recorded sounds

- Status: Proposed
- Acceptance condition: the owner verifies the cutout probe on the dev BDS on PC and mobile (touch), records screenshots and results, and satisfies every check in Verification still required
- Date: 2026-11-11
- Related: [0240](0240-resort-furniture-family.md): furniture placement and recovery
- Related: [0239](0239-a-beach-chair-that-folds-into-a-table.md): entity interacts and rider departure
- Related: [0238](0238-lounge-pose-by-overriding-the-player-client-entity.md): manual player-triggered probe precedent
- Related: [0030](0030-engine-and-hover-sounds.md): client animation sound effects

## Context

The Toilet and Washstand design uses curved panel rings for bodies and single textured cubes for flat plates and round discs. Alpha-cut outlines and holes save cubes only if Bedrock renders those cutouts correctly and hides faces mapped to transparent texels. A browser reference cannot establish the engine's alpha handling or water draw order. Issue #1566 supplies a manual probe before the dependent model work in #1570 and #1571.

The owner's design and browser reference remain outside the committed repository. Their other shared decisions are timed shows driven by entity interaction, painted chrome, and recorded audio. The probe and Washstand client assets implement these rendering decisions. Interaction wiring and sound assets remain separate work.

## Decision

### Interact-triggered shows

Use the normal entity interact, deduplicated per player per tick and deferred, for PC right-click and mobile touch interaction. Do not measure a button hold. An interact starts the Washstand show; the Toilet interaction seats the player, and eligible rider departure starts its flush as in the Beach Chair rider scan. Disconnects, dimension changes, transfers to another ride, and entity unloads do not start a flush.

A synchronized boolean entity property, `yasu_ride:flushing` for the Toilet or `yasu_ride:running` for the Washstand, becomes true when its show starts and false after a 100-tick timer (5 seconds). Client animations key off that property. Ignore Washstand interacts during a run; refuse Toilet interacts while flushing or occupied with an action-bar hint. Close the lid at flush completion. A reload interrupts the show rather than resuming it.

### Cut-out textures and the probe

Make a flat plate or disc from one textured cube. Its top face carries an alpha-cut texture; the other five faces map to a fully transparent texel region. Use `entity_alphatest` for hard cutouts with alpha 0 or 255. Preserve the nearest opaque region's RGB beneath every alpha-zero texel to avoid black or white filtering fringes. The probe uses uniform warm plate and grey disc regions, so that preservation is exact across their outlines and the plate's rounded-rectangle hole.

Give translucent water `entity_alphablend` in its own bones, listed after all opaque bones. The render controller applies `Material.default` to `*`, then overrides the water bones with `Material.water`. The probe uses a single `water` bone and atlas. The Washstand uses `stream`, `film`, `foam`, and `splash` groups and their children. Its body and water passes share geometry with complementary part visibility and separate texture bindings, preserving binary alpha throughout the body atlas while water uses translucent texels. Explicit idle animation scales and property-gated water visibility prevent idle water from appearing before or after a show. The probe has a blue-green water plate at alpha 140 above an opaque pool floor; its non-top faces also map to transparent texels. Geometry order and material assignment are an assumption to verify, not a recorded engine success.

Keep `yasu_ride_test:cutout_probe` in the test Behavior Pack and its client entity, geometry, render controller and texture in the new dev-only `packs/yasu_ride_test_rp`. Client assets require a Resource Pack, and test assets must not enter the shipped `yasu_ride_rp`, `.mcaddon`, or Realm worlds. Mount and register both test packs only in the dev world. The test Resource Pack has its own UUID and committed version; bump its header and module versions by hand whenever its files change. ADR 0062's dev-version rewrite covers only the main Resource Pack and the main Behavior Pack's dependency on it.

Run `scriptevent yasu_ride_test:cutout_probe` as a player. The handler removes existing probes in that dimension and spawns one three blocks ahead at the player's feet, facing the player. The model holds the plate, disc, and pool about 1.5 blocks above the origin for inspection above, beside, and below. Generate its atlas with `python3 tools/gen_cutout_probe.py`; this standalone deterministic generator is not part of `pnpm model`.

Probe result: **not yet verified in game**.

### Baked chrome

Entities cannot reflect the environment, so paint chrome into the texture as bands across each face: `#8b949a` at 0, `#dde3e6` at 0.22, `#ffffff` at 0.42, `#aab3b9` at 0.58, `#e3e8eb` at 0.8, and `#7d878d` at 1. Add a soft vertical overlay, lighter at the top and darker at the bottom. Use this treatment for the drain flange, grate, overflow cap, tap, and lever; the overflow cap has radial dome shading. The probe's flat grey disc tests cutouts independently of this later finish.

### Recorded sounds with a baked fade

Use the first 5 seconds of each owner-approved recording, with a 0.4-second fade-out baked into the mono `.ogg` file: `toilet_flush.ogg` and `washstand_water.ogg`, with sound IDs `yasu_ride.toilet_flush` and `yasu_ride.washstand_water`. Play at the entity when the corresponding property-driven show starts so nearby players hear it. Animation sound effects provide no volume control for a fade (0030); do not implement a script volume ramp. Sound assets and manual audibility checks belong to their own issue; behavior tests check the synchronized property and timer without requiring audio.

## Consequences

Single-cube plates and discs save the cube budget that panel outlines and rings would consume. Alpha texture padding and per-face UVs become part of the model contract. The extra dev Resource Pack requires world registration, a mount, layout checks, and manual version maintenance, while release packaging continues to include only the two production packs.

Static asset tests establish UVs, alpha values, RGB padding, and material/bone order; they cannot establish Bedrock rendering on either device. Keep this ADR Proposed until the owner completes the checks below. If the result is negative, add a clearly marked **BLOCKED** section to this ADR, keep it Proposed, and do not merge [11/14] (#1570) or [12/14] (#1571). The fallback is N-gon panel rings of 32 sides, subject to the owner's decision; never switch silently.

Revisit the cutout decision if either device shows a fringe, a hidden face, or incorrect alpha order, or if an engine/material update changes the verified behavior. Revisit the chrome or audio approach only if entity reflection or animation sound volume control becomes available through the supported stable engine interfaces.

## Verification still required

Docker is not running for this implementation. No dev BDS restart, in-game test, PC render check, or mobile render check has been performed; there is no positive spike result.

The owner must build with `pnpm build`, restart the dev BDS with `pnpm server:restart`, and run `/scriptevent yasu_ride_test:cutout_probe` from player chat. Inspect on **PC and mobile (touch)** against sky, grass, black wool, and white wool, from above, the side, and below. Fly in creative mode to inspect above and below the raised parts.

- Confirm no black or white fringe around the plate outline, its hole, or the circular disc.
- Confirm no visible hidden faces on the plate, disc, or water plate.
- Confirm correct alpha order for the water plate against the opaque pool floor from both sides: the floor is visible through water from above and correctly occludes water from below.
- Record screenshots and results for both platforms in the pull request, with client/BDS versions and date, and update this ADR with that evidence.

A negative result requires the BLOCKED section and the #1570/#1571 merge stop described above. Until verification is recorded, those model changes remain dependent on this unverified spike.
