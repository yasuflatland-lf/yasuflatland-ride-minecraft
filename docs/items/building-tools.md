# Building tools

The Building Tools group holds the Selection Wand with a crane icon, the Paste Rotate, Paste Place, and Build Undo controls, the Blade Up/Down, Wide Blade, and Road Paver switches, the Warp Tool, and the Warp Block. Open the creative Items tab and scroll to the end to find it. Back to the [item groups](README.md).

| Icon                                                                 | Item           | Recipe                                                 | What it does                                                                                                                                                                                                                                                                                                                                                                                                                       |
| -------------------------------------------------------------------- | -------------- | ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ![Selection Wand](../images/items/building-tools/selection_wand.png) | Selection Wand | Shapeless, a stick and a copper ingot                  | Tap or right-click to select and build on foot or while riding. Sneak and tap on air to open the utility menu.                                                                                                                                                                                                                                                                                                                     |
| ![Paste Rotate](../images/items/building-tools/paste_rotate.png)     | Paste Rotate   | Shapeless, a stick and flint                           | Use it to rotate a fixed selection clockwise by 90 degrees or to turn the clipboard while aiming a paste.                                                                                                                                                                                                                                                                                                                          |
| ![Paste Place](../images/items/building-tools/paste_place.png)       | Paste Place    | Shapeless, a stick and a clay ball                     | Hold it while pasting and use it to place the clipboard at the aimed block, the same as sneaking and using the wand. It does not turn on build mode.                                                                                                                                                                                                                                                                               |
| ![Build Undo](../images/items/building-tools/build_undo.png)         | Build Undo     | Shapeless, a stick and a slime ball                    | Use it to undo the last edit without opening a menu. Paste aiming and the clipboard stay after the undo; with nothing to undo it says so on the action bar.                                                                                                                                                                                                                                                                        |
| ![Blade Up/Down](../images/items/building-tools/blade_switch.png)    | Blade Up/Down  | Shapeless, a lever and an iron ingot                   | Hold it while driving the bulldozer and use it (right-click on PC, long press on mobile) to raise or lower the blade; a held press switches once ([ADR 0138](../adr/0138-raise-and-lower-the-bulldozer-blade.md)). While you hold it, the cab monitor shows UP or DOWN for the blade ([ADR 0139](../adr/0139-show-the-held-tool-on-the-cab-monitor.md)). It keeps its `yasu_ride:blade_switch` ID. It does not turn on build mode. |
| ![Wide Blade](../images/items/building-tools/wide_blade_switch.png)  | Wide Blade     | Shapeless, a lever and two iron ingots                 | Hold it while driving the bulldozer and use it to switch between the normal and the wide blade. The monitor shows NORM or WIDE; it cuts and rams twice as wide ([ADR 0180](../adr/0180-a-wide-bulldozer-blade.md)).                                                                                                                                                                                                                |
| ![Road Paver](../images/items/building-tools/road_paver_switch.png)  | Road Paver     | Shapeless, a lever, an iron ingot, and a cobblestone   | Hold it while driving the bulldozer and use it to turn the paver on or off. The monitor shows OFF or ON; while on, the bulldozer lays the block in your selected slot behind it, and the block is not consumed ([ADR 0181](../adr/0181-a-road-paver-on-the-bulldozer.md)).                                                                                                                                                         |
| ![Warp Tool](../images/items/building-tools/warp_tool.png)           | Warp Tool      | Shapeless, a compass and a copper ingot                | Use it to open the list of warp points and teleport to one. The Warp Block, placed from the same group, registers a point and opens the same list when right-clicked ([ADR 0249](../adr/0249-shared-warp-points-with-a-block-and-a-tool.md)).                                                                                                                                                                                      |
| ![Warp Block](../images/items/building-tools/warp_block.png)         | Warp Block     | Shapeless, an ender pearl, an iron ingot, and redstone | Place it, name the point in the form that opens, and it registers a warp point. Right-click it to open the same list as the Warp Tool; sneaking and pressing it opens the name form. It cannot be mined: five hits in a row return the item and remove the point ([ADR 0249](../adr/0249-shared-warp-points-with-a-block-and-a-tool.md)). Its top is a radar-style scope and its sides are a dark panel with one ring.             |

