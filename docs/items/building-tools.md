# Building tools

Tools the bulldozer's driver uses to select and edit blocks, from the Building Tools group of the Items tab. Back to the [item groups](README.md).

| Item | Recipe | What it does |
|---|---|---|
| Selection Wand | Shapeless, a stick and a copper ingot | Hold it while driving the bulldozer. Hit a block (left-click on PC, tap on mobile) to set the first corner, pos1; the block is not broken, even in Survival. Use it on a block (right-click on PC, long press on mobile) to set the second corner, pos2. Sneak and use it while aiming at no block (at the air) to clear the selection; using it on a block sets pos2 even while sneaking. |
| Build Tool | Shapeless, an iron ingot and a chain | Hold it while driving the bulldozer and use it to open a form with Fill, Replace, Copy, Paste, Undo, and Clear selection. |

The design is recorded in [ADR 0178](../adr/0178-bulldozer-build-tools-in-a-separate-namespace.md).

## Build mode

Build mode is on while you ride a bulldozer and hold either tool. It turns on after you have held the tool for a moment and off a moment after you put it away, so flicking through the hotbar does not switch it. Getting off turns it off at once. In build mode the camera moves to the bulldozer's third-person view so you can see the whole selection.

## Selecting

The selection is the box between pos1 and pos2, drawn as an outline. Both corners are needed before any edit.

## Paste

Copy remembers the selection relative to the bulldozer's feet. Paste puts it back at the same offset from where the bulldozer stands now, with no rotation. A preview outline shows where the paste would land and moves with the bulldozer. A paste that would overlap a protected place is refused as a whole.

## Air

Air in a copied selection replaces the blocks it lands on, so a paste carves out the gaps. Turn on "Skip air" in the form to leave those blocks alone.

Kept blocks inside a copied selection, such as a chest or a sign, are not copied. A paste leaves whatever is at that spot untouched, so a pasted house has no chest or sign where the original had one.

## What is never edited

Vehicles and their space, tents and their space, blocks laid by the add-on, containers, signs, hanging signs, spawners, vaults, command blocks, structure blocks, and jigsaws are kept by every edit.

## Limits

- An edit (fill, replace, or paste) covers at most 100,000 blocks.
- A copy covers at most 32,768 blocks.
- Each player keeps the last 10 edits for Undo.

## Survival and reload

Nothing is consumed in Survival: fill and paste take no blocks from your inventory, and undo gives none back. Selections, the copied blocks, and the undo history are kept only in memory, so they are lost on reload and when you leave the world.
