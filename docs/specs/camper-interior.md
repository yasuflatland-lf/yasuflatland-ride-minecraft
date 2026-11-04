# Camper interior

- Scope: The parked camper's furniture, bed and bunk, decor slots and gear placement and take-back, shower-toilet, toilet seat and standing up, entry and shower door taps, wall cabinet, fridge, and interior dashboard, stove, counter window, and hook.
- Verified at: 5ed1f579
- Source: [0092](../adr/0092-a-bed-in-the-parked-camper.md)
- Source: [0093](../adr/0093-decorate-the-parked-camper.md)
- Source: [0094](../adr/0094-the-camper-shower-toilet-door-and-shower.md)
- Source: [0095](../adr/0095-sit-on-the-camper-toilet-while-parked.md)
- Source: [0097](../adr/0097-press-the-camper-furniture-to-place-decor.md)
- Source: [0098](../adr/0098-a-block-for-the-camper-shower-toilet.md)
- Source: [0099](../adr/0099-hang-the-camper-planter-inside-its-cell.md)
- Source: [0100](../adr/0100-swap-the-camper-stove-and-sink.md)
- Source: [0102](../adr/0102-lift-the-hanging-planter-from-its-cell-bottom.md)
- Source: [0103](../adr/0103-raise-the-camper-wall-cabinet-to-the-ceiling.md)
- Source: [0105](../adr/0105-toggle-a-camper-door-once-per-swing.md)
- Source: [0106](../adr/0106-raise-the-camper-dashboard-to-the-windshield.md)
- Source: [0107](../adr/0107-stand-stove-gear-on-a-burner.md)
- Source: [0108](../adr/0108-two-items-on-each-shelf-board-and-the-table.md)
- Source: [0109](../adr/0109-stand-up-inside-the-parked-camper.md)
- Source: [0110](../adr/0110-pick-decor-slots-along-the-line-of-sight.md)
- Source: [0111](../adr/0111-correct-the-inverted-face-location-height.md)
- Source: [0112](../adr/0112-one-burner-on-the-camper-stove.md)
- Source: [0113](../adr/0113-a-window-over-the-camper-counter.md)
- Source: [0114](../adr/0114-open-the-camper-wall-cabinet.md)
- Source: [0118](../adr/0118-close-the-camper-shower-door-from-either-side.md)
- Source: [0121](../adr/0121-doored-storage-in-the-camper.md)
- Source: [0123](../adr/0123-a-fridge-in-place-of-the-camper-shelf.md)
- Source: [0182](../adr/0182-a-bunk-bed-in-the-parked-camper.md)
- Source: [0220](../adr/0220-separate-room-capability-from-drive.md)

## Rules

Room use cases obtain the required door, bed, shower, decor and storage methods from `Vehicle.asRoom()`, which returns `RoomDrive` or undefined. Unsupported vehicles retain false or undefined results and no effects; decor reads for pickup use an empty list (0220).

### Furniture table

- Applies to: The camper kind and its parked room.
- Rule: `CAMPER_FURNITURE` is the furniture table. Each row declares its kind, local cells and slots, and may declare a room block and a sleep spawn cell. A row with a block has no slots; each slot belongs to its row's cells. Room, parking and departure derive furniture occupancy from the table rather than naming individual furniture. Storage rows come last, in `CAMPER_STORAGE` order. Parking and the room shell belong to the camper specification; seat layout and departure riders belong to [Seats and driver selection](seats-and-driver.md).
- Agreement: Proposed
- Basis: [0093](../adr/0093-decorate-the-parked-camper.md) Decision / Furniture table, "The room, parking, and departure code read the table and never name a piece of furniture:"
- Basis: [0121](../adr/0121-doored-storage-in-the-camper.md) Decision / A definition per unit, "The units' furniture rows come last in `CAMPER_FURNITURE`, in `CAMPER_STORAGE` order."
- Basis: [0182](../adr/0182-a-bunk-bed-in-the-parked-camper.md) Decision, "a furniture row may carry an optional `spawn` cell"
- Implementation: `src/domain/vehicle/kinds/camper/furniture.ts`; `src/domain/vehicle/kinds/camper/dooredStorage.ts`; `src/domain/vehicle/kinds/camper/roomCells.ts`; `src/domain/vehicle/kinds/camper/decorCells.ts`; `src/domain/vehicle/kinds/camper/storagePlates.ts`; `src/domain/vehicle/kinds/camper/drive.ts`
- Verification: `tests/domain/vehicle/kinds/camper/furniture.test.ts` "keeps slots off furniture that lays a block", "gives each cell to at most one furniture row", and "keeps the saved slot ids, cells, and heights" check table invariants and current data. `tests/domain/vehicle/kinds/camper/dooredStorage.test.ts` "builds a unit's furniture row from its compartments and their ends, door by door" checks storage rows. Not verified: furniture appearance in game.

### Bed and bunk sleeping

- Applies to: A player interacting with a camper sleeping block.
- Rule: `yasu_ride:camper_bed` and `yasu_ride:camper_bunk` share the `yasu_ride:camper_bed` component. The lower bed has mattress-height collision and selection; the bunk has selection without collision, leaving the lower bed usable as a standing surface. Aim chooses the level. Owner lookup, `FindBedSpawnCell` and `RoomDrive.bedSpawnCell` through `Vehicle.asRoom()` (0220) obtain the sleepable furniture row's `spawn`: the lower bed uses its adjacent aisle cell, and the bunk the aisle cell farther back. Missing owner or answer falls back to the pressed cell. `SleepInBed` does nothing outside `SLEEP.dimension` (the Overworld); inside it sets spawn even during daytime, then sleeps only in the inclusive `SLEEP.nightStart` to `SLEEP.nightEnd` window. Sleeping fades the pressing player's camera using `SLEEP` timings and sets world time to `SLEEP.wakeTime` after `SLEEP.wakeDelayTicks`; otherwise it shows "You can sleep only at night". One player skips the night for everyone without reading the sleeping-percentage rule or clearing weather.
- Agreement: Proposed
- Basis: [0092](../adr/0092-a-bed-in-the-parked-camper.md) Decision, "Outside the overworld the bed does nothing"
- Basis: [0092](../adr/0092-a-bed-in-the-parked-camper.md) Decision, "One player's sleep skips the night for everyone."
- Basis: [0182](../adr/0182-a-bunk-bed-in-the-parked-camper.md) Decision, "Each spawn point is the `spawn` of its furniture row:"
- Implementation: `src/domain/vehicle/kinds/camper/furniture.ts`; `src/domain/vehicle/kinds/camper/roomCells.ts`; `src/application/vehicle/findBedSpawnCell.ts`; `src/infrastructure/vehicle/bedrock/subscriptions.ts`; `src/infrastructure/shared/bedBlock.ts`; `src/infrastructure/shared/bedrockBedWorld.ts`; `src/application/shared/sleepInBed.ts`; `src/domain/shared/sleep.ts`; `packs/yasu_ride_bp/blocks/yasu_ride/camper_bed.block.json`; `packs/yasu_ride_bp/blocks/yasu_ride/camper_bunk.block.json`
- Verification: `tests/domain/vehicle/kinds/camper/room.test.ts` "maps each level's cells to its own aisle cell on the floor" checks spawn lookup. `tests/application/shared/sleepInBed.test.ts` "sets the spawn point, then sleeps at night or explains why not in the overworld" and "does nothing outside the overworld" check the flow. `tests/packs/camperRoom.test.ts` "defines the upper bunk without collision, selectable over the bunk only" checks its box. `tests/infrastructure/shared/bedBlock.test.ts` "uses the resolved spawn cell or falls back when absent" checks fallback routing; `tests/infrastructure/shared/bedrockBedWorld.test.ts` "fades the screen and wakes up in the morning once it is black" checks mocked fade and timeout calls. Not verified: device respawn safety, fade, time change or phone aim between levels; fallback coordinates are read from code, not a recorded respawn check.

