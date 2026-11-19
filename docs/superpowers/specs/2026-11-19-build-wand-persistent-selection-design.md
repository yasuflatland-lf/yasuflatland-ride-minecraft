# Build Wand: persistent selection and tool swapping

Status: draft for owner approval. Not committed.

## Intent and why

Today, fixing the second point opens the shape menu at once, and every editing operation (Rotate box, Copy, Cut, shapes) hangs off that menu. A player who only wants to turn a selected building must open the menu, pick Rotate box, and then stay inside a modal rotate mode until they finish with sneak plus press.

The owner wants the selection to behave like an object the player is holding on to: select it by looking, swap to another build tool, and act on it at once. The menu becomes something the player opens on purpose. The goal is a better UI and UX for building on PC and mobile (touch).

## Goals

1. Selecting a range never opens a menu by itself.
2. Once a range is selected, holding Paste Rotate and pressing turns the selection a quarter turn, with no mode to enter or leave.
3. Pressing the wand opens the utility/shape menu. Closing it keeps the selection.
4. The player can change the selection's height after it is selected.
5. After a shape is built (cube, cylinder, sphere, roof and so on), the built volume stays selected, so the player can swap to Paste Rotate and turn it.
6. The selection ends only on explicit Cancel in the menu, or when the player holds anything other than the wand, Paste Rotate, Paste Place, or Build Undo.

## Non-goals and anti-goals

- No new Cut item. Cut stays in the wand menu: it is a one-shot operation that moves straight into paste aiming, unlike rotation, which is repeated on the same selection.
- No corner dragging or other way to reshape the base rectangle. To change it, Cancel and select again.
- No rotation preview or confirmation step. Undo already covers a wrong turn.
- Anti-goal: a selection that disappears while the player is merely switching between build tools, or one that survives forever after the player has moved on to other items.
- No change to paste aiming, continuous paste, copy storage, protections, or the edit-history depth.

## Current behavior this changes

(From `docs/specs/build-tools.md`; the implementation wins where they differ.)

- `endpoint` flow opens the shape menu when the endpoint is fixed by a second block tap or an air press.
- Height for horizontal rectangles is a separate "height step" started from a menu entry (roofs, solids, Copy, Cut, Rotate).
- Rotate box enters `rotateMode`: plain tap rotates, sneak plus tap finishes, and the mode ends when the wand is left.
- Paste Rotate only rotates the clipboard preview during `pasteAim` (`rotatePasteAim`).
- A block tap with a confirmed box starts a new point 1 and discards the box (`setPoint`).
- An air press in `idle` opens the utility menu (ADR 0229); during `point1` and `endpoint` an air press fixes a virtual end point.

## Design

### Selection lifecycle

```
idle
  -- tap block -----------------> point1
point1
  -- tap block / air press ------> base         (x,z extent fixed, y from the two points)
base (live height)
  -- look up/down ---------------> height follows the gaze, outline redraws
  -- press ----------------------> selected     (height fixed)
selected
  -- wand press (air or any block, in or out of the box) --> menu opens; selection kept
  -- Paste Rotate press ----------> box turns one quarter turn, one undo snapshot
  -- Build Undo press ------------> undo last edit
  -- menu: Adjust height ---------> base (live height) with the current selection, press fixes it
  -- menu: shape / Copy / Cut -----> operation runs (see below)
  -- menu: Cancel ----------------> idle
  -- hold any item other than wand, Paste Rotate, Paste Place, Build Undo,
     after the existing leave grace period ---------------> idle
```

- If the two points differ in y, the base already has a height; the live height stage then starts from that height, and gazing up or down changes the upper extent. A level gaze keeps one layer when the points share a y. (Builder decides the exact gaze-to-height mapping; reuse the existing layer-inclusive height aiming rule.)
- A press in `base (live height)` fixes the height and enters `selected`. Only this press does; no menu opens.
- Sneaking no longer changes what a press does in `selected`.

### What each held item does in `selected`

| Item           | Press                                                                                                                                                                                                                                                                       |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Selection Wand | Opens the menu (air, or any block in or out of the box).                                                                                                                                                                                                                    |
| Paste Rotate   | Rotates the real blocks of the selection one clockwise quarter turn about the box center, using the existing rotate-box use case (ADR 0245: union-box protection check, snapshot, size limits). The selection becomes the rotated box. Each turn records one history entry. |
| Build Undo     | Existing undo of the last edit; the selection follows the restored geometry if the last edit was a rotation, otherwise it is kept.                                                                                                                                          |
| Paste Place    | Does nothing unless a clipboard exists (unchanged).                                                                                                                                                                                                                         |

Paste Rotate keeps its current job when the flow is `pasteAim`.

### Menu

The menu is the existing endpoint root menu with these changes:

