# 0120. Doored storage in the camper

- Status: Accepted
- Date: 2026-10-22
- Extends: 0114 (the wall cabinet becomes the first unit of doored storage)
- Applies: 0050 (per-unit parameters), 0055 (kind code), 0105 (one toggle per swing), 0108 (a pair block per furniture cell)

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

- A unit of storage with doors is a `DooredStorage` in `src/domain/vehicle/kinds/camper/furniture.ts`. It has:
  - `pairKind`: the `DecorPairEnd.kind` of its slots. Its compartments lay `<pairKind>_decor_pair`
  - its doors. Each door has an `id`, its `compartment` cell, the `plate` cell in the aisle where the open door stands, its `hinge` (1 at the compartment's front end, -1 at the rear end), and the compartment's two `slots` (end 0, then end 1)
  - `compartmentBlock`, which builds the compartment block from a look: face, open, height of the first slot, and the two items
  - `plateBlock`, which builds the open door's plate from a look: its face, and `lit` when the plate stands in a ceiling light's cell while the lights are on, so the plate gives that light (0115)
  - `plateBlockName`, the namespace-free name of the plate block, which a plate cell in the inside layers may hold on departure
- The blocks the units lay are the unions `StorageCompartmentBlock` and `StoragePlateBlock` in `furniture.ts`, next to the definitions. A new unit adds its block types there and to `DockBlock`
- The wall cabinet, `WALL_CABINET`, is the only definition. Its doors, cells, plates, hinges, slots, and blocks are the ones 0114 sets. Its plates are in the ceiling layer, so they are never lit. `CAMPER_STORAGE` lists the units in order, and `STORAGE_DOORS` lists their doors in the same order. The units' furniture rows come last in `CAMPER_FURNITURE`, in `CAMPER_STORAGE` order. So saved decor that loses its slot fills every open spot before any compartment (0103, 0114)
- `StorageDoorId` is the union of the door ids. Each id needs an entity property in `STORAGE_DOOR_PROPERTY` (`entity.ts`), or the code does not compile. The entity contract stays in `entity.ts` (0067)
- Every door swings in `CAMPER_SPEC.doorSwingTicks`, as in 0105. A unit gets its own timing only when it needs a different value (0050)

### Shared code

- `dooredStorage.ts` holds the code and no unit data:
  - `StorageDoors` keeps each door's target, swing step, tap window and synced value. It also restores the swing from the saved property, rounded and clamped, only for a docked camper. It swings the doors and sends their commands in door order, shuts every door on departure, and runs a press. A press does nothing within a swing of that door's last action. Otherwise, on an open compartment it takes an item out, and if no item comes out it toggles the door
  - pure queries: the door of a compartment cell, the open door whose plate is in a cell, and whether a slot can be used given the open doors
- The definitions are constant data, so a test checks them instead of the running code: door ids are unique, no two compartments or plates share a cell, none is on a furniture block, no plate covers a slot outside storage, every plate is in the ceiling layer or an inside layer, and each compartment holds ends 0 and 1 of its unit's pair kind, behind its door
- `doorSwing.ts` holds the swing helpers that the entry door, the shower door and `StorageDoors` share
- `room.ts` handles everything that depends on the pose:
  - `compartmentCells` (formerly `cabinetCells`)
  - the ceiling cell: no ceiling over a compartment, and an open door's plate under the ceiling
  - `storagePlateCells`: an open door's plate in the inside layers (layers 1 and 2), which the ceiling does not lay. The drive lays it after the compartments
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

- The fridge (#455) will be a second definition, listed after the wall cabinet in `CAMPER_STORAGE`. It brings its own:
  - door ids in `StorageDoorId`, and their entity properties in `STORAGE_DOOR_PROPERTY`
  - compartment and plate block types, added to `DockBlock` with their `sameBlock` cases, to the two storage block unions, and to the infrastructure's block mapping, plus a row in `faceHeight.ts`
  - pair kind in `StoragePairKind`, model, and pack files
  - `RENAMED_SLOTS` entries for the shelf slots it replaces
- Its plates in the aisle at layers 1 and 2 are laid, lit, checked on parking, and read on departure by the shared code above, with no change to it

## Consequences

- A new unit is a definition plus what only it can supply: its door ids and entity properties, its block types in the dock and the infrastructure, its pair kind, and its pack files. The swing, the toggle, the routing, the plates in any layer, the lit plate, the park check, the departure, and the restore come from the shared code
- A seeded trace of the room cells, slot choices, and drive steps came out byte-identical before and after the change. A reference-model test checks the cabinet doors over any press sequence, and property tests check the shared code with a test-only second unit shaped like the fridge
- The structure costs more code than the cabinet alone needed. If the camper never gets a second unit, this ADR can be revisited, but #455 is already planned
