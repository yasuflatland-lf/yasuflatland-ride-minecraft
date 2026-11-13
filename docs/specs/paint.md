# Paint

- Scope: Paint order, dyes, repaint cost and hit routing, variant textures, and plain returned items for the SUV, camper, sports boat, bulldozer, ground tent, roof tent, and beach parasol.
- Verified at: 5ed1f579
- Source: [0031](../adr/0031-repaint-with-all-sixteen-dyes.md)
- Source: [0036](../adr/0036-paint-by-hitting-with-a-dye.md)
- Source: [0037](../adr/0037-one-dye-per-repaint-within-a-tick.md)
- Source: [0076](../adr/0076-per-kind-default-paint.md)
- Source: [0190](../adr/0190-ribbed-camper-shell-atlas.md)
- Source: [0135](../adr/0135-repaint-the-tent-with-dyes.md)
- Source: [0236](../adr/0236-a-beach-parasol-in-a-new-resort-gear-group.md)
- Source: [0200](../adr/0200-roof-tent-as-a-host-bound-camp-entity.md)
- Excluded: [0197](../adr/0197-emit-camper-hover-particles-below-the-discs.md): hover particles belong to the flight topic.
- Excluded: [0199](../adr/0199-square-the-camper-front-and-fold-the-grille.md): front geometry belongs to the camper body topic.
- Excluded: [0192](../adr/0192-suv-detailed-body.md): supersedes in part 0031's texture size and paint-dependent regions for SUV body detail, covered by the SUV body topic
- Excluded: [0136](../adr/0136-bulldozer.md): extends 0031 and 0076 for the bulldozer, covered by the bulldozer topic
- Excluded: [0207](../adr/0207-lay-a-rain-ceiling-over-an-occupied-roof-tent.md): temporary occupied roof tent rain ceilings belong to the camping gear topic.

## Rules

### Paint order and variant

- Applies to: SUV, camper, sports boat, bulldozer, and tent.
- Rule: `PAINTS` defines the sixteen paints and their saved `minecraft:variant` indices: khaki, green, red, white, light_gray, gray, black, orange, yellow, lime, cyan, light_blue, blue, purple, magenta, pink. Preserve this order, including the early khaki, green, and red indices; append new paints.
- Agreement: Proposed
- Basis: [0031](../adr/0031-repaint-with-all-sixteen-dyes.md) Decision, "`PAINTS` in the domain holds this order, and the dye map and variant numbers in the scripts are derived from it."; [0031](../adr/0031-repaint-with-all-sixteen-dyes.md) Decision, "New paints go at the end"; [0135](../adr/0135-repaint-the-tent-with-dyes.md) Decision, "The `PAINTS` order now also binds the tent"; [0135](../adr/0135-repaint-the-tent-with-dyes.md) Decision, "New paints still go at the end."
- Implementation: `src/domain/shared/paint.ts` (`PAINTS`); `src/infrastructure/shared/dyes.ts` (`PAINT_VARIANT`); the five painted entity definitions in `packs/yasu_ride_bp/entities/yasu_ride/`.
- Verification: `tests/domain/shared/paint.test.ts` "preserves the saved variant order"; `tests/packs/paint.test.ts` "khaki, green, and red keep the variants ADR 0017 gave them" and "each paint event sets that paint's variant and drops the other paints" (SUV and tent). Not verified: full event-to-index coverage for every vehicle kind in this test file (see Open issues). Tests were inspected, not run for this document.

### Dye to paint

