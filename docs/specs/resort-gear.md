# Resort gear

- Scope: Beach Parasol placement, rain ceiling persistence, recovery, and Resort Gear assets. Dye painting is covered by [Paint](paint.md); starter grants are included.
- Verified at: 732f6c1c
- Source: [0236](../adr/0236-a-beach-parasol-in-a-new-resort-gear-group.md)
- Source: [0235](../adr/0235-share-convex-rain-ceiling-geometry-and-placement.md)
- Source: [0238](../adr/0238-lounge-pose-by-overriding-the-player-client-entity.md)

## Rules

### Feature installation and placement

- Applies to: Using `yasu_ride:beach_parasol_item` on a block.
- Rule: Bootstrap installs resort after camp, supplying vehicle and camp space checks. Resort imports shared helpers without importing camp. First block interactions are cancelled, deduplicated per player per tick, and deferred. Only a top face outside the add-on's blocks is accepted. The canopy centers over the pressed cell; the base lies `PARASOL_SPEC.baseOffset` (3.25 blocks) farther along the player's quarter-turn heading. A solid top must support the block below the base centre; support is not required below every tray cell. The fractional base position is preserved for spawning and spacing. Model `footCells` translate with that position, and every integer world cell overlapped by a translated cell must be air outside vehicle and camp space. Another base at a Chebyshev distance below `PARASOL_SPEC.minBaseDistance` refuses placement. Refusal shows an action-bar hint before payment. Survival consumes one matching held item; Creative pays nothing. Failed spawn refunds a paid item. Successful spawn lays its ceiling. All parasol tuning lives in `src/domain/resort/spec.ts`.
- Agreement: Proposed
- Basis: [0236](../adr/0236-a-beach-parasol-in-a-new-resort-gear-group.md) Decision, placement follows the design document.
- Implementation: `src/application/resort/placeParasol.ts`; `src/application/resort/ports/parasolWorld.ts`; `src/infrastructure/resort/install.ts`; `src/infrastructure/resort/bedrock/handlers/placement.ts`; `src/infrastructure/resort/bedrock/bedrockParasolWorld.ts`; `src/infrastructure/bootstrap.ts`
- Verification: `tests/domain/resort/parasolPose.test.ts` checks integer clearance coverage and centre support for fractional bases at all quarter turns. `tests/application/resort/placeParasol.test.ts` checks individual footprint obstructions, missing centre support, Creative exclusion, payment failure, spawn refunds, and ceiling order. `tests/infrastructure/resort/handlers.test.ts` checks deferred deduplication. Live device placement has not been run.

### Rain ceiling and recovery

- Applies to: Loaded parasols and their recorded ceiling cells.
- Rule: A parasol lays invisible `yasu_ride:parasol_ceiling` blocks in every column overlapping its octagonal canopy, in the first cell above the canopy top (`PARASOL_SPEC.canopyTop`, 4.1875 blocks). Only air outside vehicle space is filled. The entity dynamic property `yasu_ride:parasol_ceiling` records cells as JSON. Every `PARASOL_SPEC.ceilingSyncTicks` ticks, loaded parasols restore their saved record and missing cells, preserving the fractional base position when rebuilding the canopy. Nearby-base queries preserve that position for spacing checks. Taking back or removing a parasol clears only its recorded cells still holding the ceiling block; replacements remain. Removal is checked on the next tick, and an unloaded base chunk preserves the ceiling. Unloaded recorded cells remain pending for later cleanup after a confirmed removal. A shared laid-block guard cancels Creative breaks of recorded ceilings.
- Agreement: Proposed
- Basis: [0236](../adr/0236-a-beach-parasol-in-a-new-resort-gear-group.md) Decision, rain shelter follows the design document; [0235](../adr/0235-share-convex-rain-ceiling-geometry-and-placement.md) Decision, shared footprint geometry and rain ceiling layer.
- Implementation: `src/application/resort/syncParasolCeilings.ts`; `src/domain/resort/parasolPose.ts`; `src/infrastructure/resort/bedrock/bedrockParasolWorld.ts`; `src/infrastructure/resort/bedrock/handlers/lifecycle.ts`; `src/infrastructure/shared/laidBlockLayer.ts`; `src/infrastructure/shared/laidBlockGuard.ts`
- Verification: `tests/infrastructure/resort/bedrockParasolWorld.test.ts` checks saving, fresh-adapter restoration, replacement preservation, and unloaded-cell retry. `parasol_rain_ceiling` verifies ceiling placement, periodic repair, and cleanup on the dev BDS. The block's ability to stop actual rain and snow remains unverified.

### Taking the parasol back

