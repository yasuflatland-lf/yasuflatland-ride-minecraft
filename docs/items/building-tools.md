# Building tools

The Building Tools group holds four items: Selection Wand with a crane icon, Blade Up/Down, Wide Blade, and Road Paver. Open the creative Items tab and scroll to the end to find it. Back to the [item groups](README.md).

| Item | Recipe | What it does |
|---|---|---|
| Selection Wand | Shapeless, a stick and a copper ingot | Tap or right-click to select and build on foot or while riding. Sneak and tap on air to open the utility menu. |
| Blade Up/Down | Shapeless, a lever and an iron ingot | Hold it while driving the bulldozer and use it (right-click on PC, long press on mobile) to raise or lower the blade; a held press switches once ([ADR 0138](../adr/0138-raise-and-lower-the-bulldozer-blade.md)). While you hold it, the cab monitor shows UP or DOWN for the blade ([ADR 0139](../adr/0139-show-the-held-tool-on-the-cab-monitor.md)). It keeps its `yasu_ride:blade_switch` ID. It does not turn on build mode. |
| Wide Blade | Shapeless, a lever and two iron ingots | Hold it while driving the bulldozer and use it to switch between the normal and the wide blade. The monitor shows NORM or WIDE; it cuts and rams twice as wide ([ADR 0180](../adr/0180-a-wide-bulldozer-blade.md)). |
| Road Paver | Shapeless, a lever, an iron ingot, and a cobblestone | Hold it while driving the bulldozer and use it to turn the paver on or off. The monitor shows OFF or ON; while on, the bulldozer lays the block in your selected slot behind it, and the block is not consumed ([ADR 0181](../adr/0181-a-road-paver-on-the-bulldozer.md)). |

The wand flow is recorded in [ADR 0198](../adr/0198-one-build-wand-without-a-bulldozer.md) and the [Build Wand design](../superpowers/specs/2026-10-31-build-wand-design.md).

## Build mode

Holding the wand enters build mode after a short grace delay; putting it away leaves after a short delay, so flicking through the hotbar does not toggle it. No bulldozer is required. Outlines and previews appear without changing the camera.

## Selecting and building

Tap or right-click a block to set point 1 and choose that block's material. A blinking marker surrounds it and the action bar names the material. Aim at a block or at air to preview the end point; in air it follows a vertical plane through point 1. Tap again to fix the end point and open the shape menu:

- A line offers Place.
- A rectangle offers Fill and Frame only; a horizontal rectangle also offers Gable roof and Hip roof.
- A box offers Fill, Faces only, and Walls only.

On the iPad a short tap on air sends nothing to the add-on, so every air action (an end point in the air, confirming a roof height while looking at the sky, the utility menu) needs a long press of about one second. A tap on a block works as usual.

Cancel returns to end-point selection. For a roof, aim to choose its height, tap to confirm, then choose Fill or Hollow. Roofs use full blocks of the selected material. Switching items after the grace delay cancels unfinished selection or paste aiming. A confirmed selection remains available for Copy until a new point 1 or Clear selection.

## Utility menu and paste

Sneak and tap or right-click on air to open the utility menu. It offers applicable Copy, Paste, Undo, and Clear selection actions. Copy needs a confirmed selection; Paste needs a clipboard. Choose Paste and set Skip air before aiming. The clipboard outline follows the aimed block; tap a block to place the clipboard minimum corner adjacent to the tapped face, with no rotation. A paste overlapping a protected place is refused as a whole.

Air in a copied selection replaces destination blocks unless Skip air is on. Kept blocks, such as chests and signs, are not copied; their destination cells remain untouched.

## What is never edited

Vehicles and their space, tents and their space, blocks laid by the add-on, containers, signs, hanging signs, spawners, vaults, command blocks, structure blocks, and jigsaws are kept by every edit.

## Limits

- An edit covers at most 100,000 blocks.
- A copy covers at most 32,768 blocks.
- Each player keeps the last 10 edits for Undo.
- Roof height is capped at 300 percent of the long side, world height, and the edit limit.

## Survival and reload

Building and pasting take no inventory blocks in any game mode, and undo gives none back. Selections, copied blocks, and undo history are kept only in memory, so they are lost on reload and when you leave the world.
