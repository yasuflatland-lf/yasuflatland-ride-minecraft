# Build Wand: one item to select, shape, and fill

## Intent

The owner builds on an iPad (touch) and sometimes on PC. Today building needs two items, the Selection Wand and the Build Tool, a bulldozer to ride, and a hotbar that also holds the blocks to place. Switching between them is the main pain. The owner wants one item that takes a build from the first point to the placed blocks, with a one-gesture cancel, and no need to ride a bulldozer.

Owner test on an iPad (Creative, riding the bulldozer) showed that the current touch mapping cannot work: a tap on a block fires only `playerInteractWithBlock`; a long press fires only a repeated `itemUse` and never a block hit, so pos1 can never be set. The block a tap or press picks is the one on the player's head view ray, not where the finger is, and the third-person build camera hid which block that was.

## Goals

- One item, the Build Wand, does everything: select points, preview the shape, fill, make hollow shapes, make roofs, copy, paste, undo, clear.
- It works on foot and on a bulldozer, on touch and on PC, in Creative and Survival, with no bulldozer required.
- A new shape starts with one tap on a placed block and ends with one tap on the end point plus one menu choice.
- The shape follows from the two points. The player never picks "line", "wall" or "box" by name.
- The player always sees, before confirming, what will be built (a live particle outline).
- Cancel is one action.

## Non-goals

