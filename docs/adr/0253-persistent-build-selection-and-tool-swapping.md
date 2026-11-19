# 0253. Persistent build selection and tool swapping

- Status: Proposed
- Acceptance condition: the Build Wand persistent selection series is finished and its device check passes
- Date: 2026-11-19
- Supersedes in part: [0229](0229-open-build-utilities-with-a-plain-air-press.md): the plain air press in idle opening the utility menu, replaced by a wand press opening the menu while a selection exists
- Supersedes in part: [0245](0245-rotate-build-wand-boxes-with-the-engine-structure.md): rotate mode and the Rotate box menu entry
- Extends: [0198](0198-one-build-wand-without-a-bulldozer.md)
- Related: [0230](0230-cut-a-selection-with-the-build-wand.md): Cut stays a menu entry

## Context

The original wand opened the shape menu when the player fixed the second point. To rotate a box, the player chose a menu entry and entered a mode that had to be finished before switching tools. The selection should instead remain available while the player switches between build tools, on both PC and touch devices.

The approved persistent selection design describes the intended interaction and the delivery series. The current implementation and build tools specification remain authoritative until the corresponding behavior changes are delivered.

## Decision

1. A selection is per-player session state independent of the held tool. Fixing the base and then its live height selects the box without opening a menu. With a selection, a wand press in air or on any block opens the menu; dismissing the menu keeps the selection. A block press does not start a new selection, and sneaking does not change this gesture.
2. The selection ends when the player chooses Cancel, or holds an item other than the wand, Paste Rotate, Paste Place or Build Undo for the existing leave grace period. Switching among those four items keeps it. Entering paste aiming through Copy or Cut drops the selection; Paste Rotate retains its existing role in paste aiming.
3. With a selection, each Paste Rotate press rotates the real blocks one clockwise horizontal quarter turn about the box center and selects the rotated box. Each successful turn records one undo entry; Undo restores the previous box. A refused turn keeps the selection. The center rule, size limits, union-box protection and snapshot rules of 0245 still apply. Rotate mode and the Rotate box menu entry are removed.
4. The menu offers Adjust height to return to live height selection. Copy and Cut use the selected box; Cut remains a menu entry and enters paste aiming. Remove above and Fill below use the horizontal extent and ignore height.
5. Cube, Cylinder, Sphere and Sideways cylinder fill the selected box without another height step. Gable and hip roofs retain their own height step, growing upward from the base layer and ignoring the selection's height. After building a shape, its built bounding box stays selected.

## Consequences

- Players can rotate a selection repeatedly and undo each turn without entering or finishing a separate mode. The session and press routing must retain the selection across tool switches, and Undo must restore the appropriate selection after rotation or shape building.
- Rotation still overwrites cells in the union of the old and new boxes under the safeguards in 0245. Other players' edits do not invalidate a player's selection.
- A rotation preview followed by a confirmation press was rejected because it doubles the presses; Undo covers an unwanted turn. Keeping the automatic menu and only allowing rotate mode to survive a tool switch was rejected because selecting would still open the unwanted menu.
- Check live height aiming, selected-block presses on touch, and rotation of a built cylinder on devices. Revisit the interaction if these checks show that the gestures or outline are unreliable or difficult to use.
