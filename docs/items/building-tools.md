# Building tools

The Building Tools group holds four items: Selection Wand with a crane icon, Blade Up/Down, Wide Blade, and Road Paver. Open the creative Items tab and scroll to the end to find it. Back to the [item groups](README.md).

| Item           | Recipe                                               | What it does                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Selection Wand | Shapeless, a stick and a copper ingot                | Tap or right-click to select and build on foot or while riding. Sneak and tap on air to open the utility menu.                                                                                                                                                                                                                                                                                                                     |
| Blade Up/Down  | Shapeless, a lever and an iron ingot                 | Hold it while driving the bulldozer and use it (right-click on PC, long press on mobile) to raise or lower the blade; a held press switches once ([ADR 0138](../adr/0138-raise-and-lower-the-bulldozer-blade.md)). While you hold it, the cab monitor shows UP or DOWN for the blade ([ADR 0139](../adr/0139-show-the-held-tool-on-the-cab-monitor.md)). It keeps its `yasu_ride:blade_switch` ID. It does not turn on build mode. |
| Wide Blade     | Shapeless, a lever and two iron ingots               | Hold it while driving the bulldozer and use it to switch between the normal and the wide blade. The monitor shows NORM or WIDE; it cuts and rams twice as wide ([ADR 0180](../adr/0180-a-wide-bulldozer-blade.md)).                                                                                                                                                                                                                |
| Road Paver     | Shapeless, a lever, an iron ingot, and a cobblestone | Hold it while driving the bulldozer and use it to turn the paver on or off. The monitor shows OFF or ON; while on, the bulldozer lays the block in your selected slot behind it, and the block is not consumed ([ADR 0181](../adr/0181-a-road-paver-on-the-bulldozer.md)).                                                                                                                                                         |

The wand flow is recorded in [ADR 0198](../adr/0198-one-build-wand-without-a-bulldozer.md) and the [Build Wand design](../superpowers/specs/2026-10-31-build-wand-design.md).

## Build mode

Holding the wand enters build mode after a short grace delay; putting it away leaves after a short delay, so flicking through the hotbar does not toggle it. No bulldozer is required. Outlines and previews appear without changing the camera.

## Selecting and building

Tap or right-click a block to set point 1 and choose that block's material. A blinking marker surrounds it and the action bar names the material. Aim at a block or at air to preview the end point; in air it follows a vertical plane through point 1. Tap again to fix the end point and open the shape menu:

- A line offers Place.
- A rectangle offers Fill and Frame; a horizontal rectangle also offers Gable roof, Hip roof, Cylinder, and Cube.
- A box offers Fill, Faces only, Walls only, and Cylinder.

On the iPad a short tap on air sends nothing to the add-on, so every air action (an end point in the air, confirming a roof height while looking at the sky, the utility menu) needs a long press of about one second. A tap on a block works as usual.

Every shape also offers Copy. On a horizontal rectangle, aim to choose the copy height and tap to copy; other shapes copy immediately. Copy enters paste aiming automatically ([ADR 0203](../adr/0203-build-wand-paste-aiming.md), Proposed).

Cancel returns to end-point selection. For a roof, aim to choose its height, tap to confirm, then choose Fill or Hollow. Roofs use full blocks of the selected material.

Cylinder and Cube grow upward from a horizontal rectangle: aim to choose the height and tap to confirm, as for a roof. On a box, Cylinder uses the box's own height and skips the height step. The cylinder fits exactly inside the rectangle (a non-square rectangle gives an ellipse) and the cube fills it. A contents menu then offers Fill (every block), Hollow (a one-block shell with the top and bottom closed), and Tube (the side wall only, top and bottom open); Cancel returns to end-point selection. Roofs offer Fill and Hollow only. See [ADR 0201](../adr/0201-build-wand-cylinder-and-cube.md). Switching items after the grace delay cancels unfinished selection or paste aiming. A confirmed selection remains available for Copy until a new point 1 or Clear selection.

## Utility menu and paste

In selection, sneak and use the wand on air for applicable Copy, Undo, and Clear selection actions. After Copy, aim at a solid block and use the wand to paste at its viewed face; repeat as needed. On iPad, use a long press of about one second; on PC, right click. A block tap never pastes. The outline follows the aim, and the action bar shows the clipboard size and count.

While pasting, use the wand on air without sneaking for Undo (when available), Skip air, New copy, and End pasting. Skip air starts off and persists until paste aiming is entered again. End pasting, switching items, death, or a dimension change discards the clipboard. Protected overlaps are refused, and each paste has one Undo entry. See [ADR 0203](../adr/0203-build-wand-paste-aiming.md) for the proposed interaction.

Air in a copied selection replaces destination blocks unless Skip air is on. Kept blocks, such as chests and signs, are not copied; their destination cells remain untouched.

## What is never edited

Vehicles and their space, tents and their space, blocks laid by the add-on, containers, signs, hanging signs, spawners, vaults, command blocks, structure blocks, and jigsaws are kept by every edit.

## Limits

- An edit covers at most 100,000 blocks.
- A copy covers at most 32,768 blocks.
- Each player keeps the last 10 edits for Undo.
- Roof height is capped at 300 percent of the long side, world height, and the edit limit. Cylinder and Cube heights are capped by the world height and the edit limit only.

## Survival and reload

Building and pasting take no inventory blocks in any game mode, and undo gives none back. Selections, copied blocks, and undo history are kept only in memory, so they are lost on reload and when you leave the world.
