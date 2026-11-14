# 0121. Doored storage in the camper

- Status: Accepted
- Date: 2026-10-22
- Extends: [0114](0114-open-the-camper-wall-cabinet.md): the wall cabinet becomes the first unit of doored storage
- Related: [0050](0050-vehicle-kinds-and-per-kind-profiles.md): per-unit parameters
- Related: [0055](0055-kind-neutral-vehicle-core.md): kind code
- Related: [0105](0105-toggle-a-camper-door-once-per-swing.md): one toggle per swing
- Related: [0108](0108-two-items-on-each-shelf-board-and-the-table.md): a pair block per furniture cell

## Context

The owner wants a fridge in the camper (#455). Like the wall cabinet (0114), it has doors that open on a press, and compartments that show, take and give their items only while their door is open. The first attempt added the fridge straight onto the cabinet code. That code had the wall cabinet built into it:

- `furniture.ts` listed the two cabinet doors in `CABINET_DOORS`, and the four cabinet slots as a hand-written furniture row
- `room.ts` checked for the cabinet by name: `pair === "cabinet"`, the block name `cabinet_decor_pair`, `cabinetCells`, and the cabinet door's plate in the ceiling layer
- `drive.ts` kept a map of cabinet door states and its own swing, toggle, restore and departure code for them
- The press went through `pressCabinet` in the core, the application, and the infrastructure

With this structure, every new unit adds a branch on the unit inside shared code, which 0050 forbids. The fridge attempt shows what a second unit needs:

- two doors hinged at the front, with compartments in the shelf cells (-1, 1) at layers 1 and 2, and plates in the aisle at (0, 1) in the same layers
- a compartment block that carries its height, and a plate block with its own type
- plates in the inside layers, which are not cargo, and which take the light cell of the front ceiling light

Issue #461 splits the work in two. This ADR covers the first step: rebuild "storage with doors" as a shared mechanism, with no change in behavior. The fridge comes later, on top of it.

## Decision

### A definition per unit

- A unit of storage with doors is a `DooredStorage` defined in `src/domain/vehicle/kinds/camper/dooredStorage.ts`, with unit data in `furniture.ts`. It has:
  - `pairKind`: the `DecorPairEnd.kind` of its slots. Its compartments lay `<pairKind>_decor_pair`
  - its doors. Each door has an `id`, its `compartment` cell, an `opening: StorageOpening`, and the compartment's `slots` (end 0, then end 1 for the existing pair compartments). An opening is either `hinged`, with a `hinge` (1 at the compartment's front end, -1 at the rear end) and the `plate` cell in the aisle where the swinging door stands, or `sliding`, a drawer with no hinge or plate
  - `compartmentBlock`, which builds the compartment block from a look: face, open, height of the first slot, and the two items
  - `plateBlock`, which builds the open door's plate from a look: its face, and `lit` when the plate stands in a ceiling light's cell while the lights are on, so the plate gives that light (0115)
  - `plateBlockName`, the namespace-free name of the plate block, which a plate cell in the inside layers may hold on departure
- The blocks the units lay are the unions `StorageCompartmentBlock` and `StoragePlateBlock` in `furniture.ts`, next to the definitions. A new unit adds its block types there and to `DockBlock`
- The wall cabinet, `WALL_CABINET`, and the fridge, `FRIDGE` (0123), are the shipped definitions, both with hinged openings. `KITCHEN_DRAWERS` is the shipped sliding definition with one item per drawer and a combined drawer/counter block. For the wall cabinet, its doors, cells, plates, hinges, slots, and blocks are the ones 0114 sets. Its plates are in the ceiling layer, so they are never lit. `CAMPER_STORAGE` lists the units in order, and `STORAGE_DOORS` lists their doors in the same order. The hinged units' furniture rows come last in `CAMPER_FURNITURE`, in `CAMPER_STORAGE` order. The drawers merge their slots into the counter row because their block also renders counter decor. Saved decor that loses its slot fills accepting slots in furniture order, with the drawer clearance allowlist still enforced (0103, 0114)
- `StorageDoorId` is the union of the door ids. Each shipped id needs an entity property in `STORAGE_DOOR_PROPERTY` (`entity.ts`). Both drawer ids map to their matching restored entity properties. The entity contract stays in `entity.ts` (0067)
- Every hinged or sliding opening shares opening progress from 0 to `DOOR_STEPS` in `CAMPER_SPEC.doorSwingTicks` (10 ticks), as in 0105. A unit gets its own timing only when it needs a different value (0050)

### Shared code