### Decor slots and accepting gear

- Applies to: Gear offered to the parked camper.
- Rule: `DECOR_SLOTS` flattens `CAMPER_FURNITURE`. Dashboard slots are `dashboard_center` and `dashboard_left`; table ends are `table` and `table_aisle`; dinette slots are `dinette_front` and `dinette_rear`; stove and counter use `stove` and `counter`; the hook uses `ceiling_hook`. Wall-cabinet ends are `cabinet_sink_rear`, `cabinet_sink_front`, `cabinet_stove_rear`, and `cabinet_stove_front`. Fridge ends are `fridge_bottom_rear`, `fridge_bottom_front`, `fridge_top_rear`, and `fridge_top_front`. Heights and offsets come from the table and `DECOR_SPOTS`. `slotsFor` rejects unknown gear, matches `HANGING_GEAR_IDS` against the slot's hanging flag, and excludes slots behind closed storage doors. Standing gear fits every available standing slot; the hanging planter fits the hook, whose slot lift brings the item's top to the cell top. The camping-gear specification owns the catalog, box, lore and inside/outside groups.
- Agreement: Proposed
- Basis: [0097](../adr/0097-press-the-camper-furniture-to-place-decor.md) Decision / Choosing the slot, "Per-item places are gone."
- Basis: [0102](../adr/0102-lift-the-hanging-planter-from-its-cell-bottom.md) Decision, "A slot says that it is for hanging items (`hanging` on `DecorSlot`)."
- Basis: [0112](../adr/0112-one-burner-on-the-camper-stove.md) Decision, "The stove has one decor slot, `stove`, at spot 0, the cell middle"
- Basis: [0123](../adr/0123-a-fridge-in-place-of-the-camper-shelf.md) Decision / The fridge is a doored storage unit, "slots `fridge_top_rear` and `fridge_top_front`"
- Basis: [0106](../adr/0106-raise-the-camper-dashboard-to-the-windshield.md) Decision, "The dashboard's cells move to layer 2:"
- Basis: [0108](../adr/0108-two-items-on-each-shelf-board-and-the-table.md) Decision / Slots, "The table gets two slots across the camper"
- Basis: [0114](../adr/0114-open-the-camper-wall-cabinet.md) Decision / Slots and presses, "The wall cabinet is a furniture row, listed last, with four slots"
- Implementation: `src/domain/vehicle/kinds/camper/furniture.ts`; `src/domain/vehicle/kinds/camper/decor.ts`; `src/domain/vehicle/kinds/camper/decorPlacing.ts`; `src/domain/vehicle/kinds/camper/campingGear.ts`
- Verification: `tests/domain/vehicle/kinds/camper/furniture.test.ts` "keeps the saved slot ids, cells, and heights" checks ids. `tests/domain/vehicle/kinds/camper/decorPlacing.test.ts` "accepts a standing item on every slot but the ceiling hook and a hanging item only on the hook" checks classes. `tests/packs/campingGear.test.ts` "lifts every hanging item to the top of the hook cell" checks lift. Not verified: placement and hanging appearance on devices.

### Furniture and individual decor block shapes

- Applies to: Empty non-storage slot cells and individual placed gear.
- Rule: An empty non-storage slot cell lays the invisible, collisionless, mining- and explosion-proof `yasu_ride:camper_furniture`, with no custom component. Its `yasu_ride:height` selects a full-width box from the cell bottom to the furniture top; the hook uses the special narrow hanging box at height state zero. Each gear item has a collisionless, unbreakable `<item>_decor` block with `yasu_ride:camper_decor`. Its `face`, `height` and `spot` states turn it with the camper and apply the slot lift and spot offset. Models start at their cell bottom and remain within a cell before transformation. Standing selection covers the cell width from item base to top, at least one pixel; hanging selection keeps the item footprint and rises with the model. Glass individual decor blends; other individual decor is opaque. Storage cells always lay their compartment blocks instead.
- Agreement: Accepted
- Basis: [0097](../adr/0097-press-the-camper-furniture-to-place-decor.md) Decision / The furniture block, "has no custom component"
- Basis: [0099](../adr/0099-hang-the-camper-planter-inside-its-cell.md) Decision, "Every camping gear block model stays within 0 to 16 px of its cell."
- Basis: [0102](../adr/0102-lift-the-hanging-planter-from-its-cell-bottom.md) Decision, "Every camping gear model starts at y = 0 and stays within 0 to 16 px of its cell."
- Basis: [0107](../adr/0107-stand-stove-gear-on-a-burner.md) Decision / The standing decor box, "A hanging item keeps its footprint box (0102)."
- Basis: [0114](../adr/0114-open-the-camper-wall-cabinet.md) Decision / The blocks, "Each compartment's cell, local (-1, -1) and (-1, -2) in layer 3, holds `yasu_ride:cabinet_decor_pair` while the camper is parked, full or empty"
- Implementation: `src/domain/vehicle/kinds/camper/decorCells.ts`; `packs/yasu_ride_bp/blocks/yasu_ride/camper_furniture.block.json`; `tools/gen_camping_gear.py`; `packs/yasu_ride_bp/blocks/yasu_ride/macrame_planter_decor.block.json`
- Verification: `tests/packs/camperRoom.test.ts` "defines a collisionless furniture block with one selection box per slot height" and "covers each slot's furniture top" check furniture. `tests/packs/campingGear.test.ts` "covers the whole cell with a standing item's selection box and only the footprint with a hanging item's" and "draws every slot's item at its spot for every face" check selection and transforms. `tests/packs/blockGeometry.test.ts` "keeps every selection box inside the cell" checks base boxes. Not verified: client outlines and presses through the hook toward the table.

### Choosing the slot for gear