- Applies to: SUV, camper, sports boat, bulldozer, and tent.
- Rule: `PAINT_BY_DYE`, derived through `dyeOf`, accepts only the sixteen vanilla `minecraft:<color>_dye` items. Brown maps to `PAINTS[0]`; every other dye maps to its named paint. Ink sacs, bone meal, cocoa beans, and lapis lazuli do not repaint. `heldDye` reads the selected hotbar slot.
- Agreement: Proposed
- Basis: [0031](../adr/0031-repaint-with-all-sixteen-dyes.md) Decision, "Every vanilla dye can repaint a dyeable vehicle. Brown dye restores its starting color; each of the other 15 dyes paints the color of its name."; [0031](../adr/0031-repaint-with-all-sixteen-dyes.md) Consequences, "The legacy dye items (ink sac, bone meal, cocoa beans, lapis lazuli) do not repaint."; [0135](../adr/0135-repaint-the-tent-with-dyes.md) Decision, "so brown dye restores it, as it restores khaki on the vehicles (0076)."
- Implementation: `src/infrastructure/shared/dyes.ts` (`dyeOf`, `PAINT_BY_DYE`, `heldDye`); `src/infrastructure/shared/heldItem.ts`.
- Verification: `tests/infrastructure/shared/dyes.test.ts` "maps every paint to a distinct dye and back", "reads any dye from the selected slot", and "returns undefined for a non-dye, empty slot, or missing inventory"; `tests/packs/paint.test.ts` "each of the 16 vanilla dyes maps to its own paint, and brown dye restores khaki" checks the complete accepted key set. Not verified: individual legacy-item hit gestures in game; manual-test row 15 has no owner result recorded.

### Dye hit routing

- Applies to: SUV, camper, sports boat, and bulldozer, including a stand-in that receives a vehicle's hits.
- Rule: The `entityHitEntity` after-event resolves the vehicle through `vehicleOfTarget` and the selected-slot dye through `heldDye`. A dye hit executes `PaintVehicle` immediately in the handler and returns without calling `HitVehicle`, including when repainting does nothing. Interacting never repaints, whatever the player holds; boarding remains in the boarding handler.
- Agreement: Accepted
- Basis: [0036](../adr/0036-paint-by-hitting-with-a-dye.md) Decision, "the hit repaints the vehicle by the rules of 0031 and does not count toward breaking it"; [0036](../adr/0036-paint-by-hitting-with-a-dye.md) Decision, "Interacting with a vehicle (the ride button or a long press on touch, right-click on PC) no longer repaints it, whatever the player holds."; [0036](../adr/0036-paint-by-hitting-with-a-dye.md) Decision, "`entityHitEntity` is an after-event, which may change the world, so the repaint runs in the handler without `system.run`"
- Implementation: `src/infrastructure/vehicle/bedrock/handlers/hits.ts`; `src/infrastructure/vehicle/bedrock/handlers/boarding.ts`; `src/infrastructure/vehicle/bedrock/standIns.ts`.
- Verification: `tests/infrastructure/vehicle/bedrock/subscriptions.test.ts` "paints a hit vehicle with a held dye and otherwise damages it, ignoring other hits" and "passes a hit or a dye on the stand-in to its camper, and drops one whose camper is gone". Not verified: that interaction never repaints (no test); manual-test rows 27, 28, and camper C10 (dye ignored) have no owner result recorded.

### Cost and no-op

- Applies to: SUV, camper, sports boat, bulldozer, and tent.
- Rule: `Repaint.execute` consumes one selected-slot dye outside Creative when the shown color changes. It consumes none in Creative. Compare both requested and current paint through `effectivePaint`: `PAINTS[0]` means the entity's `defaultPaint`, and every other paint means itself. Equal effective paints change nothing and keep the dye. Dyeable vehicle policies supply `defaultPaint`; the tent uses `TENT_SPEC.defaultPaint`. If the current paint or default paint cannot be read, including a removed entity or an unknown vehicle kind, do nothing and keep the dye, even after a repaint earlier in that tick. The camper uses `fixed("khaki")`: every dye is ignored, in Survival and Creative, without paint changes, dye consumption, sound, or a message. A variant-0 SUV uses `dyeable("khaki")`, so brown dye also does nothing there. No dye is named khaki.
- Agreement: Proposed
- Basis: [0031](../adr/0031-repaint-with-all-sixteen-dyes.md) Decision, "Using a dye consumes one, except in creative mode."; [0076](../adr/0076-per-kind-default-paint.md) Decision, "A dye whose effective paint equals the vehicle's current effective paint does nothing and keeps the dye."; [0076](../adr/0076-per-kind-default-paint.md) Decision, "A vehicle whose kind cannot be read, because it is gone or is not a vehicle, is not painted and keeps the dye, even if it was painted earlier in the same tick (0037)"; [0135](../adr/0135-repaint-the-tent-with-dyes.md) Consequences, "Repainting a tent costs one dye outside Creative"
- Implementation: `src/application/shared/repaint.ts`; `src/domain/shared/paint.ts` (`effectivePaint`); `src/domain/vehicle/profile.ts` and each `src/domain/vehicle/kinds/<kind>/profile.ts` (`paintPolicy`); `src/application/vehicle/paintVehicle.ts`; `src/application/camp/paintTent.ts`; `src/infrastructure/vehicle/bedrock/bedrockPaintWorld.ts`; `src/infrastructure/vehicle/bedrock/bedrockInventory.ts`; `src/infrastructure/camp/bedrock/bedrockTentPaintWorld.ts`; `src/infrastructure/shared/players.ts` (`consumeHeld`, using `dyeOf(paint)`).
- Verification: `tests/application/shared/repaint.test.ts` "repaints a different shown color and consumes dye only outside Creative" and "does nothing when either paint or default paint is missing"; `tests/application/vehicle/paintVehicle.test.ts` "repaints exactly when the shown color changes, per kind (ADR 0076)", "black or brown dye on a new or black sports boat keeps the dye (ADR 0076)", "does nothing when the vehicle's kind is unknown", and "does nothing to a vehicle removed after a repaint in the same tick (ADR 0037, 0076)". `tests/application/camp/paintTent.test.ts` "repaints with a dye of another color, using one dye outside Creative" and "never paints a tent that is gone, and keeps the dye". Not verified: actual player inventory consumption in game; manual-test rows 15, 27, camper C10, sports boat B5, and T28-T33 have no owner result recorded.