- `dooredStorage.ts` holds the code and no unit data:
  - `StorageDoors` keeps each opening's target, opening progress, tap window and synced value. It also restores opening progress from the saved property, rounded and clamped, only for a docked camper. Its `shown()` query includes every opening above step zero; hinged block contents use it, while entity drawer contents are independent of it. It advances opening progress and sends commands in door order, shuts every opening on departure, and runs a press. A press does nothing within the 10-tick window of that opening's last action. Otherwise, on an open compartment it takes an item out, and if no item comes out it toggles the door
  - pure queries: the door of a compartment cell (optionally selected by normalized pressed height), the open door whose plate is in a cell, and whether a slot can be used given the open doors
- The definitions are constant data, so a test checks them instead of the running code: door ids are unique, the shipped hinged compartments and plates have distinct cells, none is on a furniture block, no plate covers a slot outside storage, every plate is in the ceiling layer or an inside layer, and each compartment holds ends 0 and 1 of its unit's pair kind, behind its door
- `doorSwing.ts` holds kind-neutral opening progress (`stepOpening`, `DOOR_STEPS`, `restoredDoorStep`) shared by hinged and sliding openings. `swing` wraps that step for the entry and shower doors
- `room.ts` handles everything that depends on the pose:
  - `compartmentCells` (formerly `cabinetCells`)
  - the ceiling cell: no ceiling over a compartment, and an open door's plate under the ceiling
  - Sliding openings have no plate: `openPlateAt`, `storagePlateCells`, `storagePlateChecks` and plate press routing skip them. A sliding compartment still receives presses, and `cargoCells` excludes only actual plate cells
  - `storagePlateCells`: an open hinged door's plate in the inside layers (layers 1 and 2), which the ceiling does not lay. The drive lays it after the compartments
  - `storagePlateChecks`: the plate cells in the inside layers. `parkCheckCells` checks them, `cargoCells` leaves them out, and departure reads them with `ownPlateBlock`, which takes air or the door's own plate block, since departure shuts the door and the plate goes with it
  - `storagePressTarget`, which maps a pressed world cell to a door. It matches a plate cell whether or not the door is open. A press reaches it only from a block with the storage component. A shut door's plate cell holds the ceiling, air, or a player's block, except on the tick before the next lay takes its plate away, which falls within the door's swing window (0105)
  - `decorBlockName` and `furnitureCells` for compartment cells
  - `decorCells`, which leaves storage pair kinds to `compartmentCells`
- `ceilingLightCells` leaves out a light cell where an open door's plate stands, and that plate gives the light instead
- For the cabinet, all of this lays, checks, and reads nothing new: its plates are in the ceiling layer, which is neither an inside layer, cargo, nor a light cell. Tests check that the park check, the cargo, the lights, and the inside plates come out the same as with no storage at all
- Across the layers, the press is now a storage press: `StoragePress`, `Drive.pressStorage`, `Vehicle.pressStorage`, the `PressStorage` use case, and `registerStorage`. In `faceHeight.ts`, each storage pair kind gives the box of its compartment from a table

### What does not change

- The ids that the packs and saved worlds use stay the same:
  - the dock block types `cabinet` and `cabinetDoor`, which are saved with the laid cells
  - the blocks `yasu_ride:cabinet_decor_pair` and `yasu_ride:camper_cabinet_door`, and the component `yasu_ride:camper_cabinet`, which every unit shares
  - the properties `yasu_ride:cabinet_sink_door` and `yasu_ride:cabinet_stove_door`, and the slot ids `cabinet_*`
- No pack file changes, so the Resource Pack version stays the same (0015)

### The fridge

- The fridge model uses photo-based rounded cream doors, recessed bevelled panels and horizontal chrome levers toward the entry door (0123). Its hinges stay on the cab side, left from the aisle; the model refinement preserves the shared door swing, compartment cells, plates and decor slots

- The fridge (0123) is the second definition, listed after the wall cabinet in `CAMPER_STORAGE`. It brings its own:
  - door ids in `StorageDoorId`, and their entity properties in `STORAGE_DOOR_PROPERTY`
  - compartment and plate block types, added to `DockBlock` with their `sameBlock` cases, to the two storage block unions, and to the infrastructure's block mapping, plus a row in `faceHeight.ts`
  - pair kind in `StoragePairKind`, model, and pack files
  - `RENAMED_SLOTS` entries for the shelf slots it replaces
- Its plates in the aisle at layers 1 and 2 are laid, lit, checked on parking, and read on departure by the shared code above, with no change to it

### Kitchen drawers