- Applies to: A gear press on a camper block.
- Rule: `slotForPress` first selects the nearest free accepting slot in the pressed cell, then falls back to the nearest free accepting slot elsewhere. Nearness is measured where the descending line from the eye through the corrected hit point crosses each slot's horizontal plane; without an eye, or when the ray or plane does not descend below the eye, it uses the hit point. Ties keep slot order. A non-pair cell holds one item; table and compartment ends each hold their own item. The handler keeps reported x/z and corrects y with `pressedHeight` and `pressedShape`: known room Up/Down faces use box top/bottom, decor Up faces add their lift to inverted reported y, and remaining faces invert reported y. Pair lift comes from its height state or fixed slot height; storage shapes use their compartment boxes. The exact dinette-seat path is in [Seats and driver selection](seats-and-driver.md).
- Agreement: Accepted
- Basis: [0097](../adr/0097-press-the-camper-furniture-to-place-decor.md) Decision / Choosing the slot, "first tries the slot of the pressed cell"
- Basis: [0107](../adr/0107-stand-stove-gear-on-a-burner.md) Decision / Burner slots, "A cell holds one item."
- Basis: [0108](../adr/0108-two-items-on-each-shelf-board-and-the-table.md) Decision / Slots, "Its item is taken only by its own end:"
- Basis: [0110](../adr/0110-pick-decor-slots-along-the-line-of-sight.md) Decision, "For each candidate slot, the ray from the eye through the hit point is intersected with the horizontal plane at the height of that slot's point."
- Basis: [0111](../adr/0111-correct-the-inverted-face-location-height.md) Decision, "x and z are used as reported"
- Implementation: `src/domain/vehicle/kinds/camper/decorPlacing.ts`; `src/domain/vehicle/kinds/camper/decor.ts`; `src/infrastructure/vehicle/kinds/camper/handlers/decor.ts`; `src/infrastructure/vehicle/kinds/camper/faceHeight.ts`
- Verification: `tests/domain/vehicle/kinds/camper/decorPlacing.test.ts` "prefers the pressed cell's free slot nearest the hit point when it accepts the item", "picks the slot the line of sight is aimed at", and "measures from the pressed point as before when the line of sight does not descend" check choice. `tests/infrastructure/vehicle/kinds/camper/faceHeight.test.ts` "keeps each room block's box top and bottom in step with its block file" and "puts the logged Up-face presses on the table top and the floor top" check correction. Not verified: current PC side-face reporting; C111 in `docs/manual-test.md` has no owner check recorded.

### Placing gear

- Applies to: A recognized camping-gear block press owned by a parked camper.
- Rule: The decor before-event handler recognizes camper room blocks and decor/pair blocks, requires their dock-cell owner, cancels every repeat, and schedules `PlaceDecor` with `system.run` only for `isFirstEvent`. It passes the pressed cell, corrected point, eye and original hotbar slot. The use case rechecks the repository and slot, consumes one matching item outside Creative, places it, then saves decor. If no slot is offered it shows "No free spot for this item", keeps the item and saves nothing. Missing vehicles, failed consumption or refused placement return false; refusal after consumption has no refund in this use case. A deck-seat press uses `SeatPresses` and `CAMPER_SPEC.seatPressIdleTicks`, as specified in [Seats and driver selection](seats-and-driver.md).
- Agreement: Accepted
- Basis: [0093](../adr/0093-decorate-the-parked-camper.md) Decision / Placing and removing, "Decor is placed only in a parked camper."
- Basis: [0093](../adr/0093-decorate-the-parked-camper.md) Decision / Placing and removing, "Placing takes one item from the hand, except in Creative mode"
- Basis: [0097](../adr/0097-press-the-camper-furniture-to-place-decor.md) Decision / Choosing the slot, ""No free spot for this item" shows only when every slot of the item's kind is taken"
- Implementation: `src/infrastructure/vehicle/kinds/camper/handlers/decor.ts`; `src/application/vehicle/placeDecor.ts`; `src/domain/vehicle/kinds/camper/drive.ts`; `src/infrastructure/vehicle/bedrock/bedrockDecorWorld.ts`
- Verification: `tests/application/vehicle/placeDecor.test.ts` "places without taking the item in Creative", "shows the no-slot message, keeps the item, and saves nothing", "places and saves nothing when the hotbar slot no longer holds the item", and "saves nothing when the vehicle refuses the slot it offered" check outcomes. Not verified: first-event and repeat handling with real touch/PC input; handler timing is read from code, not a recorded device result.

### Taking decor back

- Applies to: Empty-hand decor presses and camper breakage.
- Rule: The `yasu_ride:camper_decor` component ignores held items and missing owners. `RemoveDecor` takes decor from the pressed cell, saves the remainder and gives the item to the player. For a table pair it chooses the held end nearest reported x/z, without an eye or y correction; absent face location takes the first held end. `BedrockDecorWorld` delegates delivery to `BedrockInventory`, which drops inventory overflow at the player's feet. Breaking the camper gives the hitter all saved decor, including stowed entries. Compartments never give items through `removeDecor`; only the storage press can take them.
- Agreement: Accepted
- Basis: [0093](../adr/0093-decorate-the-parked-camper.md) Decision / Placing and removing, "The item goes straight into the player's inventory, not dropped in the narrow room."
- Basis: [0107](../adr/0107-stand-stove-gear-on-a-burner.md) Decision / Burner slots, "An empty-hand press on the cell takes back the item of whichever of its slots holds one"
- Basis: [0108](../adr/0108-two-items-on-each-shelf-board-and-the-table.md) Decision / Pressing, "An empty-hand press on a pair block takes back the end nearest the pressed x and z"
- Basis: [0114](../adr/0114-open-the-camper-wall-cabinet.md) Decision / Slots and presses, "`removeDecor`, behind the decor blocks' component, never takes a cabinet item"
- Implementation: `src/infrastructure/vehicle/kinds/camper/handlers/decor.ts`; `src/application/vehicle/removeDecor.ts`; `src/application/vehicle/hitVehicle.ts`; `src/domain/vehicle/kinds/camper/drive.ts`; `src/infrastructure/vehicle/bedrock/bedrockDecorWorld.ts`; `src/infrastructure/vehicle/bedrock/bedrockInventory.ts`; `src/infrastructure/shared/players.ts`
- Verification: `tests/application/vehicle/removeDecor.test.ts` "takes back the end of the table nearest the pressed point" checks return; `tests/application/vehicle/hitVehicle.test.ts` "gives back stowed decor when the camper breaks" checks stowed items. `tests/infrastructure/vehicle/bedrock/bedrockDecorWorld.test.ts` "gives decor back as camping gear items" checks inventory delegation. Not verified: taking the visually intended table end on devices or overflow drops inside the camper.

### Saved decor on load

