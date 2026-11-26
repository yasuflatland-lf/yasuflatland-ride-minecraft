# 0262. Tap to place the Build Wand paste box and stair goal

- Status: Proposed
- Acceptance condition: Implement tap targeting and verify it on PC and iPad.
- Date: 2026-11-27
- Supersedes in part: [0203](0203-build-wand-paste-aiming.md): Decisions 2, 3, 5 and 10 on paste targeting, placement and orientation
- Supersedes in part: [0254](0254-build-wand-stairs-and-terrace.md): Decision 3's gaze goal

## Context

On iPad, dragging turns the camera, so its center ray can jump between near and far blocks. Paste aiming follows that ray, and its face-dependent corner (0203 Decision 10) makes the resulting box difficult to predict. Stair and Terrace goals also follow the ray. A block tap already reports the block under the finger through `playerInteractWithBlock` (0203 input spike table), and selection points are already chosen by tapping.

## Decision

1. **Target.** A Build Wand block tap sets the paste target in paste aiming and the stair or terrace goal in stair aiming. A PC right click on a block is the same tap. Neither flow follows the camera ray.
2. **Confirm.** Tapping a different block moves the target. Tapping the same block, in the same dimension and cell with the face ignored, confirms it: paste writes the world, and Stairs or Terrace opens its contents form. A confirm counts only after more than `BUILD_SPEC.tapConfirmQuietTicks` (8) ticks with no wand press event, so one held press cannot both set and confirm. Paste Place, a sneak air press in paste aiming, and a plain air press in stair aiming with a goal set also confirm the current target. With no target, these actions show a "tap where to place" message.
3. **Anchor.** The paste anchor is the X/Z corner of the copied box that held point 1, the first selection tap, turned with the box. It is on the box's bottom layer, in the cell next to the tapped face. Ground snapping then applies, and a white cube marks the snapped anchor corner. A copy with no taps uses the near-left corner as seen from the copy-time facing. This replaces the face-based growth of 0203 Decision 10; a side-face tap may give a box that covers the tapped wall.
4. **Facing.** Read paste facing once at the first tap after Copy, Cut, or a successful paste, and keep it across retaps. After that, only Paste Rotate turns the box; Paste Rotate turns made before the paste are kept.
5. **After paste.** A successful paste stays in paste aiming with no target and does not select the pasted box. Build Undo still undoes it and leaves paste aiming with no target.
6. **PC routing.** The block route wins over `itemUse` from the same click. A sneak right click on a block is a plain tap.

## Alternatives considered

- A box in front of the feet would require walking to align it and does not fit the stair goal.
- Place-then-nudge items allow precise adjustment but are slow and occupy hotbar slots.
- A touch crosshair is a player setting the add-on cannot force and still aims at the screen center.
- Short air taps send no event on iPad.
- Facing that keeps following the camera after a tap would turn a target while the player looks around.
- Selecting the pasted box after a paste would interrupt continuous paste aiming.

## Consequences

Targets remain fixed while the player looks around, and paste and stair aiming share a tap-and-confirm interaction. Players must be within block interaction reach; iPad reach still needs measurement. Ground snapping can move the anchor vertically, and a side-face placement can cover the tapped wall, so the preview must show the resulting box and anchor before confirmation. Editing a pasted box requires selecting it again. Device checks must verify event routing, held presses, and the interaction on PC and iPad before acceptance.