### Fixed camper paint on load

- Applies to: Camper entities loaded or re-adopted through `entityLoad` or `entitySpawn` with cause `Loaded`.
- Rule: `NormalizePaint.normalizeFixedPaint` resets a fixed-policy vehicle with a stored nonzero paint to `PAINTS[0]`. It returns true only when it requests that change. Variant 0, missing vehicles, and dyeable vehicles are untouched. Normalization consumes no dye and plays no sound. Existing pack textures and events remain unchanged.
- Agreement: Proposed
- Basis: [0076](../adr/0076-per-kind-default-paint.md) Decision; [0190](../adr/0190-ribbed-camper-shell-atlas.md) Decision, retained paint texture variants and the fixed khaki variant.
- Implementation: `src/application/vehicle/normalizePaint.ts`; `src/infrastructure/vehicle/kinds/camper/handlers/normalizePaint.ts`.
- Verification: `tests/application/vehicle/normalizePaint.test.ts` covers nonzero camper paints, variant 0, dyeable kinds, and missing vehicles. `tests/application/vehicle/paintVehicle.test.ts` covers all sixteen dyes in both game modes. `tests/infrastructure/vehicle/bedrock/subscriptions.test.ts` routes a camper stand-in dye hit through the real `PaintVehicle` and verifies no paint, consumption, sound, or damage. `tests/infrastructure/vehicle/kinds/camper/normalizePaint.test.ts` verifies normalization for valid camper `entityLoad` and `entitySpawn` with cause `Loaded`, and no change for non-campers, invalid entities, or `Spawned`/`Born` causes. Client load recovery remains unverified.

### One dye per repaint within a tick

- Applies to: Shared repaint logic for vehicles and tents; tent hits also have the swing gate described below.
- Rule: One `Repaint` instance remembers applied paints by entity in a `TickScopedMap`. A second request with the same effective paint in that tick does nothing and keeps the dye despite delayed engine variants. A different effective paint still repaints and consumes its dye outside Creative; the last applied paint wins. The map clears when a different tick arrives, including a later tick, and the world paint is read again. `PaintVehicleCommand` has no tick: `PaintVehicle` reads `Clock.now()`. `PaintTent` takes the tick from its command.
- Agreement: Proposed
- Basis: [0037](../adr/0037-one-dye-per-repaint-within-a-tick.md) Decision, "A second hit with the same dye in that tick does nothing and keeps the dye"; [0037](../adr/0037-one-dye-per-repaint-within-a-tick.md) Decision, "A different dye in the same tick still repaints and uses its dye; the last one applied wins"; [0135](../adr/0135-repaint-the-tent-with-dyes.md) Context, "same-tick, and Creative rules."
- Implementation: `src/application/shared/repaint.ts` (`painted`); `src/domain/shared/tickScoped.ts`; `src/application/vehicle/paintVehicle.ts`; `src/application/camp/paintTent.ts`.
- Verification: `tests/application/shared/repaint.test.ts` "uses one dye for two same-tick hits despite engine lag (ADR 0037)", "reads the world's paint again once the painting tick has passed", and "repaints twice for different shown colors in the same tick"; `tests/application/camp/paintTent.test.ts` "paints once for two identical hits in a tick, again for another dye, and rereads after the tick". Not verified: delayed variants on the current server; the event scenarios described below were not run.