- Applies to: An aggregate rebuilt from saved decor.
- Rule: The `yasu_ride:decor` dynamic property holds serialized `{ slot, item }` entries. `parseDecor` rejects malformed data and keeps the first entry for a repeated saved slot. `currentGearId` filters unknown and removed ids; legacy `lava_lamp`, `oil_lamp` and `lantern` entries are discarded without return. `savedSlotId` maps removed stove burner ids to `stove`, and old shelf ends to matching fridge ends. Restoration first reserves all existing free slots in saved order, then processes displaced or unknown-slot entries in saved order, assigning the first free accepting slot with every storage door considered available. Storage rows follow exposed slots, so closed compartments are a fallback. If none accepts it, the entry stays stowed, unlaid and unreachable by presses, and returns on break. Restoration alone does not rewrite the property; the next decor change saves current entries.
- Agreement: Proposed
- Basis: [0093](../adr/0093-decorate-the-parked-camper.md) Decision / Saving and laying decor, "The camper entity saves its decor in the dynamic property `yasu_ride:decor`, a JSON array of `{ slot, item }`."
- Basis: [0103](../adr/0103-raise-the-camper-wall-cabinet-to-the-ceiling.md) Decision, "If none is free, the entry stays saved, unchanged, as stowed decor."
- Basis: [0112](../adr/0112-one-burner-on-the-camper-stove.md) Decision, "maps the three old ids to `stove` before restoring"
- Basis: [0114](../adr/0114-open-the-camper-wall-cabinet.md) Decision / Slots and presses, "Saved decor whose slot no longer exists may move into a cabinet compartment, shut or not"
- Basis: [0123](../adr/0123-a-fridge-in-place-of-the-camper-shelf.md) Decision / The fridge is a doored storage unit, "`shelf_low` loads as `fridge_bottom_rear`"
- Implementation: `src/domain/vehicle/dock/decor.ts`; `src/domain/vehicle/kinds/camper/decor.ts`; `src/domain/vehicle/kinds/camper/campingGear.ts`; `src/domain/vehicle/kinds/camper/drive.ts`; `src/infrastructure/vehicle/bedrock/bedrockDecorWorld.ts`; `src/infrastructure/vehicle/bedrock/identifiers.ts`; `src/infrastructure/vehicle/kinds/camper/identifiers.ts`
- Verification: `tests/domain/vehicle/kinds/camper/parking.test.ts` "restores saved decor and moves an entry of a removed slot", "stows an entry of a removed slot", and "loads decor saved on a removed stove burner slot onto the stove" check migration and stowing. `tests/domain/vehicle/kinds/camper/fridge.test.ts` "loads decor saved on the shelf boards at the same end of the fridge compartment" checks shelf migration. `tests/domain/vehicle/kinds/camper/campingGear.test.ts` "drops lava_lamp, oil_lamp and lantern" checks legacy ids. Not verified: upgrade migration in a player world; C157 has no owner check recorded. The seed ADRs do not establish legacy-id deletion; see Open issues.

### Leaving with decor

- Applies to: Departure checks for slots and inside storage plates.
- Rule: `ownSlotBlock` accepts only air, the furniture block, or the block named by `decorBlockName` for that cell: its own item decor, table pair, or storage compartment block. These comparisons use namespace-free suffixes. `ownPlateBlock` accepts air or the plate block suffix from that door's definition. Unexpected or unreadable cells keep the camper parked with its clear-cargo message. Decor survives departure and is laid again in the same slots on the next park, with storage shut.
- Agreement: Accepted
- Basis: [0097](../adr/0097-press-the-camper-furniture-to-place-decor.md) Decision / Departure, "A slot cell lets the camper leave while it holds air, the furniture block, or the decor block of the item in that slot."
- Basis: [0108](../adr/0108-two-items-on-each-shelf-board-and-the-table.md) Decision / Departure, saved decor, and the earlier build, "The departure check accepts, in a pair cell, air, the furniture block, or the pair block of that furniture"
- Basis: [0121](../adr/0121-doored-storage-in-the-camper.md) Decision / Shared code, "which takes air or the door's own plate block"
- Implementation: `src/domain/vehicle/kinds/camper/decorCells.ts`; `src/domain/vehicle/kinds/camper/storagePlates.ts`; `src/domain/vehicle/kinds/camper/drive.ts`
- Verification: `tests/domain/vehicle/kinds/camper/room.test.ts` "lets a slot cell hold only air, the furniture block, or the block its decor lays" checks allowed types. `tests/domain/vehicle/kinds/camper/dooredStorageDeparture.test.ts` "reads the inside plate cells between the slot and exit cells on departure" checks plates. `tests/domain/vehicle/kinds/camper/parking.test.ts` "keeps the decor through departure and lays it again on the next park" checks preservation. Not verified: departure with actual player-placed blocks and decor on devices.

### Table pair block

- Applies to: The table's wall and aisle ends.
- Rule: Both table items are drawn by one `yasu_ride:table_decor_pair` whenever either end holds decor; an empty table uses furniture. Its geometry has a bone per `STANDING_GEAR_IDS` item per end, offset to its `DECOR_SPOTS` end. `face` rotates it; permutations lift it by the table slot height without a height state. Each end encodes empty as zero and an item as its standing-catalog index plus one, split into page and item using `PAIR_PAGE_SIZE`. `bone_visibility` displays the encoded item only. Full-width selection spans both ends up to the tallest standing item. All pair faces are opaque, including sugar-pot glass. `shelf_decor_pair` remains defined for old laid blocks to be cleared, but no current slot lays it. Placement picks a free end along the corrected sight line; take-back uses the component press described above.
- Agreement: Proposed
- Basis: [0108](../adr/0108-two-items-on-each-shelf-board-and-the-table.md) Decision / The pair blocks, "`bone_visibility` shows `end<n>_<item>` exactly when"
- Basis: [0108](../adr/0108-two-items-on-each-shelf-board-and-the-table.md) Decision / The pair blocks, "Every face uses `*` with `opaque`, the sugar pot's glass too"
- Basis: [0108](../adr/0108-two-items-on-each-shelf-board-and-the-table.md) Decision / Pressing, "With one end taken, a press anywhere on the block sends the item to the other end"
- Basis: [0123](../adr/0123-a-fridge-in-place-of-the-camper-shelf.md) Decision / Blocks, "The shelf's pair block stays defined, with its old heights, though no slot lays it:"
- Implementation: `src/domain/vehicle/kinds/camper/decorCells.ts`; `src/domain/vehicle/kinds/camper/decor.ts`; `src/infrastructure/vehicle/kinds/camper/identifiers.ts`; `tools/gen_camping_gear.py`; `packs/yasu_ride_bp/blocks/yasu_ride/table_decor_pair.block.json`; `packs/yasu_ride_bp/blocks/yasu_ride/shelf_decor_pair.block.json`
- Verification: `tests/packs/campingGear.test.ts` "shows exactly the bone of the item that each end's states name" checks encoding and visibility, and "draws each end's item at its slot's spot" checks offsets and material. `tests/packs/blockGeometry.test.ts` "keeps both items of a pair block over its own cell in every permutation" checks geometry. Not verified: actual Molang visibility, glass appearance or end selection on devices.

### Shower-toilet block and press