- Replace is dropped for good (owner's decision). The Build Tool is removed and its form is replaced by the menus below.
- No rotation of pasted blocks, no stair-block roofs, no curved shapes, no multiple materials in v1.
- No new JSON UI, no HUD icons, no camera changes, no hiding of any vehicle. Rendering stays as it is.
- No change to driving, the bulldozer blade, the road paver, or any vehicle.

## Anti-goals (failure even if it works)

- A flow that needs a hotbar slot for anything but the wand and the block to place.
- Anything that breaks or places a block by accident while the wand is held.
- Silent edits larger than the existing limits.
- An input that works on PC but not on the iPad.

## Decisions (made with the owner)

### Item and mode

1. The Build Tool (`yasu_build:build_tool`) is removed: the item, its recipe (iron ingot and chain), its creative catalog entry and its lang keys. The Selection Wand (`yasu_build:selection_wand`) stays and takes the Build Tool's current icon texture. Other items of the Building Tools group (Blade Up/Down, Wide Blade, Road Paver) are unchanged. Players holding the removed item lose it; the owner accepts that on a home LAN.
2. Using the wand no longer requires riding a bulldozer. All checks "rides a bulldozer" in the build feature are removed. Protection stays: edits never touch the cells and blocks the current rules keep (vehicle and camp space, laid blocks, kept blocks).
3. Build mode is "holding the wand", with the existing short grace delay on entering and leaving (a hotbar flick does not toggle it). It draws the particle outlines and previews. It no longer moves the camera, hides a vehicle, or shows a HUD.

### Material

4. One material per build, and it is the block type of the first point. The player places one block of the wanted type normally (with the hotbar), then switches to the wand and taps it. The action bar names the material when point 1 is set. (The first point's block is the rule; if it is terrain, the terrain block is the material. This is the owner-reviewed default; the owner may later ask for an explicit pick action.)

### Flow

5. Input mapping, the same on touch and PC:
   - Tap or right-click a block: `playerInteractWithBlock`. Tap or right-click on air: `itemUse`. Left-click and long press are not used for anything except being ignored; a held press repeats `itemUse` every 0.2 s and must count as one press (debounce).
   - The wand cancels every block break while held (`playerBreakBlock`), so nothing breaks by accident.
6. States: Idle, then Point 1 set, then End point set (menu open), then back to Idle after the action.
   - Idle, tap a block: point 1 is that block. A blinking particle marker surrounds it (the lone-corner marker of ADR 0183).
   - Point 1 set: a live preview follows the view. If the player aims at a block, the end point is that block. If the player aims at air, the end point is a virtual point on the vertical plane through point 1 that faces the player (axis snapped to the dominant horizontal look axis). The plane gives up/down and left/right; depth is set by aiming at a block. The preview is a particle outline of the box and of the end-point block.
   - Tap again: the end point is fixed and the menu opens.
7. The shape follows the number of axes on which the two points differ: three, a box; two, a flat rectangle (a vertical wall, or a horizontal plate when y is equal); one, a line.
8. The menu is a stable `@minecraft/server-ui` ActionForm, with only the entries that make sense:
   - Line: Place, Cancel.
   - Rectangle: Fill, Frame only (outline), Cancel. A horizontal rectangle also offers Gable roof and Hip roof.
   - Box: Fill, Faces only (hollow), Walls only (no floor or ceiling), Cancel.
   - Cancel returns to the end-point selection and the preview continues.
9. Cancel: switching to any other item (after the grace delay) cancels an in-progress selection (Point 1 set, before the end point is confirmed). A confirmed box stays as "the selection" for Copy until a new point 1 or Clear selection.
10. Utility menu: sneak and tap on air opens a second ActionForm: Copy (needs a selection), Paste (needs a clipboard, with the "Skip air" toggle), Undo, Clear selection. This replaces the old "sneak and use on air clears the selection" and the old Build Tool form. This placement is the designer's call, not decided by the owner.
11. Undo reverts the last of at most 10 edits per player, as today. Fill, hollow, roof and paste take no blocks from the inventory and undo gives none back, in every game mode.

### Roofs

12. A roof starts from a horizontal rectangle (y equal), chosen in the menu as Gable roof or Hip roof. The apex height is then chosen by aim: the apex is the point on the vertical line through the rectangle's center that is nearest to the view ray; the preview outline follows; a tap confirms. When the view ray is nearly parallel to that line, the height keeps its last value. The height is capped at 300 percent of the long side's length (owner's decision), at the world height, and by the 100,000-block limit. A slider form is the fallback if aiming proves unusable (forms cannot update a preview live, so it is a fallback only).
13. Gable roof: the ridge runs along the long side. Hip roof: the four edges slope inward and meet in a ridge on a rectangle, a point on a square. Slopes are stepped with full blocks of the material; stair blocks are out of scope. After the height, the menu asks Fill or Hollow (a one-block shell). A flat roof is just a horizontal rectangle Fill.

### Limits (unchanged)

14. An edit covers at most 100,000 blocks; a copy at most 32,768; Undo keeps 10 edits per player; selections, the clipboard and undo history live in memory only.

## Reference implementation

The owner's local checkout of WorldEdit-BE at `/Users/yasuflatland/projects/WorldEdit-BE` may be read as a reference while building this feature, for how it selects, previews, edits and undoes. WorldEdit-BE is GPL-3.0 and uses beta APIs (ADR 0178), so the reference is for behavior and ideas only: this repository ports no code, copies no source text, and keeps to the stable APIs (ADR 0001). A builder who reads it records in the pull request what was learned, not what was copied.

If following an idea from WorldEdit-BE would need a beta Script API, an experimental toggle, or `@minecraft/server-gametest`, the builder must stop and consult the owner before using it. The builder never adds a beta API on their own judgment, and never works around the missing API without asking. The owner decides whether to find a stable alternative, to change the design, or to grant an exception (which needs its own ADR).

## Constraints

- Stable Script APIs only (ADR 0001); `@minecraft/server-ui` stays at 2.0.0.
- The three layers and feature boundaries stay (ADR 0012, 0046). The pure geometry (shape from two points, roof shells, virtual point and apex from a view ray, particle outline points) belongs to `src/domain/build`, with property-based tests. The view-ray reading, forms and particles stay in `src/infrastructure/build`.
- Existing protections and the kept-blocks list stay (ADR 0137, 0178).
- Rendering and touch input are client side: every user-facing step needs a row in `docs/manual-test.md`, unverified until the owner checks it on the iPad.
- A new ADR records this redesign. It supersedes the parts of ADR 0178 that require a bulldozer, define two items, set the third-person build camera, and map hit and use to pos1 and pos2; the Accepted Decisions of earlier ADRs are not rewritten. English only; `pnpm lint:lang` applies.
- Repository rules in AGENTS.md apply: one issue per PR, refactor first when a mechanism is generalised, no coverage-only tests, no AI attribution in commits or PRs.

## Left to the builder

- The domain model: how to represent a selection (two points and a derived shape), the shape generators, and how the preview points are produced; the dimension rule (axes that differ) and the menu entries per shape.
- The exact debounce for a held press, the grace delay values, the particle styles and intervals (reuse `BUILD_SPEC`), and the action bar texts and lang keys.
- How to split the work into PRs and in what order, including the refactor of the build feature's input layer before the new flow.
- Where `Copy` takes its box when the player has a confirmed selection but moved on, and how Paste is anchored (see open points).
- Test strategy: property tests for the geometry, in-game scenarios through test hooks (the in-game tests have no real client).

## Menus follow the step (owner's decision)

The menu the player sees depends on the step the selection is in: after the end point it shows the shape entries for that shape; after a roof is chosen it asks for the height by aim and then Fill or Hollow; the utility menu shows only the entries that apply (Copy needs a selection, Paste needs a clipboard). A menu never lists an entry that cannot work now.

## Paste (owner's decision, with the designer's reading)

The anchor is a block the player aims at, not the bulldozer. The owner's description is: select the wand, click the target block, the particle outline starts, and the following clicks drive a menu that changes with the step. The designer's reading: Paste is chosen in the utility menu (sneak and tap on air). That puts the wand in a paste-aiming step: the clipboard's outline follows the aimed block live, and a tap on a block fixes the anchor and pastes (the "Skip air" toggle sits on the Paste entry of the utility menu, set before aiming). Cancel is switching items, as for every step. The paste is refused as a whole when it would overlap a protected cell, as today.

## Settled by the owner

- Replace is dropped for good.
- The utility menu opens with sneak and tap on air.
- The roof height cap is 300 percent of the long side.
- Paste uses an aimed anchor (see above).