### Applying and displaying paint

- Applies to: SUV, camper, sports boat, bulldozer, and tent.
- Rule: `world.paint` triggers `yasu_ride:paint_<paint>` using `paintEvent` and `paintEventName`. `Repaint` then consumes the dye and only afterwards calls `world.playPaintSound`, which plays `dye.use` at the entity and logs a warning instead of throwing, so a failing sound cannot block the dye. Each event sets `minecraft:variant` to the paint's `PAINTS` index and removes the other paint groups. Each base render controller selects `Array.paints[query.variant]` in `PAINTS` order, with one texture per paint. A dyeable vehicle kind whose variant-0 texture is byte-identical to another paint's texture declares that paint as `defaultPaint`; otherwise it declares `PAINTS[0]`.
- Agreement: Proposed
- Basis: [0031](../adr/0031-repaint-with-all-sixteen-dyes.md) Decision, "the render controller picks the texture by `query.variant`"; [0076](../adr/0076-per-kind-default-paint.md) Decision, "It checks that a kind whose variant-0 texture is byte-identical to another paint's texture shows that paint at variant 0 through `shownPaint`, and that a kind with no identical texture shows `PAINTS[0]`"; [0135](../adr/0135-repaint-the-tent-with-dyes.md) Decision, "`tent.rc.json` picks `Array.paints[query.variant]` from 16 textures in that order."
- Implementation: `src/infrastructure/vehicle/bedrock/bedrockPaintWorld.ts`; `src/infrastructure/camp/bedrock/bedrockTentPaintWorld.ts`; `src/infrastructure/shared/dyes.ts`; `src/domain/shared/paint.ts`; `packs/yasu_ride_bp/entities/yasu_ride/{suv,camper,sportsboat,bulldozer,tent}.se.json`; corresponding `.rc.json` files in `packs/yasu_ride_rp/render_controllers/yasu_ride/` and `.ce.json` files in `packs/yasu_ride_rp/entity/yasu_ride/`.
- Verification: `tests/packs/paint.test.ts` "each paint event sets that paint's variant and drops the other paints" (SUV and tent), "the render controller picks each paint's texture by its variant, and the texture exists" (SUV), and "each painted entity's default paint matches the texture its variant-0 slot shows (ADR 0076)" (all five entities). `tests/packs/sportsboat.test.ts` "each paint event sets that paint's variant and drops the other paints" covers boat events. `tests/packs/bulldozer.test.ts` "switches gravity with the shared groups and paints with the 16 dye events" checks event existence only; "maps each paint and the cab monitor to its texture" checks texture slots. `tests/packs/camper/glass.test.ts` "lists every paint in the camper render controller" checks array length only, with no camper paint-event assertions. Scenario `paint_events` (`src/test-pack/scenarios/suv.ts`, `paintEvents`) and `tent_paint_events` (`src/test-pack/scenarios/tent.ts`, `tentPaintEvents`) check variants after each event; neither was run here. Not verified: camper and bulldozer event contents by tests, player gestures, visible client rendering, or the sound in game.

### A painted vehicle returns its plain item