- Applies to: Empty-hand presses on the parked shower doorway or rear-wall target.
- Rule: `yasu_ride:camper_shower_toilet` is an invisible, unbreakable, collisionless doorway selection plate facing the aisle. While the shower door target is open, rear-wall cells behind its open panel use `yasu_ride:camper_shower_door`, retaining wall collision and adding selection. Both share `yasu_ride:camper_shower_toilet`. Its handler ignores held items, looks up the owner and passes player feet to `PressShowerToilet`. The camper routes an open door or a press within its last swing window to the door toggle; with a shut door outside that window, feet outside the shower column open it, while feet inside run the shower. Gear presses are cancelled by the decor handler. The floor has no shower action.
- Agreement: Accepted
- Basis: [0098](../adr/0098-a-block-for-the-camper-shower-toilet.md) Decision, "A press with any item in hand does nothing to the door or the shower."
- Basis: [0098](../adr/0098-a-block-for-the-camper-shower-toilet.md) Decision, "The floor-tap path of 0094 is removed:"
- Basis: [0118](../adr/0118-close-the-camper-shower-door-from-either-side.md) Decision, "If the door is shut and the player's feet are inside the column, the shower runs"
- Implementation: `src/domain/vehicle/kinds/camper/roomCells.ts`; `src/domain/vehicle/kinds/camper/drive.ts`; `src/application/vehicle/pressShowerToilet.ts`; `src/infrastructure/vehicle/kinds/camper/handlers/showerToilet.ts`; `src/infrastructure/vehicle/kinds/camper/handlers/decor.ts`; `packs/yasu_ride_bp/blocks/yasu_ride/camper_shower_toilet.block.json`; `packs/yasu_ride_bp/blocks/yasu_ride/camper_shower_door.block.json`
- Verification: `tests/domain/vehicle/kinds/camper/showerToilet.test.ts` "closes an open shower door from either side, opens a shut one from outside" checks routing and echoes. `tests/packs/camperRoom.test.ts` "gives the shower-toilet no collision and a selectable 2 px plate on each face" and "makes the wall behind the open shower door the wall's plate, selectable on each face" check assets. Not verified: phone/PC presses at the model door's bottom or diagonal edge, or held-block behavior.

### Shower door and shower effects

- Applies to: Parked shower state and client effects.
- Rule: The client-synced `yasu_ride:shower_door` property swings the body-child `shower_door` bone into the aisle, hinged at its rear edge. `yasu_ride:shower` gates client spray at `shower_head` and the running-water loop; repeat timing comes from the shower animations. Starting or restarting the shower sets its timer to `CAMPER_SPEC.showerTicks`. Departure immediately shuts the door and stops the shower. Reload restores a docked camper's rounded, clamped door swing and infers its target at the swing midpoint; the shower timer starts off.
- Agreement: Accepted
- Basis: [0094](../adr/0094-the-camper-shower-toilet-door-and-shower.md) Decision, "The shower runs for `CAMPER_SPEC.showerTicks`"
- Basis: [0094](../adr/0094-the-camper-shower-toilet-door-and-shower.md) Decision, "The shower is not restored; it is off after a reload."
- Basis: [0094](../adr/0094-the-camper-shower-toilet-door-and-shower.md) Decision, "Departure shuts the shower door at once and stops the shower"
- Implementation: `src/domain/vehicle/kinds/camper/drive.ts`; `src/domain/vehicle/kinds/camper/entity.ts`; `src/domain/vehicle/kinds/camper/doorSwing.ts`; `packs/yasu_ride_bp/entities/yasu_ride/camper.se.json`; `packs/yasu_ride_rp/entity/yasu_ride/camper.ce.json`; `packs/yasu_ride_rp/animations/yasu_ride/camper.anim.json`; `tools/gen_camper.py`
- Verification: `tests/domain/vehicle/kinds/camper/parking.test.ts` "runs the shower for exactly showerTicks ticks and starts over on a new tap", "shuts the shower door and stops the shower on departure", and "restores the shower door's swing but not the shower after a reload" check state. `tests/packs/camper.test.ts` "rotates the shower door by its property and sprays at the shower head only while the shower runs" checks bindings and effect files. Not verified: client sound, spray and rendering in game, including Vibrant Visuals.

### One toggle per swing

- Applies to: Entry door, shower door and each storage door.
- Rule: Each door has its own `TapToggle` using `CAMPER_SPEC.doorSwingTicks`. The use case supplies its clock tick. A press inside the window does nothing and does not restart it; an admitted action restarts it. Storage item removal also consumes that door's action window, preventing an echo from taking another item or shutting the door. Shower running is not a toggle and may restart freely when door routing permits it. Windows live only in script memory, so reload permits the first action again.
- Agreement: Accepted
- Basis: [0105](../adr/0105-toggle-a-camper-door-once-per-swing.md) Decision, "The window runs from the last toggle, not from the last tap"
- Basis: [0105](../adr/0105-toggle-a-camper-door-once-per-swing.md) Decision, "The window is not saved."
- Basis: [0114](../adr/0114-open-the-camper-wall-cabinet.md) Decision / Slots and presses, "Each door keeps its own window"
- Implementation: `src/domain/shared/tapToggle.ts`; `src/domain/vehicle/kinds/camper/drive.ts`; `src/domain/vehicle/kinds/camper/dooredStorage.ts`; `src/domain/vehicle/kinds/camper/spec.ts`; `src/application/vehicle/useDockDoor.ts`; `src/application/vehicle/pressShowerToilet.ts`; `src/application/vehicle/pressStorage.ts`
- Verification: `tests/domain/vehicle/kinds/camper/parking.test.ts` "toggles each door once for two taps within a swing and twice for taps a swing apart" checks entry and shower windows. `tests/domain/vehicle/kinds/camper/cabinet.test.ts` "acts once for two presses within a swing and twice for presses a swing apart" checks storage echoes. Not verified: duplicate events from current touch clients in actual play.

### Toilet seat

- Applies to: The camper while parked.
- Rule: `CAMPER_PARKED_SEATS` adds the toilet as a compact deck seat after the vehicle seats. It is never a vehicle seat and its stick does not drive. `DeckSeats.keep` triggers `yasu_ride:compact` when spawning it, which gives the deck-seat entity the compact collision box set in the deck-seat asset. `DECK_SEAT_REACH` includes parked-seat positions. Departure rider handling is in [Seats and driver selection](seats-and-driver.md).
- Agreement: Accepted
- Basis: [0095](../adr/0095-sit-on-the-camper-toilet-while-parked.md) Decision, "A profile may list `parkedSeats`: seats that exist only as deck seats while the vehicle is parked"
- Basis: [0095](../adr/0095-sit-on-the-camper-toilet-while-parked.md) Decision, "`DECK_SEAT_REACH` covers every kind's seats and parked seats"
- Implementation: `src/domain/vehicle/kinds/camper/profile.ts`; `src/domain/vehicle/kinds/camper/roomCells.ts`; `src/infrastructure/vehicle/bedrock/deckSeats.ts`; `src/domain/vehicle/kinds/index.ts`; `packs/yasu_ride_bp/entities/yasu_ride/deck_seat.se.json`
- Verification: `tests/domain/vehicle/kinds/camper/parking.test.ts` "keeps the compact toilet seat while parked and ignores its stick" checks parked behavior. `tests/packs/deckSeat.test.ts` "shrinks only a compact seat's box to the toilet" and `tests/infrastructure/vehicle/bedrock/deckSeats.test.ts` "triggers the compact event once on each newly spawned compact seat only" check asset and spawn event. Not verified: phone/PC seating presses beside the shower doorway.

### Standing up inside