The wand flow is recorded in [ADR 0198](../adr/0198-one-build-wand-without-a-bulldozer.md) and the Build Wand design.

## Build mode

Holding the wand enters build mode after a short grace delay; putting it away leaves after a short delay, so flicking through the hotbar does not toggle it. No bulldozer is required. Outlines and previews appear without changing the camera.

## Selecting and building

Tap or right-click a block to set point 1 and choose that block's material. A blinking marker surrounds it and the action bar names the material. Aim at a block or at air to preview the end point. In air the end point follows a vertical plane through point 1. Press the wand to fix the base. For a rectangle or box, aim to set the height and press again to fix it. A line is selected as soon as you fix the end point. With a fixed selection, press the wand to open the menu. Adjust height reopens live height aiming for rectangles and boxes.

- A line offers Place directly.
- Under Build shape, a vertical rectangle offers Fill and Frame.
- A horizontal rectangle offers Fill and Frame, and a box offers Fill, Faces only, and Walls only. Both also offer Gable roof, Hip roof, Cylinder, Sideways cylinder, Sphere, and Cube.

On iPad, a short tap on air sends nothing to the add-on. Air actions need a long press of about one second. A tap on a block works as usual.

Copy and Cut act immediately on the selected layers and enter paste aiming. A one-layer horizontal rectangle copies or cuts one layer. Cut empties the box and removes its animals and other entities without dropping items. [ADR 0203](../adr/0203-build-wand-paste-aiming.md)

For a roof, aim to choose its height from the lowest selected layer, press to confirm, then choose Fill or Hollow. Cylinder, Sideways cylinder, Sphere, and Cube open their contents menus at the selected height. Fill places every block in the shape. Hollow places a one-block shell. Cylinder, Sideways cylinder, and Cube also offer Tube, which leaves both ends open. Cancel from the contents menu returns to end-point selection. [ADR 0201](../adr/0201-build-wand-cylinder-and-cube.md)

After a build, its bounds stay selected and available for Copy. Build Undo restores the pre-build bounds while the build result is still selected. Paste Rotate turns a fixed selection in place, and Build Undo restores the previous blocks and box after each turn. [ADR 0245](../adr/0245-rotate-build-wand-boxes-with-the-engine-structure.md)

## Utility menu and paste

From idle, press the wand on air to open the utility menu for applicable Copy, Undo, and Clear selection actions. After Copy, aim at a block. The outline follows your aim and snaps to the ground under the clipboard footprint. Sneak and use the wand to paste, or use Paste Place. Repeat at another target as needed. [ADR 0203](../adr/0203-build-wand-paste-aiming.md)

While aiming a paste, a plain wand press opens New copy, End pasting, and Cancel. Use Build Undo to undo an edit from this mode. Ending paste, switching to an unrelated item, dying, or changing dimensions discards the clipboard. A protected overlap refuses the paste. Undo after a paste or cut restores the whole box, including chest contents and animals.

Copy takes everything in the box: blocks and air, chest and other container contents, sign text, item frames, paintings, and animals and other entities, but not players or this add-on's vehicles. A paste replaces the whole destination box, including chests already there, and removes the animals and other entities in it first. Copying a chest with items and pasting it duplicates those items ([ADR 0243](../adr/0243-copy-the-build-wand-box-as-an-engine-structure.md), Proposed).

## What is never edited

Vehicles and their space, tents and their space, and blocks laid by the add-on are kept by every edit; a paste or cut that overlaps them is refused as a whole. Shapes, roofs, Remove above, and Fill below also keep containers, signs, hanging signs, spawners, vaults, command blocks, structure blocks, and jigsaws. Paste and Cut do not: they replace or empty the whole box.

## Limits

- An edit covers at most 100,000 blocks.
- A copy or cut covers at most 32,768 blocks, and at most 64 blocks along X and Z.
- Each player keeps one history of up to 10 edits for Undo, shared across builds, pastes, cuts, and rotations.
- Roof height is capped at 300 percent of the long side and the world height. The edit limit is checked when you confirm the contents.

## Survival and reload

Building and pasting take no inventory blocks in any game mode, and undo gives none back. Selections, copied blocks, and undo history are kept only in memory, so they are lost on reload and when you leave the world.