- Applies to: SUV, camper, sports boat, and bulldozer when broken back into an item.
- Rule: Paint does not create a colored vehicle item. `HitVehicle` asks the world to drop the vehicle item; the adapter creates a fresh stack of `ITEM_TYPE[kind]` without reading or copying paint. Each kind therefore returns its same plain item regardless of paint.
- Agreement: Accepted
- Basis: [0031](../adr/0031-repaint-with-all-sixteen-dyes.md) Decision, "The vehicle item has one color. Breaking a painted vehicle drops the same item"; [0031](../adr/0031-repaint-with-all-sixteen-dyes.md) Consequences, "The color is still lost when a vehicle is picked up, as in 0017"
- Implementation: `src/application/vehicle/hitVehicle.ts`; `src/infrastructure/vehicle/bedrock/bedrockFleetWorld.ts` (`dropVehicleItem`); `src/infrastructure/vehicle/bedrock/identifiers.ts` (`ITEM_TYPE`); corresponding item definitions in `packs/yasu_ride_bp/items/yasu_ride/`.
- Verification: Inspected the drop path and per-kind item identifiers. Not verified: no test identified that repaints a vehicle and checks the returned stack for lost paint.

### Tent paint and fly textures

- Applies to: Pitched tent.
- Rule: The tent follows `PAINTS` through its sixteen `yasu_ride:paint_<paint>` groups and events and `tent.rc.json`. Its starting look is `TENT_SPEC.defaultPaint`; brown restores it. The shared dye mapping, cost, no-op, and tick-memory rules apply. Only bones `fly`, `flap_front`, `flap_left`, and `flap_right` use recolored texture slots 0, 1, and 16 (`fly`, `fly_dark`, and `seam`). `FLY_PAINTS` supplies base colors and `FLY_SHADES` supplies their shades; `texture_path` keeps the base texture for khaki and names the other paint textures. The 19-slot atlas uses a grey-mauve taupe khaki fly (154, 132, 120), with `fly_dark` at 136/176 brightness and `seam` at 0.6 brightness. Tarp slots 17 and 18 (`tarp_top`, caramel tan (176, 135, 90), and `tarp_under`, lighter tan (198, 164, 122)) retain their colors in all sixteen paints. All other slots retain their colors, and generator validation rejects any cube outside the fly group that uses any fly slot.
- Agreement: Proposed
- Basis: [0135](../adr/0135-repaint-the-tent-with-dyes.md) Decision, "The tent's variant 0 shows the tan-brown fly (`TENT_SPEC.defaultPaint` is `khaki`),"; [0135](../adr/0135-repaint-the-tent-with-dyes.md) Decision, "Only the fly group is recolored"; [0135](../adr/0135-repaint-the-tent-with-dyes.md) Decision, "the bones `fly`, `flap_front`, `flap_left`, and `flap_right`, which alone use texture slots 0 and 1"
- Implementation: `src/domain/camp/spec.ts`; `src/application/camp/paintTent.ts`; `tools/gen_tent.py` (`FLY_PAINTS`, `FLY_SHADES`, `paint_palette`, `texture_path`, validation); `packs/yasu_ride_bp/entities/yasu_ride/tent.se.json`; `packs/yasu_ride_rp/render_controllers/yasu_ride/tent.rc.json`; tent textures in `packs/yasu_ride_rp/textures/entity/yasu_ride/`.
- Verification: `tests/packs/tent.test.ts` "uses the fly slots 0, 1, and 16 only in the fly group" and "recolors only slots 0, 1, and 16 for each paint after khaki"; `tests/packs/paint.test.ts`, describe "tent paints (ADR 0031, 0135)", includes "the render controller picks 16 textures in PAINTS order by the variant". Not verified: in-game fly-only recoloring, persistence through reload/restart, or lantern appearance after painting; manual-test rows T28-T33 have no owner result recorded.

### Tent dye hit routing and returned item