- Applies to: A rider leaving a kept camper deck seat while the camper stays parked.
- Rule: `DECK_SEAT_STAND_CELLS` supplies each `DeckSeatSpot.stand` on the aisle floor: behind the front seats, beside each dinette seat, and in front of the shower-toilet. `DeckSeats.keep` remembers riders in script memory and tries `standUp` only for a still-kept, valid seat with the same entity id and a stand point. The player must be valid, alive, in the seat's dimension, riding nothing, and within `STAND_UP_REACH`. Feet and head cells must be loaded and air, a light block, or an `isStandableRoomBlock` (currently the collisionless fridge plate). Success teleports with the player's view unchanged; failure keeps the engine's spot. Removed/replaced seats and the first keep after reload have no remembered dismount to move.
- Agreement: Proposed
- Basis: [0109](../adr/0109-stand-up-inside-the-parked-camper.md) Decision, "The remembered riders live in script memory only."
- Basis: [0109](../adr/0109-stand-up-inside-the-parked-camper.md) Decision, "a player who rode a deck seat that is still kept, is the same entity, and still has a `stand` point"
- Basis: [0123](../adr/0123-a-fridge-in-place-of-the-camper-shelf.md) Decision / Riders and presses, "`isStandableRoomBlock` names, only `yasu_ride:camper_fridge_door`"
- Implementation: `src/domain/vehicle/kinds/camper/roomCells.ts`; `src/infrastructure/vehicle/bedrock/deckSeats.ts`; `src/infrastructure/vehicle/bedrock/standUp.ts`; `src/infrastructure/vehicle/kinds/camper/identifiers.ts`
- Verification: `tests/infrastructure/vehicle/bedrock/deckSeats.test.ts` "stands up exactly the players who left a kept deck seat for nothing", "moves nobody after a reload, for a seat without a stand spot, or onto a replaced seat", and "leaves the engine's spot when the stand cells are blocked or the player is gone" check memory, guards, light blocks and fridge plates. Not verified: actual dismount flicker or device behavior; C92-C95 and C156 in `docs/manual-test.md` have no owner check recorded.

### Storage with doors

- Applies to: Shared cabinet and fridge behavior.
- Rule: Each `DooredStorage` defines its pair kind, ordered doors, compartment and plate cells, hinges, slots and block factories. `StorageDoors` keeps targets, swing steps, action windows and synced values per door. Compartments always lay pair blocks, empty or full; open targets lay door plates. Empty-hand presses go through `PressStorage`: an open door's plate shuts it, a shut compartment opens it, and an open compartment returns the end nearest pressed x/z or shuts when that end is empty. Without a point it chooses the first held end. Slot use follows `open()` (the target); visible items follow `shown()` (swing step above zero). Doors swing before cells are built. Item return saves decor and gives the item; a door-only action does neither. Departure shuts every door. Reload restores rounded, clamped swing only for a docked camper, inferring the target at the midpoint.
- Agreement: Accepted
- Basis: [0121](../adr/0121-doored-storage-in-the-camper.md) Decision / A definition per unit, "A unit of storage with doors is a `DooredStorage`"
- Basis: [0121](../adr/0121-doored-storage-in-the-camper.md) Decision / Shared code, "It also restores the swing from the saved property, rounded and clamped, only for a docked camper."
- Basis: [0114](../adr/0114-open-the-camper-wall-cabinet.md) Decision / Slots and presses, "When that end is empty, the door shuts"
- Implementation: `src/domain/vehicle/kinds/camper/dooredStorage.ts`; `src/domain/vehicle/kinds/camper/furniture.ts`; `src/domain/vehicle/kinds/camper/storagePlates.ts`; `src/domain/vehicle/kinds/camper/drive.ts`; `src/infrastructure/vehicle/kinds/camper/handlers/storage.ts`; `src/application/vehicle/pressStorage.ts`
- Verification: `tests/domain/vehicle/kinds/camper/dooredStorage.test.ts` "uses a slot behind a door only while that door is open", "restores each door's saved swing, rounded and clamped", and "routes a press on any compartment or plate cell to its own door" check shared behavior. `tests/domain/vehicle/kinds/camper/cabinet.test.ts` "takes back the item at the pressed end of an open compartment, and shuts the door from an empty end" checks outcomes. Not verified: client visibility during a swing and actual plate presses.

### Wall cabinet

- Applies to: The ceiling-layer storage over sink and stove.
- Rule: `WALL_CABINET` supplies door ids `sink` and `stove`, with `cabinet_*` end slots in the ceiling layer. The model spans `CABINET_Y`, meets `CEIL`, and clears the counter window, with its floor at `CABINET_SHELF`. Body-child door bones `cabinet_sink_door` and `cabinet_stove_door` hinge at opposite outer ends; matching client-synced properties rotate them in opposite directions into the aisle. `cabinet_decor_pair` uses face, end codes and open visibility; its fixed lift follows its slot height, with selection over the compartment and collision at the ceiling plate. `camper_cabinet_door` replaces the aisle ceiling cell while open, retaining ceiling collision and providing hinge-side plate selection. Both blocks use `yasu_ride:camper_cabinet`; taking items uses storage presses, not the decor component.
- Agreement: Accepted
- Basis: [0103](../adr/0103-raise-the-camper-wall-cabinet-to-the-ceiling.md) Decision, "with its top at the ceiling (`CEIL`, model y 61)"
- Basis: [0114](../adr/0114-open-the-camper-wall-cabinet.md) Decision / The model, "Each door is its own bone, a child of `body`:"
- Basis: [0114](../adr/0114-open-the-camper-wall-cabinet.md) Decision / The blocks, "Both blocks carry the custom component `yasu_ride:camper_cabinet`."
- Implementation: `src/domain/vehicle/kinds/camper/furniture.ts`; `src/domain/vehicle/kinds/camper/entity.ts`; `tools/gen_camper.py`; `tools/gen_camping_gear.py`; `packs/yasu_ride_bp/blocks/yasu_ride/cabinet_decor_pair.block.json`; `packs/yasu_ride_bp/blocks/yasu_ride/camper_cabinet_door.block.json`; `packs/yasu_ride_rp/animations/yasu_ride/camper.anim.json`
- Verification: `tests/packs/camper.test.ts` "hinges each wall cabinet door at the cabinet's outer end" checks swings, and "hangs the wall cabinet from the ceiling down to y 50" checks window clearance and spacing. `tests/packs/campingGear.test.ts` "defines the wall cabinet's compartment block as a pair block with a door state" checks boxes, lift and component. Not verified: lifted selection/collision and head clearance in actual play.

### Fridge

