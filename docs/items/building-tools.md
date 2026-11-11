# Building tools

The Building Tools group holds four items: Selection Wand with a crane icon, Blade Up/Down, Wide Blade, and Road Paver. Open the creative Items tab and scroll to the end to find it. Back to the [item groups](README.md).

| Item           | Recipe                                               | What it does                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Selection Wand | Shapeless, a stick and a copper ingot                | Tap or right-click to select and build on foot or while riding. Sneak and tap on air to open the utility menu.                                                                                                                                                                                                                                                                                                                     |
| Blade Up/Down  | Shapeless, a lever and an iron ingot                 | Hold it while driving the bulldozer and use it (right-click on PC, long press on mobile) to raise or lower the blade; a held press switches once ([ADR 0138](../adr/0138-raise-and-lower-the-bulldozer-blade.md)). While you hold it, the cab monitor shows UP or DOWN for the blade ([ADR 0139](../adr/0139-show-the-held-tool-on-the-cab-monitor.md)). It keeps its `yasu_ride:blade_switch` ID. It does not turn on build mode. |
| Wide Blade     | Shapeless, a lever and two iron ingots               | Hold it while driving the bulldozer and use it to switch between the normal and the wide blade. The monitor shows NORM or WIDE; it cuts and rams twice as wide ([ADR 0180](../adr/0180-a-wide-bulldozer-blade.md)).                                                                                                                                                                                                                |
| Road Paver     | Shapeless, a lever, an iron ingot, and a cobblestone | Hold it while driving the bulldozer and use it to turn the paver on or off. The monitor shows OFF or ON; while on, the bulldozer lays the block in your selected slot behind it, and the block is not consumed ([ADR 0181](../adr/0181-a-road-paver-on-the-bulldozer.md)).                                                                                                                                                         |

The wand flow is recorded in [ADR 0198](../adr/0198-one-build-wand-without-a-bulldozer.md) and the Build Wand design.

## Build mode

Holding the wand enters build mode after a short grace delay; putting it away leaves after a short delay, so flicking through the hotbar does not toggle it. No bulldozer is required. Outlines and previews appear without changing the camera.

## Selecting and building

Tap or right-click a block to set point 1 and choose that block's material. A blinking marker surrounds it and the action bar names the material. Aim at a block or at air to preview the end point; in air it follows a vertical plane through point 1. Tap again to fix the end point and open the shape menu:

- A line offers Place.
- A rectangle offers Fill and Frame; a horizontal rectangle also offers Gable roof, Hip roof, Cylinder, and Cube.
- A box offers Fill, Faces only, Walls only, and Cylinder.

On the iPad a short tap on air sends nothing to the add-on, so every air action (an end point in the air, confirming a roof height while looking at the sky, the utility menu) needs a long press of about one second. A tap on a block works as usual.

Every shape also offers Copy and Cut. On a horizontal rectangle, aim to choose the height and tap to confirm; other shapes act immediately. Copy and Cut enter paste aiming automatically ([ADR 0203](../adr/0203-build-wand-paste-aiming.md), Proposed). Cut empties the box to air without dropping items and removes the animals and other entities in it.

Cancel returns to end-point selection. For a roof, aim to choose its height, tap to confirm, then choose Fill or Hollow. Roofs use full blocks of the selected material.

Cylinder and Cube grow upward from a horizontal rectangle: aim to choose the height and tap to confirm, as for a roof. On a box, Cylinder uses the box's own height and skips the height step. The cylinder fits exactly inside the rectangle (a non-square rectangle gives an ellipse) and the cube fills it. A contents menu then offers Fill (every block), Hollow (a one-block shell with the top and bottom closed), and Tube (the side wall only, top and bottom open); Cancel returns to end-point selection. Roofs offer Fill and Hollow only. See [ADR 0201](../adr/0201-build-wand-cylinder-and-cube.md). Switching items after the grace delay cancels unfinished selection or paste aiming. A confirmed selection remains available for Copy until a new point 1 or Clear selection.

## Utility menu and paste

In selection, sneak and use the wand on air for applicable Copy, Undo, and Clear selection actions. After Copy, aim at a solid block and use the wand to paste at its viewed face; repeat as needed. On iPad, use a long press of about one second; on PC, right click. A block tap never pastes. The outline follows the aim, and the action bar shows the clipboard size and count.

While pasting, use the wand on air without sneaking for Undo (when available), New copy, and End pasting. End pasting, switching items, death, or a dimension change discards the clipboard. Protected overlaps are refused. Undo after a paste or a cut restores the whole box as it was, including chest contents and animals; only the newest paste or cut can be undone this way. See [ADR 0203](../adr/0203-build-wand-paste-aiming.md) for the proposed interaction.

Copy takes everything in the box: blocks and air, chest and other container contents, sign text, item frames, paintings, and animals and other entities, but not players or this add-on's vehicles. A paste replaces the whole destination box, including chests already there, and removes the animals and other entities in it first. Copying a chest with items and pasting it duplicates those items ([ADR 0243](../adr/0243-copy-the-build-wand-box-as-an-engine-structure.md), Proposed).

## What is never edited

Vehicles and their space, tents and their space, and blocks laid by the add-on are kept by every edit; a paste or cut that overlaps them is refused as a whole. Shapes, roofs, Remove above, and Fill below also keep containers, signs, hanging signs, spawners, vaults, command blocks, structure blocks, and jigsaws. Paste and Cut do not: they replace or empty the whole box.

## Limits

- An edit covers at most 100,000 blocks.
- A copy or cut covers at most 32,768 blocks, and at most 64 blocks along X and Z.
- Each player keeps the last 10 shape and roof edits for Undo, plus the newest paste or cut.
- Roof height is capped at 300 percent of the long side, world height, and the edit limit. Cylinder and Cube heights are capped by the world height and the edit limit only.

## Survival and reload

Building and pasting take no inventory blocks in any game mode, and undo gives none back. Selections, copied blocks, and undo history are kept only in memory, so they are lost on reload and when you leave the world.
