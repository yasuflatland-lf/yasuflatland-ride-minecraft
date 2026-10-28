# 0178. Bulldozer build tools in a separate namespace

- Status: Proposed
- Date: 2026-10-29
- Extends: [0028](0028-third-person-camera-in-flight.md) (the rider's third-person camera), [0039](0039-vehicle-forms.md) (vehicle forms), [0047](0047-rename-to-yasuflatland-ride.md) (the `yasu_ride` namespace), [0052](0052-retry-camera-switches-and-break-seat-ties-low.md) (camera switching), [0136](0136-bulldozer.md) (the bulldozer kind), [0137](0137-clear-block-columns-with-the-blade.md) (the kept block list)

## Context

The owner wants WorldEdit-style selection and editing from the bulldozer's cab: mark a box of blocks, then fill, replace, copy, paste, and undo. WorldEdit-BE is GPL-3.0 and uses beta APIs, so this repository reimplements the behavior and ports no code. The README says this add-on holds only rides, but the feature is meant to move into its own add-on later, so several decisions below exist only to keep that split cheap.

## Decision

1. Add a feature `build` that holds the selection and edit tools, inside this add-on until it is split into its own add-on.
2. Every ID the feature defines uses `yasu_build:`: items, lang keys `item.yasu_build:<id>.name`, messages `yasu_build.message.<name>`, and the creative group `yasu_build:building_tools`. This is an exception to the `yasu_ride:` rule of 0047 and AGENTS.md, so a later split changes no ID. Pack files go under `<type>/yasu_build/` inside `yasu_ride_bp` and `yasu_ride_rp`.
3. Build mode is on while the player rides a `yasu_ride:bulldozer` and holds `yasu_build:selection_wand` or `yasu_build:build_tool`. It turns on after the item has been held for `BUILD_SPEC.modeEnterTicks` and off after `BUILD_SPEC.modeLeaveTicks` without it, so scrolling the hotbar does not flick the camera. Getting off turns it off at once.
4. Build reads "is the player riding a bulldozer" from the engine (`minecraft:riding`), with its own copy of the bulldozer's type id, not from the vehicle feature. This keeps working after the split.
5. The vehicle feature stays the only owner of a rider's camera (0028, 0039, 0052). It takes a `wantsChaseCamera(playerId)` function through bootstrap and puts a rider in its vehicle's chase camera (`far` for the bulldozer) whenever that returns true, as well as when the form asks for it. Build passes "is in build mode". After the split this becomes a player tag `yasu_build:mode` that the vehicle feature reads.
6. Edits never touch cells that `isVehicleSpace` or `isCampSpace` claims (passed in through bootstrap), blocks tagged `yasu_ride:laid`, or blocks that hold data: the kept list of 0137, moved to `domain/shared/keptBlocks.ts`, plus signs, hanging signs, spawners, vaults, command blocks, structure blocks, and jigsaws. After the split only the tag and the kept lists remain; the space checks are the one protection the split weakens.
7. Paste puts the clipboard at the same offset from the bulldozer's feet cell as at copy time, with no rotation. Air in the clipboard overwrites blocks unless the player picks "Skip air". A preview outline shows where a paste would land and moves with the bulldozer. A paste that overlaps a protected cell is refused as a whole.
8. pos1 is set on the first hit of a block (`entityHitBlock`) and the break is cancelled, so it is instant in Survival. pos2 is set by using the wand on a block.
9. Fill and paste take no blocks from the inventory, and undo gives none back, in every game mode. Copy and paste can therefore duplicate blocks outside the kept lists; the owner accepts this for a home LAN server.
10. Selections, clipboards, and undo history live in memory per player and are lost on reload or when the player leaves.
11. The Build Tool opens a form from `@minecraft/server-ui`, a stable module added as a manifest dependency at `2.0.0`.
12. The README's "this add-on holds only rides" is relaxed for this feature until the split.

## Consequences

Blocks can be duplicated in Survival. The vehicle feature gains one more bootstrap dependency. Protection is weaker after the split, because the vehicle and camp space checks no longer apply. The manifests gain a new dependency on `@minecraft/server-ui`. Revisit this decision when the feature moves to its own add-on, and replace the bootstrap function in rule 5 with the player tag.