- Applies to: The doored storage behind the driver.
- Rule: `FRIDGE` replaces the shelf in the right-hand column behind the driver and follows `WALL_CABINET` in storage order. `fridge_bottom` and `fridge_top` define compartments and aisle plates in the matching inside layers; both hinge toward the cab. Properties are `yasu_ride:fridge_bottom_door` and `yasu_ride:fridge_top_door`. `fridge_decor_pair` carries slot height, face, open visibility and end codes, with no collision and selection from the lifted floor to the cell top. `camper_fridge_door` has full-height hinge-side plate selection without collision; its `lit` state supplies the front ceiling light when the top plate occupies that cell. Saved shelf ends rename to matching fridge ends. The cream model uses `FRIDGE_*` dimensions, a shorter top door, taller bottom door, chrome seam and handles, with body-child door bones turned by their properties.
- Agreement: Proposed
- Basis: [0123](../adr/0123-a-fridge-in-place-of-the-camper-shelf.md) Decision / The fridge is a doored storage unit, "listed after `WALL_CABINET` in `CAMPER_STORAGE`"
- Basis: [0123](../adr/0123-a-fridge-in-place-of-the-camper-shelf.md) Decision / Blocks, "Each compartment cell holds `yasu_ride:fridge_decor_pair` while the camper is parked, full or empty."
- Basis: [0123](../adr/0123-a-fridge-in-place-of-the-camper-shelf.md) Decision / The model, "Two doors, each its own bone and a child of `body`:"
- Implementation: `src/domain/vehicle/kinds/camper/furniture.ts`; `src/domain/vehicle/kinds/camper/decor.ts`; `src/domain/vehicle/kinds/camper/entity.ts`; `src/domain/vehicle/kinds/camper/storagePlates.ts`; `src/domain/vehicle/kinds/camper/roomCells.ts`; `tools/gen_camper.py`; `tools/gen_camping_gear.py`; `packs/yasu_ride_bp/blocks/yasu_ride/fridge_decor_pair.block.json`; `packs/yasu_ride_bp/blocks/yasu_ride/camper_fridge_door.block.json`; `packs/yasu_ride_rp/animations/yasu_ride/camper.anim.json`
- Verification: `tests/domain/vehicle/kinds/camper/fridge.test.ts` "lights the top door's plate in place of the front ceiling light" and "shuts both fridge doors on departure past their own plates" check lighting and departure. `tests/packs/camper.test.ts` "hinges both fridge doors at the fridge's front end on its aisle face" checks swings and heights. `tests/packs/campingGear.test.ts` "defines the fridge's compartment block as a pair block with its slots' heights and a door state" checks boxes. Not verified: BDS light emission, rendering, presses and migration on phone/PC; C152-C158 have no owner check recorded.

### Raised dashboard

- Applies to: Dashboard model and decor surfaces.
- Rule: The generator lifts the dashboard pad and its console, instruments, rear-face and top fittings by `DASH_RISE`, placing the pad just below the windshield frame. The body still reaches the floor; the steering wheel, pedals, engine cover and seats are separate geometry. Dashboard furniture and slots are in layer two, with heights from `CAMPER_FURNITURE`, so decor stands on the raised pad. The unused right dashboard cell lays no furniture block.
- Agreement: Accepted
- Basis: [0106](../adr/0106-raise-the-camper-dashboard-to-the-windshield.md) Decision, "The model lifts the dashboard and everything on its rear face and top by one constant, `DASH_RISE`"
- Basis: [0106](../adr/0106-raise-the-camper-dashboard-to-the-windshield.md) Decision, "The dashboard's right cell still gets none"
- Implementation: `tools/gen_camper.py`; `src/domain/vehicle/kinds/camper/furniture.ts`; `src/domain/vehicle/kinds/camper/decorCells.ts`; `packs/yasu_ride_rp/models/entity/yasu_ride/camper.geo.json`
- Verification: `tests/packs/camper.test.ts` "ends the steering column inside the raised dash body, below the console" checks column clearance, and "puts every standing decor slot but the stove's on the model's top surface at its spot" checks slot surfaces. Not verified: seated windshield view and dashboard presses from each seat or the aisle on devices.

### Sink and single-burner stove

- Applies to: The modeled right-hand kitchen and stove slot.
- Rule: The sink is in front of the stove; `STOVE_Z` bounds the cooktop behind it. The sink leaves the counter slot surface available. The steel range has chrome trim, a vent band, a leaning harvest control panel with one central knob, and an oven face and handle. One burner in the stove cell middle uses `BURNER_SCALE`; `stove` stands gear at its slot height above the grate. Obsolete burner offsets remain in `DECOR_SPOTS` and generated spot permutations to preserve old laid blocks until replacement, but no slot selects them.
- Agreement: Accepted
- Basis: [0100](../adr/0100-swap-the-camper-stove-and-sink.md) Decision, "The stove moves to cell (-1, -2, 1) and the counter with the sink to (-1, -1, 1)."
- Basis: [0112](../adr/0112-one-burner-on-the-camper-stove.md) Decision, "The other three are gone."
- Basis: [0112](../adr/0112-one-burner-on-the-camper-stove.md) Decision, "`DECOR_SPOTS` keeps entries 1 to 4"
- Implementation: `tools/gen_camper.py`; `src/domain/vehicle/kinds/camper/furniture.ts`; `tools/gen_camping_gear.py`; `packs/yasu_ride_rp/models/entity/yasu_ride/camper.geo.json`
- Verification: `tests/packs/camper.test.ts` "stands the stove slot on top of the grate of its one burner in the cell middle" checks the surface, and "keeps every body cube, rotated ones included, out of every standing item" checks stove and pair-slot clearance using sampled geometry points. Not verified: visual fidelity to the stove reference or device presses around it. The one-knob change lacks an explicit seed ADR decision (see Open issues).

### Counter window

- Applies to: The right-hand opening over sink and stove.
- Rule: `right_windows` includes the counter opening behind the entry door at `WIN_Y`. The shared loop builds its frame, glass, curtains and cuts in the shell and lining. The cabinet stays above it and the kitchen below it.
- Agreement: Accepted
- Basis: [0113](../adr/0113-a-window-over-the-camper-counter.md) Decision, "The right side gets a fourth side window"
- Basis: [0113](../adr/0113-a-window-over-the-camper-counter.md) Decision, "It gets what every other side window gets from the shared window loop:"
- Implementation: `tools/gen_camper.py`; `packs/yasu_ride_rp/models/entity/yasu_ride/camper.geo.json`
- Verification: `tests/packs/camper.test.ts` "hangs the wall cabinet from the ceiling down to y 50, over the counter window" checks cabinet separation. Not verified: an exact opening/frame/curtain regression specific to this window, the view outside from sink/stove, or device rendering; the loop behavior is read from the generator.

### Ceiling hook and planter connection

- Applies to: The body geometry over the table and hanging decor.
- Rule: The body bone draws a chrome base plate below the ceiling liner, ivory cord and small hook down to `HOOK_CELL_TOP`, the top of the hook slot's cell. None enters that cell. The planter model begins at its own cell bottom and its `ceiling_hook` slot lift meets this fixed hook. Cord and hook remain in the driving model without the parked decor.
- Agreement: Accepted
- Basis: [0099](../adr/0099-hang-the-camper-planter-inside-its-cell.md) Decision, "The camper model draws the rest of the hook as fixed geometry in the body bone:"
- Basis: [0099](../adr/0099-hang-the-camper-planter-inside-its-cell.md) Consequences, "The cord and the hook show while driving too, with nothing on them"
- Basis: [0102](../adr/0102-lift-the-hanging-planter-from-its-cell-bottom.md) Decision, "A hanging item is lifted to the hook by its slot's `yasu_ride:height`:"
- Implementation: `tools/gen_camper.py`; `src/domain/vehicle/kinds/camper/furniture.ts`; `tools/gen_camping_gear.py`; `packs/yasu_ride_rp/models/entity/yasu_ride/camper.geo.json`
- Verification: `tests/packs/camper.test.ts` "runs the ceiling hook from the ceiling plate to the top of its cell" checks continuity and no geometry below the cell top. `tests/packs/campingGear.test.ts` "starts the macrame planter at its cell bottom, with its outline over it" and "lifts every hanging item to the top of the hook cell" check model and lift. Not verified: knot/cord appearance and outline alignment on phone, PC or Vibrant Visuals.