- `KITCHEN_DRAWERS` holds two sliding openings without plates. Each has one usable slot, `drawer_top_0` or `drawer_bottom_0`, saved in `yasu_ride:decor` without renaming. The drawers have no ends in the pack block. Their slots and pair-end routing exist only in the domain and saved decor slots. The shared `StorageDoors` toggle, opening-window debounce, undocked restore and departure closing apply without a drawer branch; closing keeps contents.
- `DRAWER_GEAR_IDS` in the camper spec is an explicit allowlist of standing catalogue gear whose height is at most `DRAWER_INNER_HEIGHT_PX` (4.5). A test derives the expected set from `tools/camping_gear.json`. Drawer slots reuse `DecorSlot.items`; rejected and occupied placements use the existing no-slot refusal. A press selects that drawer alone, so refusal cannot send an item into the other drawer or onto the counter.
- As chosen by the #1681 probe (iPad touch measurements; PC not measured by owner decision), both doors share one counter cell, isolated by `DRAWER_COMPARTMENT` and `drawerAtHeight` in `furniture.ts`. Optional `acceptsPress` selects by corrected height within the cell; the split is the model's seam midpoint. The combined block has one selection box, so `drawerHit` first intersects the player eye ray with virtual front, stored-item and counter targets in `DRAWER_HIT_PROFILE`, selecting the nearest and correcting the pressed height. A front target toggles without returning contents; a content target permits return. Counter top presses retain their surface behavior and cannot fall back into a drawer in that cell. `PressStorage` carries the eye and an optional `takeContents` override; its ray result distinguishes front toggles from content presses, allowing a full drawer to close without returning its item. Held gear first uses `openOnly` to open a closed drawer, then reaches `PlaceDecor` when already open. Ordinary decor removal refuses rays resolving to a drawer, so a debounce echo cannot remove counter decor. Calls without a drawer ray retain existing cabinet/fridge behavior. Furniture rows and compartment laying deduplicate the shared cell. A compartment look can carry decor on an outside surface.
- One cell holds one block. The domain `drawers` block carries only face, height and optional counter decor; drawer items stay in saved decor slots and are selected through `drawerItemCommands`. The shipped `yasu_ride:drawers_decor_pair` block renders only counter decor, with `face` x `counter_page` x `counter_item` = 4 x 2 x 10 = 80 permutations. It has no drawer states or item bones. The former 11,520 permutations crashed an iPad running Minecraft 1.26.63; `fridge_decor_pair` at 6,400 is the largest measured working block. The pack-wide `blockStateBudget.test.ts` caps state products at 6,400 alongside the existing bit-budget test ([spec](../specs/camper-interior.md#sliding-kitchen-drawers)).
- Contents render on the camper through client-synced integer properties `drawer_top_item` and `drawer_bottom_item`: 0 empty, 1 through `DRAWER_GEAR_IDS.size` in allowlist order (currently 10). The drive derives these codes from saved decor and emits engine commands on change, initial load and resync, even while undocked. Departure and re-docking preserve the item codes. The camper has 17 properties within the engine limit of 32. `camper.geo.json` adds 2,002 gear cubes in a second geometry with the existing gear atlas's 512 x 512 dimensions and unchanged UVs. Its matching `root`, `body`, `drawer_top` and `drawer_bottom` skeleton receives the same animations as the main geometry. Item bones `drawer_top_item_<gear>` / `drawer_bottom_item_<gear>` are children of the corresponding drawer; the dedicated render controller selects them by property code. Contents sit on the closed box floors, slide throughout opening and closing, and are visible as the physical opening exposes them. There is no 10-tick visibility gate. The main geometry keeps its own atlas. Old saves load closed and empty; docked reloads restore opening progress and decor, while departure and undocked reloads close both drawers and preserve decor. Refuse a placement before consuming its item if the resulting saved decor JSON exceeds the dynamic property string limit. The #1681 probe on iPad touch measured one block event per front press on the counter cell, at heights on either side of the split; PC was not measured by owner decision. Virtual ray targets only refine delivered block events; an extended front or contents outside the selection box cannot receive a press through this resolver if the engine ray misses the block. The probe chose this shared cell over a two-cell fallback (one cell per drawer), which would replace only this layout and resolver, preserving both saved slot ids.

## Consequences

- A new unit is a definition plus what only it can supply: its door ids and entity properties, its block types in the dock and the infrastructure, its pair kind, and its pack files. The swing, the toggle, the routing, the plates in any layer, the lit plate, the park check, the departure, and the restore come from the shared code
- A seeded trace of the room cells, slot choices, and drive steps came out byte-identical before and after the change. A reference-model test checks the cabinet doors over any press sequence, and property tests check the shared code with a test-only second unit shaped like the fridge
- The structure costs more code than the cabinet alone needed. If the camper never gets a second unit, this ADR can be revisited, but #455 is already planned