- Applies to: Player hits on a Beach Parasol base.
- Rule: Hits count once per player per tick through shared hit counters. Three hits within the reset window clear the ceiling, give the hitter one plain parasol item (dropping inventory overflow), remove the entity, and show the taken hint, in that order. Earlier hits show the remaining count. A gap beyond `PARASOL_SPEC.hitResetTicks` restarts counting. Server test hooks use the same take-back action, dropping at the base when no player resolves.
- Agreement: Proposed
- Basis: [0236](../adr/0236-a-beach-parasol-in-a-new-resort-gear-group.md) Decision, pick-up follows the design document.
- Implementation: `src/application/resort/takeBackParasol.ts`; `src/infrastructure/resort/bedrock/handlers/hits.ts`; `src/infrastructure/resort/bedrock/handlers/testParasol.ts`
- Verification: `tests/application/resort/takeBackParasol.test.ts` checks effect order, reset gaps, and loaded-ceiling synchronization. `parasol_place_take_back` verifies fractional spawn position, hit counting, item return, and ceiling cleanup on the dev BDS.

### Resort catalog and invisible block

- Applies to: Beach Parasol pack assets.
- Rule: Resort Gear follows Camping Gear (Outside) in the creative catalog and contains the Beach Parasol item as its only member and icon. Its entity uses a base hit box without physics collision. The ceiling has no collision or selection box, visible geometry, light emission, or light dampening, and carries the laid tag. Both locales include placement and recovery messages. The item and recipe are defined in the packs.
- Agreement: Proposed
- Basis: [0236](../adr/0236-a-beach-parasol-in-a-new-resort-gear-group.md) Decision, new group and option A ceiling block.
- Implementation: `tools/gen_item_catalog.py`; `packs/yasu_ride_bp/entities/yasu_ride/beach_parasol.se.json`; `packs/yasu_ride_bp/blocks/yasu_ride/parasol_ceiling.block.json`; `packs/yasu_ride_rp/texts/en_US.lang`; `packs/yasu_ride_rp/texts/ja_JP.lang`
- Verification: `tests/packs/campingGear.test.ts` checks catalog ordering. Pack contract tests cover the previously supplied parasol assets; rain occlusion is not established by these tests.

### Beach parasol starter item

- Applies to: Players joining the world for the first time.
- Rule: `installResort` registers the shared first-join hand-out for the Beach Parasol item with its own dynamic property `yasu_ride:beach_parasol_starter_received`, separate from the roof tent flag. Creative players receive nothing and are not marked. A failed hand-out leaves the player unmarked so the next join retries. A full inventory drops the item at the player's feet. Respawns do not hand out.
- Agreement: Proposed
- Basis: [0236](../adr/0236-a-beach-parasol-in-a-new-resort-gear-group.md) Decision, first hand-out follows the design document.
- Implementation: `src/infrastructure/resort/install.ts`; `src/infrastructure/resort/identifiers.ts`; `src/application/shared/giveStarterItem.ts`; `src/infrastructure/shared/starterItem.ts`
- Verification: `tests/infrastructure/resort/install.test.ts` checks the registration and the separate flag. A new Survival player receiving both items on the dev BDS has not been verified.

### Manual lounge pose spike

- Applies to: A player running `scriptevent yasu_ride_test:lounge` with the test pack enabled.
- Rule: Keep an existing ride, or mount the nearest rideable within four blocks. Report a missing rideable or failed mount in chat. Play the looping lounge animation until dismount, with straight forward legs and a 55-degree backward waist rotation. The player client definition preserves vanilla content and adds only the lounge animation mapping. Normal chair interactions do not trigger the spike.
- Agreement: Accepted
- Basis: [0238](../adr/0238-lounge-pose-by-overriding-the-player-client-entity.md) Decision.
- Implementation: `src/test-pack/loungeProbe.ts`; `packs/yasu_ride_rp/entity/yasu_ride/player.ce.json`; `packs/yasu_ride_rp/animations/yasu_ride/player.anim.json`
- Verification: `tests/packs/playerOverride.test.ts` pins the vanilla definition and pose. The owner checked the lounge pose on the dev BDS on 2026-11-09 and reported it as OK (ADR 0238).

## Open issues

- ADR 0236 says the rain block is laid under the canopy; the implementation lays it in the first cell above the canopy top, following the linked design (`src/domain/resort/parasolPose.ts`); the ADR needs an edit or a superseding ADR.
- Canopies may overlap. Shared ceiling cells are not jointly owned, so taking one parasol back can leave a temporary hole until the other parasol's next scan. The rain and snow acceptance check and fallback from ADR 0236 are recorded in [Camping gear](camping-gear.md#open-issues).