- Adds "Adjust height" first (hidden when the box is a line or when height does not apply to the operation).
- Removes "Rotate box" (replaced by the Paste Rotate item). The rotate mode and its sneak-finish gesture are retired.
- Cut, Remove above, Build shape, Copy, Fill below, Cancel keep their current behavior. Remove above and Fill below use the x and z extent only and ignore the height.
- Build shape's operations no longer start a separate height step for horizontal rectangles, because the selection already has a height. The shape is built into the selected box.
- After a shape is built, the selection becomes the bounding box of the built volume and the state is `selected`.
- Copy and Cut behave as today (a Cut ends in paste aiming). After the clipboard is spent or paste aiming ends, the flow returns to `idle`, as now.
- Closing the menu by dismissal keeps the selection and the state.

### Press routing

- Block interaction while the wand is held: in `idle` and `point1` it selects points; in `base` it only cancels the world interaction; in `selected` it opens the menu through the same deferred path as an item-use press.
- Item use: in `point1` an air press fixes a virtual end point; in `base` it fixes the height; in `selected` it opens the menu. The ADR 0229 idle air press stays.
- Existing per-player debounce windows stay; Paste Rotate in `selected` uses the existing rotate debounce.
- Held Paste Rotate, Paste Place and Build Undo keep the selection alive. The existing leave grace period decides when "holding something else" ends it.

### Examples

1. The player looks at a wall corner, taps it, looks at the opposite roof corner, taps it, raises their gaze until the outline covers the house, and presses. The house is selected and no menu appeared. They swap to Paste Rotate and press twice; the house turns 180 degrees. They press Build Undo once; it turns back 90 degrees.
2. The player selects a flat 9 by 9 area, presses the wand, chooses Build shape, then Cylinder, then Fill. The cylinder is built, and its bounding box stays selected. They swap to Paste Rotate and turn it.
3. The player selects a box, presses the wand to open the menu, and dismisses the menu. The outline is still there. They tap a block 20 blocks away; the menu opens again instead of starting a new selection.

## Approaches considered

1. Selection as tool-independent session state; each tool acts on it; Paste Rotate rotates immediately per press. (Chosen.) Matches the request fully; larger change to the flow state machine and press routing, and retires rotate mode.
2. Same as 1, but Paste Rotate shows a rotated outline first and a second press commits. Rejected by the owner's choice of 1: it doubles the presses, and Undo already covers mistakes.
3. Keep the auto-opening menu and only let rotate mode survive a tool swap. Rejected: it does not remove the unwanted menu.

## Constraints

- Stable Script API only (ADR 0001); layers and feature boundaries as in `AGENTS.md`; infrastructure owns forms, ray reads, particles.
- Quarter turns, size limits and protections stay as ADR 0245 defines them (max 64 per horizontal axis, `BUILD_SPEC.maxCopyVolume`, union-box `mayEdit`).
- Press debounce is required: a held press repeats `itemUse` every 4 to 6 ticks (ADR 0024).
- Resource Pack text changes (new "Adjust height" label, English and Japanese) need a manifest version bump.
- Update the affected ADRs (0198, 0229, 0245, and 0230 for the Cut menu position) and `docs/specs/build-tools.md` in the same change as each behavior.

## Delivery order

Four pull requests, each leaving the wand usable:

1. Selection persists in a `selected` state, no auto-menu, wand press opens the menu, Cancel and item-swap clear it.
2. Live height after the base, Adjust height in the menu, and removal of the height steps of box-filling shapes, Copy, Cut and Rotate (roofs keep theirs).
3. Paste Rotate rotates the selection; rotate mode and the Rotate box entry are removed.
4. Built shapes leave their bounding box selected.

## Left to the builder

- Exact gaze-to-height mapping and the outline particle layer for the live height stage.
- Naming of the new flow states and of the menu label.
- How Build Undo re-syncs the selection after undoing a rotation.
- Test and in-game scenario layout, including manual device rows.
- Whether the selection must also be dropped on death, dimension change and disconnect (assumed yes, as today).

## Open items for device checking

Gaze-driven height feel on PC and touch, whether touch short taps on a block in `selected` reach the menu, and rotation of a built cylinder inside its bounding box (blocks inside the box that are not part of the shape turn with it).

## Calls made after the builder check

- Entering `pasteAim` (Copy or Cut) drops the selection, as Copy and Cut already replace it. A clipboard without active paste aiming does not change what Paste Rotate does: it turns the selection.
- "Holding something else" reuses the existing leave grace period and its reset rules unchanged; the builder reads the current mode code for the exact values.
- A refused rotation keeps the selection and reports the existing refusal message. Box alignment follows the ADR 0245 center rule. Undo of a rotation restores the previous box; Undo of a shape build restores the box that was selected before the build.
- In `selected` the wand cancels the world interaction for every block (doors and chests included) and opens the menu, as the wand already cancels block interactions today.
- The selection is per player and is not invalidated by other players' edits.

## Owner decision: roof height

Roofs (gable, hip) keep their own height step: it ignores the selection's height and grows upward from the base layer, as today. Cube, Cylinder, Sphere and Sideways cylinder fill the selected box and start no height step. This replaces the earlier line that removes every separate height step; delivery PR 2 removes only the height steps of box-filling shapes, Copy, Cut and Rotate.