- Applies to: Tent block hits, Creative block breaks, and tent entity hits.
- Rule: All three paths reach `hitTent`. After the per-player, per-tick `TickScopedSet` swing check, a held dye executes `PaintTent` and returns before `TakeDownTent`. Creative breaks capture the swung dye and tick and defer execution with `system.run`. Dye hits never count toward taking down the tent and can repaint while someone is inside, without the occupied message. `PaintTent` wraps one `Repaint` for the session. Taking down a painted tent returns a fresh plain `yasu_ride:tent_item`; its paint is lost.
- Agreement: Proposed
- Basis: [0135](../adr/0135-repaint-the-tent-with-dyes.md) Decision, "A dye hit is routed at the top of the tent handler's `hitTent`"; [0135](../adr/0135-repaint-the-tent-with-dyes.md) Decision, "after the shared per-tick swing check and before `TakeDownTent`"; [0135](../adr/0135-repaint-the-tent-with-dyes.md) Decision, "a dye hit never counts toward taking the tent down"; [0135](../adr/0135-repaint-the-tent-with-dyes.md) Decision, "a painted tent taken down returns the plain `yasu_ride:tent_item`"
- Implementation: `src/infrastructure/camp/bedrock/handlers/tentHits.ts`; `src/domain/shared/tickScoped.ts`; `src/application/camp/paintTent.ts`; `src/infrastructure/camp/install.ts`; `src/application/camp/takeDownTent.ts`; `src/infrastructure/camp/bedrock/bedrockTentWorld.ts` (`returnTentItem`); `src/infrastructure/camp/identifiers.ts` (`TENT_ITEM`).
- Verification: `tests/infrastructure/camp/handlers.test.ts` "repaints on a dye hit on a tent block, never taking it down (ADR 0036)", "repaints on a dye hit on the tent entity", "repaints on a Creative dye break only inside the deferred callback", "paints the dye swung at a Creative break, not the one held a tick later", and "paints once for a Creative dye break and a block hit in the same tick". `tests/application/camp/paintTent.test.ts` "keeps the dye when it is the color the tent already shows"; `tests/packs/tent.test.ts` "keeps the item single-color: no variant and one item file". Scenario `tent_paint_events` also checks one plain returned item, but was not run here. Not verified: repainting with someone inside has no dedicated test identified; manual-test rows T28-T33, including occupied repaint T30 and plain return T31, have no owner result recorded.

### Roof tent paint event contract and routing

- Applies to: Roof tent entity hits and returned roof tent items.
- Rule: `roof_tent.se.json` exposes the sixteen `yasu_ride:paint_<paint>` events in `PAINTS` order through `minecraft:variant`; `roof_tent.rc.json` selects the corresponding fabric texture. Variant 0 is `ROOF_TENT_SPEC.defaultPaint` (khaki), restored by brown dye. The roof tent entity hit handler filters its own type and deduplicates each player's swing per tick, then routes a held dye to `PaintRoofTent` before `FoldRoofTent`. Painting never counts as a fold hit. One session-long `Repaint` preserves same-color and same-tick behavior, with no dye consumed in Creative. The Bedrock adapter triggers the shared paint event; `playPaintSound` plays `dye.use`. Folding and host removal return a fresh plain `yasu_ride:roof_tent_item`, losing the paint.
- Agreement: Proposed
- Basis: [0200](../adr/0200-roof-tent-as-a-host-bound-camp-entity.md) Decision, "Roof tent paint follows the shared palette and dye behavior of 0135"
- Implementation: `src/application/camp/paintRoofTent.ts`; `src/infrastructure/camp/bedrock/bedrockRoofTentWorld.ts`; `src/infrastructure/camp/bedrock/handlers/roofTentHits.ts`; `packs/yasu_ride_bp/entities/yasu_ride/roof_tent.se.json`; `packs/yasu_ride_rp/render_controllers/yasu_ride/roof_tent.rc.json`.
- Verification: `tests/infrastructure/camp/roofTent.test.ts` checks paint mapping and dye-first hit routing; `tests/packs/roofTent.test.ts` checks entity/render contracts. Client recoloring remains unverified.

### Beach parasol paint

- Applies to: Beach parasol entity hits and returned items.
- Rule: A dye hit after the per-player swing check repaints the canopy and never counts toward recovery, even when the color is unchanged. The shared dye mapping, Creative exemption, no-op, and tick memory apply. Variant 0 shows white; white dye restores the default. Taking back a painted parasol returns a plain item.
- Agreement: Proposed
- Basis: [0236](../adr/0236-a-beach-parasol-in-a-new-resort-gear-group.md) Decision and beach parasol design Paint.
- Implementation: `src/application/resort/paintParasol.ts`; `src/infrastructure/resort/bedrock/bedrockParasolPaintWorld.ts`; `src/infrastructure/resort/bedrock/handlers/hits.ts`; `src/domain/resort/spec.ts`.
- Verification: `tests/application/resort/paintParasol.test.ts` and `tests/infrastructure/resort/hits.test.ts` check repaint and hit routing. Scenario `parasol_paint` checks each paint event; in-game execution remains unverified.