## Open issues

- ADR 0093 says there are nineteen gear items, including an oil lamp and a lava lamp, each with places, and that the box gives one of each; the implementation has 17 items, no `places` field, and the box gives `CAMPING_GEAR_IDS` (`src/domain/vehicle/kinds/camper/campingGear.ts`, `tools/camping_gear.json`, `src/infrastructure/vehicle/bedrock/identifiers.ts`); the ADR needs an edit or a superseding ADR. The per-item places were superseded by 0097; catalog and box history belongs to the camping-gear spec. The player page `docs/vehicles/camper.md` also says the box unpacks 19 items.
- ADR 0092 says the room grows from 103 to 105 cells and departure reads 61 cargo cells; ADR 0093 and layout consequences in 0097, 0098, 0103, 0106, 0108, 0114, 0118 and 0123 retain intermediate room, cargo, slot and departure totals; the implementation derives current sets from furniture and storage with the bunk included, while the parking-check total still agrees (`src/domain/vehicle/kinds/camper/roomCells.ts`, `src/domain/vehicle/kinds/camper/storagePlates.ts`, `src/domain/vehicle/kinds/camper/groundCheck.ts`, `tests/domain/vehicle/kinds/camper/room.test.ts`); the ADRs need an edit or a superseding ADR. These are historical totals, not layout requirements; 0182 records the current room and cargo transition.
- ADR 0093 says the camper entity has 8 properties, ADR 0094 says 8, and ADR 0114 says 12 (ADR 0123 says 13); the implementation declares the current set in `CAMPER_ENTITY` and the pack asset, which also includes `ceiling_lights` (`src/domain/vehicle/kinds/camper/entity.ts`, `packs/yasu_ride_bp/entities/yasu_ride/camper.se.json`); the ADRs that state older totals need an edit or a superseding ADR.
- ADR 0093 says the bed is the first furniture row and a slot id never changes; the implementation lists dashboard first and supports explicit stove and shelf slot renames (`src/domain/vehicle/kinds/camper/furniture.ts`, `src/domain/vehicle/kinds/camper/decor.ts`); the ADR needs an edit or a superseding ADR. The renames are described in 0112 and Proposed 0123; saved ids remain migration keys.
- ADR 0097 says a standing item fits every standing slot (including both wall cabinet halves) and that the no-slot message shows only when every slot of the item's kind is taken; the implementation excludes slots behind a shut storage door, so the message also shows when only shut compartments are free (`src/domain/vehicle/kinds/camper/decorPlacing.ts` `slotsFor`); the ADR needs an edit or a superseding ADR. Storage gating comes from 0114 and 0121.
- ADR 0100 says the range has five knobs and that four burners surround a flat middle; the implementation draws one burner in the cell middle and one knob in the middle of the panel (`tools/gen_camper.py`, `burner`, the control panel comment); 0107 and 0112 supersede the burners but 0112 says the control panel stays and does not record the single knob; the ADR needs an edit or a superseding ADR.
- ADR 0107 says saved entries restore entry by entry, moving an unavailable entry immediately, and 0103 says an unknown slot moves in saved order to the first accepting free slot; the implementation reserves all existing free known slots first, then relocates homeless entries in saved order (`src/domain/vehicle/kinds/camper/drive.ts`, constructor); the ADRs need an edit or a superseding ADR. An unknown-slot entry before a later valid dashboard entry cannot displace that dashboard entry. Existing slots are reserved without checking standing/hanging compatibility; only relocated entries use `slotsFor`.
- ADR 0093 drops unknown-slot entries, and 0103/0114 preserve displaced current items without defining removed catalog ids; the implementation additionally drops legacy `lava_lamp`, `oil_lamp` and `lantern` through `currentGearId` (`src/domain/vehicle/kinds/camper/campingGear.ts`, `src/domain/vehicle/kinds/camper/drive.ts`); the ADRs need an edit or a superseding ADR. Later catalog decisions are outside this seed set and are not Basis here.
- ADR 0108 says its pair geometries have 36 bones and 142 cubes, from eighteen standing items and nineteen codes, with 6,080 combinations for the individual decor blocks; the implementation's `table_decor_pair.geo.json` has 32 bones and 122 cubes, from the 16 standing items of `STANDING_GEAR_IDS` (`packs/yasu_ride_rp/models/blocks/yasu_ride/table_decor_pair.geo.json`, `src/domain/vehicle/kinds/camper/campingGear.ts`, `tools/gen_camping_gear.py`); the ADR needs an edit or a superseding ADR.
- ADR 0109 says stand cells must hold air or a light block; the implementation also accepts `isStandableRoomBlock`, currently the fridge door plate (`src/infrastructure/vehicle/bedrock/standUp.ts`, `src/infrastructure/vehicle/kinds/camper/identifiers.ts`); the ADR needs an edit or a superseding ADR. Proposed 0123 describes this addition, so the standing-up rule cites it and has Proposed agreement.
- ADR 0121 says a `DooredStorage` is defined in `furniture.ts`; the implementation defines the type in `dooredStorage.ts` and keeps only the units `WALL_CABINET` and `FRIDGE` in `furniture.ts` (`src/domain/vehicle/kinds/camper/dooredStorage.ts`, `src/domain/vehicle/kinds/camper/furniture.ts`); the ADR needs an edit or a superseding ADR.
- ADR 0113 centers the counter window between the door and "the rear right window (z 38 to 50)"; the implementation has no window at that place, because `right_windows` holds the cab window, the window ahead of the door, the counter window and one small upper opening (`tools/gen_camper.py`); 0146 and 0157 extend 0113 but do not restate its window layout; the ADR needs an edit or a superseding ADR.
- The player page `docs/vehicles/camper.md` says an empty-hand press on the table takes back "the item nearest the point you look at"; the implementation uses the pressed x and z from the block's face location, without the eye (`src/infrastructure/vehicle/kinds/camper/handlers/decor.ts`, `src/domain/vehicle/kinds/camper/drive.ts` `removeDecor`); the player page needs a correction if the wording is meant literally.
- Proposed ADRs 0123 and 0182 both have the acceptance condition "owner decision pending (see #1193)"; every rule citing either is Proposed: `docs/adr/0123-a-fridge-in-place-of-the-camper-shelf.md`, `docs/adr/0182-a-bunk-bed-in-the-parked-camper.md`.

- The camper rows of `docs/manual-test.md` that cover these rules (C30, C40, C47, C55 to C57, C69, C79, C86 to C88, C92 to C95, C111, C131, C143, C145, C152 to C158) have empty result cells, and C196 (the driving bunk) says unverified; no owner check of the bed, bunk, decor presses, shower, toilet, stand-up, cabinet or fridge on a device is recorded: `docs/manual-test.md`.
