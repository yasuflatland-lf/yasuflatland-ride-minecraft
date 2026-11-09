# Resort gear

- Scope: Beach Parasol placement, rain ceiling persistence, recovery, Beach Chair assets, and Resort Gear assets. Dye painting is covered by [Paint](paint.md); starter grants are included.
- Verified at: 732f6c1c
- Source: [0236](../adr/0236-a-beach-parasol-in-a-new-resort-gear-group.md)
- Source: [0238](../adr/0238-a-beach-chair-that-folds-into-a-table.md)
- Source: [0235](../adr/0235-share-convex-rain-ceiling-geometry-and-placement.md)

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
- Implementation: `src/application/resort/syncParasolCeilings.ts`; `src/domain/resort/parasolPose.ts`; `src/infrastructure/resort/bedrock/bedrockParasolWorld.ts`; `src/infrastructure/resort/bedrock/handlers/lifecycle.ts`; `src/infrastructure/shared/rainCeiling.ts`; `src/infrastructure/shared/laidBlockGuard.ts`
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
- Rule: Resort Gear follows Camping Gear (Outside) in the creative catalog and contains the Beach Parasol item as its first member and icon, followed by Beach Chair. Its entity uses a base hit box without physics collision. The ceiling has no collision or selection box, visible geometry, light emission, or light dampening, and carries the laid tag. Both locales include placement and recovery messages. The item and recipe are defined in the packs.
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

### Beach Chair assets

- Applies to: Beach Chair pack assets; scripted behavior is not implemented yet.
- Rule: Resort Gear lists Beach Chair immediately after Beach Parasol. The unpainted teak entity has a 1 by 2 footprint, one player seat at [0, 0.4375, 0.125] blocks without interaction text, and client-synchronized `yasu_ride:folded` (default false). The controller selects the saved static form on load and animates later changes over 10 ticks. The chair bed outline is x [-6, 6], z [-16, 16] px, with top y=7, hinge [0, 7, 3], and backrest angle 37 degrees. The chair uses eight straight square posts, all 1.2 by 1.2 px: four main-frame legs at z=-7.8 and 1.8 up to y=5.6, two inset stub legs at z=-15.6 up to y=5.6, and two rear-frame legs at z=14.8 up to y=5.5. Main and rear legs have outside faces at x=+-6; stub legs have outside faces at x=+-5.3. All posts stand above near-black, ungrained pads at y [0, 0.2], inset 0.08 px on each side. A 0.018 px dark seam marks each leg-to-rail joint. The texture atlas is 96 by 16 px. All side rails are 1.2 px thick. Main rails run z [-7.8, 3], y [5.6, 7] (1.4 px deep), beginning exactly at the stub junction. Stub rails are inset to x=+-5.3, at y [5.6, 6.8] (1.2 px deep); the foot cross rail runs z [-15.6, -15.1]. Rear rails run z [3, 16], y [5.5, 6.6] (1.1 px deep), with a head cross rail at z [15.4, 16]. Ten bed and backrest slats are 0.66 px wide with 0.46 px gaps, centered within x [-5.37, 5.37]; nine stub slats use half-pitch offsets and overhang the foot cross rail to z=-16. Stub slats, the pale interlocking band, and main bed slats all have their top at y=7 and underside at y=6.8. The 4.5 px band spans z [-12.3, -7.8], retaining 0.5 px main fingers and 0.18 px foot fingers with 0.22 px air gaps. There is no vertical step or open side gap at the junction; only the inset stub rail sits lower. Backrest slats remain 0.06 px thick and meet the bed directly at the hinge. Only the outward/downward head-end backrest crossbar remains. Two bright steel prop strips, each 0.25 px wide and 0.12 px thick, sit just inside the rear legs at x [-4.8, -4.55] and [4.55, 4.8]. Each joins the backrest underside at 40 percent of its 12.8 px length to the rear rail center at y=6.05, z=15.4 (25.705 degree slope, 9.184 px length). They have no connecting crossbar and stow before the chair group is hidden. The table is one plain rectangle at x [-6, 6], z [-7.8, 3] px, matching the main bed from the stub junction to the backrest hinge, excluding both the stub and rear frame. Its center is [0, -2.4] in the x/z plane, rather than the entity origin, because the main bed is offset toward the foot end. It remains inside the chair outline and spans portions of both original cells (z [-16, 0] and [0, 16]). This exact main-bed interval is 10.8 px long and 12 px wide; it takes precedence over the reference product table's approximate 1.6:1 ratio. Its top is y=7 with underside y=6.8. Exactly four 1.2 by 1.2 px corner legs stand at x=-6 and 4.8, z=-7.8 and 1.8, up to y=5.6 above the same pads and with the same joint seams. Its four apron rails are 1.2 px thick and 1.2 px deep at y [5.6, 6.8]. It has no stub frame, pale band, or extra legs. The continuous slatted surface has edge-to-edge joints without grooves or black gaps. Nine true 0.36 px square holes form one row across the tabletop midpoint z=-2.4, separated by wood. The required root/frame/backrest/prop bones remain; chair parts descend from `chair_form`, while `table_form` carries the rectangular frame and a `table_top` child. Static poses use complementary zero/one group scales; fold/unfold rotate the backrest and prop, then switch group scales with pre/post keys at the end of the 10-tick transition. The renderer hides scaled-out descendants too. The shaped recipe uses planks, sticks, and iron. The item, recipe, and entity exist without scripted placement, menus, player poses, table support blocks, hosting, or recovery.
- Agreement: Proposed
- Basis: [0238](../adr/0238-a-beach-chair-that-folds-into-a-table.md) Decision.
- Implementation: `tools/gen_beach_chair.py`; `packs/yasu_ride_bp/entities/yasu_ride/beach_chair.se.json`; `packs/yasu_ride_bp/items/yasu_ride/beach_chair_item.item.json`; `packs/yasu_ride_bp/recipes/yasu_ride/beach_chair_item.recipe.json`; `packs/yasu_ride_rp/animation_controllers/yasu_ride/beach_chair.ac.json`
- Verification: `tests/packs/beachChair.test.ts` checks geometry bounds, orientation, seat, property, animations, catalog, and recipe. `tests/tools/renderPreview.test.ts` checks static table posing. Owner visual approval and in-game verification remain pending.

## Open issues

- ADR 0236 says the rain block is laid under the canopy; the implementation lays it in the first cell above the canopy top, following the linked design (`src/domain/resort/parasolPose.ts`); the ADR needs an edit or a superseding ADR.
- Canopies may overlap. Shared ceiling cells are not jointly owned, so taking one parasol back can leave a temporary hole until the other parasol's next scan. The rain and snow acceptance check and fallback from ADR 0236 are recorded in [Camping gear](camping-gear.md#open-issues).