## Open issues

Where an ADR and the implementation differ, this spec states the implementation and lists the difference here.

- ADR 0135 says only texture slots 0 and 1 are recolored; the implementation also recolors slot 16 (`seam`, the fly base at 0.6 brightness) so the ground tent's panel frames stay darker in every paint (`tools/gen_tent.py`, `FLY_SHADES`); the ADR needs an edit or a superseding ADR.
- ADR 0031, ADR 0037 (Context: "right after `triggerEvent(mycar:paint_<paint>)`"), and fully superseded ADR 0017 name `mycar:paint_<paint>`; the implementation uses `yasu_ride:paint_<paint>` (`src/infrastructure/shared/dyes.ts`, `paintEvent`); the ADRs need an edit or a superseding ADR. ADR 0036 describes the old interaction path in Context but does not itself name the old paint-event namespace.
- ADR 0031 says `tools/gen_model.py` writes one 64x16 texture per paint differing only in the body swatch, with sixteen textures of about 200 bytes each, 3.3 KB total; the implementation ships SUV 512x256 textures with per-paint `_mer` and texture sets, camper 114x188 textures, sports boat 128x32 textures with MER maps, bulldozer 32x1 textures, and tent 16x32 textures (`packs/yasu_ride_rp/textures/entity/yasu_ride/`), with paint regions defined by their generators; the ADR needs an edit or a superseding ADR. Proposed ADR 0192 supersedes that part for the SUV only.
- ADR 0037 says `PaintVehicle` remembers paints and the tick comes in the command; the implementation stores the memory in shared `Repaint` (`src/application/shared/repaint.ts`), and `PaintVehicleCommand` has no tick because `PaintVehicle` reads `Clock.now()` (`src/application/vehicle/paintVehicle.ts`); the ADR needs an edit or a superseding ADR.
- ADR 0031 says the next vehicle placed from the returned item is khaki again; the implementation uses variant 0's per-kind default, including black for the sports boat and yellow for the bulldozer (`src/domain/vehicle/kinds/sportsboat/profile.ts`, `src/domain/vehicle/kinds/bulldozer/profile.ts`, corresponding `.se.json` and `.rc.json` files); the ADR needs an edit or a superseding ADR consistent with 0076.
- ADR 0031 says the pack JSON is kept in order by hand and `tests/packs/paint.test.ts` checks it against `PAINTS`; the implementation's full event and rendering assertions in that file cover SUV and tent, while its texture-existence and default-paint comparison covers all five entities. Boat event contents are checked separately in `tests/packs/sportsboat.test.ts`; bulldozer tests check event existence and texture slots, and the camper controller test checks array length, leaving camper and bulldozer event contents without equivalent assertions (`tests/packs/bulldozer.test.ts`, `tests/packs/camper/glass.test.ts`); the ADR needs an edit or a superseding ADR.
- ADR 0036 says hit/interaction wiring is covered by the manual test only because in-game tests cannot simulate a player; the implementation also has mocked hit-routing tests (`tests/infrastructure/vehicle/bedrock/subscriptions.test.ts`, `tests/infrastructure/camp/handlers.test.ts`), while actual player gestures remain unverified here; the ADR needs an edit or a superseding ADR. Manual-test rows 15, 27, 28, camper C10, sports boat B5, and T28-T33 have empty result cells, so no owner result is recorded (`docs/manual-test.md`).
- No ADR records the `dye.use` sound played at the entity on each repaint (`src/infrastructure/vehicle/bedrock/bedrockPaintWorld.ts`, `src/infrastructure/camp/bedrock/bedrockTentPaintWorld.ts`); this behavior needs an ADR.
- ADR 0135 remains Proposed until manual checks T28-T33 pass (#523). Their result cells are empty (`docs/manual-test.md`); every rule citing 0135 remains Proposed. Its routing and vehicle-only paint-hint statements match the implementation; paint hints additionally require a dyeable kind (`src/infrastructure/camp/bedrock/handlers/tentHits.ts`, `src/domain/vehicle/hints.ts`, `src/infrastructure/vehicle/bedrock/bedrockHintWorld.ts`).
