# 0198. One Build Wand without a bulldozer

- Status: Proposed
- Date: 2026-10-31
- Supersedes in part: [0178](0178-bulldozer-build-tools-in-a-separate-namespace.md) (the bulldozer requirement in Decisions 3 and 4, the two items in Decisions 3, 8, and 13, the third-person build camera in Decision 5, and the hit and use mapping in Decision 8)
- Extends: [0183](0183-mark-a-lone-selection-corner.md) (the first-point marker) and [0137](0137-clear-block-columns-with-the-blade.md) (the kept block list)

## Context

The build tools of 0178 require a bulldozer and two items, leaving the player to switch among them and the building material. An iPad test in Creative while riding the bulldozer showed that a block tap fires `playerInteractWithBlock`, while a long press repeats `itemUse` and does not fire a block hit. The selected block follows the head view ray rather than the finger, and the third-person build camera obscures that target. The existing hit-to-pos1 mapping therefore cannot work on touch.

The owner wants one item for the whole build, usable on foot or on a bulldozer, on touch and PC, in Creative and Survival. The design is recorded in [the Build Wand spec](../superpowers/specs/2026-10-31-build-wand-design.md).

## Decision

1. Keep `yasu_build:selection_wand` as the Build Wand and give it the Build Tool's icon. Remove `yasu_build:build_tool`, its recipe, creative catalog entry, and lang keys. Remove Replace. The other Building Tools items are unchanged. Players holding the removed item lose it.
2. Holding the wand enters build mode after the existing grace delay; leaving it also has a grace delay. No bulldozer is required, whether on foot or riding. Build mode draws outlines and previews but does not change the camera, hide a vehicle, or show a HUD.
3. A block tap or right-click uses `playerInteractWithBlock`; an air tap or right-click uses `itemUse`. Debounce a held press, which can repeat `itemUse` every 0.2 seconds, so it counts once. Ignore left-click and long press as build inputs, and cancel block breaks while the wand is held.
4. The first block tapped is point 1 and its block type is the sole material for the build, even when it is terrain. Name the material in the action bar and show the blinking lone-corner marker of 0183.
5. With point 1 set, preview the end point and shape live. Aimed blocks give the end point; aiming at air gives a virtual point on the vertical plane through point 1 facing the player, snapped to the dominant horizontal look axis. Show outlines of the shape and end-point block. A second tap fixes the end point and opens the shape menu.
6. Derive the shape from the axes on which the points differ: one gives a line, two a rectangle, and three a box. Equal y makes a rectangle horizontal; otherwise it is a wall. Use stable `@minecraft/server-ui` ActionForms and offer only actions that apply: a line offers Place; a rectangle offers Fill and Frame only; a horizontal rectangle also offers Gable roof and Hip roof; a box offers Fill, Faces only, and Walls only. Each menu also offers Cancel, which returns to end-point selection and its preview.
7. Switching items after the grace delay cancels an in-progress selection before its end point is confirmed. A confirmed selection remains available for Copy until a new point 1 or Clear selection. Switching items also cancels paste aiming and other in-progress steps.
8. A horizontal rectangle can start a gable or hip roof. Aim to choose the apex on the vertical line through the rectangle's center, at the point nearest the view ray; preview the outline live and tap to confirm. If the ray is nearly parallel to the line, retain the last height. Cap the height at 300 percent of the long side, world height, and the 100,000-block edit limit. If aiming proves unusable, a slider form is the fallback.
9. A gable ridge runs along the long side. A hip roof slopes inward to a ridge on a rectangle or a point on a square. Use stepped full blocks of the selected material, not stairs. After height confirmation, offer Fill or Hollow, the latter a one-block shell. A flat roof is a horizontal rectangle filled normally.
10. Sneak and tap on air opens a utility ActionForm with only applicable entries: Copy when a selection exists, Paste when a clipboard exists, Undo, and Clear selection. Set Paste's Skip air toggle before aiming. Choosing Paste starts a live clipboard outline at the aimed block; a block tap fixes the anchor and pastes. There is no rotation, and a paste overlapping a protected cell is refused as a whole.
11. Keep the existing protections for vehicle and camp space, laid blocks, and kept blocks. Fill, hollow, roof, and paste take no inventory blocks, and undo returns none, in every game mode. An edit covers at most 100,000 blocks, a copy at most 32,768 blocks, and undo retains at most 10 edits per player. Selections, clipboards, and undo history remain in memory only.
12. Keep stable Script APIs, the existing layer and feature boundaries, and the `@minecraft/server-ui` 2.0.0 dependency. Put pure geometry in the build domain and view-ray reading, forms, and particles in build infrastructure. Add each user-facing step to the manual test, unverified until checked on the iPad.

## Consequences

A player can select, preview, build, copy, paste, undo, and clear with one wand without riding a bulldozer. The first block must be chosen carefully because it also selects the material. Existing Build Tool items disappear, and Replace is no longer available. The new flow needs live previews, shape and roof geometry, and touch verification; aiming at a roof apex may require the slider fallback. The current size limits and protections still bound edits, while inventory-free edits continue to permit duplication in Survival.
