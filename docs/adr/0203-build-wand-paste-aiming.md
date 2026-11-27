# 0203. Build Wand paste aiming

- Status: Proposed
- Acceptance condition: the input spike for the paste aiming event mapping is done and the owner reviews the open assumptions (#1114)
- Date: 2026-11-01
- Supersedes in part: [0202](0202-build-wand-copy-and-continuous-paste.md): Decision 8 originally specified the paste menu

## Context

The original paste interaction started from the utility menu, asked for Skip air before aiming, and pasted on a block tap. Copy enters paste aiming directly and a plain air press opens the paste menu. ADR 0262 specifies targeting by block tap. Paste Rotate, Paste Place and Build Undo are separate, always-available items alongside the wand. Touch input and the event mapping need an input spike before the interaction can be verified.

## Decision

Paste is a wand state (`pasteAim`) entered automatically, without a menu step. The paste outline has blue horizontal edges (`minecraft:blue_flame_particle`) and orange vertical edges (`minecraft:basic_flame_particle`), redrawn every `BUILD_SPEC.outlineInterval` (10) ticks. A white cube marks the snapped anchor corner. Orange flame is emissive for dark caves and complements the blue horizontal edges in daylight; device visibility remains unverified. Ground contact is dense: the bottom ring and the lowest block of each vertical edge use `BUILD_SPEC.denseOutlinePerBlock` samples per block. The top ring and upper vertical edges use one sample per block. The combined layers stay within `BUILD_SPEC.outlineMaxPoints`: upper vertical edges yield first, then the top ring, with proportional largest-remainder allocation within each tier. A one-block-tall box draws only the bottom ring.

1. **Entry.** Copy and Cut record the player's cardinal facing at the menu choice, including utility Copy of a confirmed box. The adapter uses horizontal view direction, then body yaw for vertical or unavailable view direction, then north when neither is available or the player is unknown or invalid. Completing Copy from the shape menu or utility menu stores the clipboard and immediately enters paste aiming while the player holds the wand. A copy exceeding `BUILD_SPEC.maxCopyVolume` (32,768 cells) is refused without changing the flow or previous clipboard.
2. **Outline.** A wand block tap fixes the target (ADR 0262). The cell adjacent to the tapped face holds the rotated point-1 corner. Each footprint column scans down from that initial minimum Y inclusively for at most `BUILD_SPEC.groundSearchDepth` (64) cells, fewer on footprints wider than 512 columns so one snap reads at most `BUILD_SPEC.groundProbeBudget` (32,768) cells, skipping air, liquids and replaceable cover (including grass, flowers, vines and snow layers). Unloaded or throwing cells make that column groundless. Ignore groundless columns; set the final minimum Y to the maximum ground Y plus one, preserving X/Z and size. The engine places the structure at the snapped box minimum. The outline reuses the last snap for an unchanged box and dimension for up to `BUILD_SPEC.groundCacheTicks` (20) ticks; a press always re-probes. If there is no tap or every column is groundless, the box stays hidden. The action bar shows clipboard size, block count, effective rotation and the placement hint on every outline interval. Paste Rotate refreshes the display immediately.
3. **Paste.** A plain accepted wand air press opens the paste menu. A deliberate retap of the same block, sneak air press or Paste Place press commits the stored target (ADR 0262). A commit without a target shows `pasteTapPosition`. With a clipboard in `idle` or `selected`, the first Place press starts aiming with no target and prompts for a block tap. Place during an unfinished selection or without a clipboard reports `pasteInactive`. Preview and commit both use `ResolvePasteTarget`, which snaps the stored target with `GroundProbe`. Commit re-probes and reports `noGround` if there is no ground. Wand block interactions claim both wand debounce windows before deferred processing so a paired PC `itemUse` is suppressed. Paste Rotate, Paste Place and Build Undo cancel block interaction and defer first events with `system.run`, rechecking the player and held control item. Block and item-use routes share each control's debounce. Paste Place and sneak wand presses share `BUILD_SPEC.pasteRepeatTicks`, and confirmation also requires the quiet gap from ADR 0262. Outside paste aiming, Paste Rotate turns a fixed selection in place.
4. **Menu.** A plain press opens a menu in this order: New copy, End pasting, Cancel, regardless of history. Undo is available through the Build Undo item, not this menu. Cancel and dismissal keep paste aiming. Undo of a paste clears the target during paste aiming and keeps the clipboard. ADR 0202 Decision 9 describes when it resumes aiming from a selection. One press of Build Undo invokes the same use case directly in any flow and never opens a menu. Its first block interaction is canceled and schedules the press with `system.run`, re-checking the player and held control item; `itemUse` shares the same per-player undo debounce using `BUILD_SPEC.pasteRepeatTicks`. Busy, empty-history, success, partial, blocked and failed feedback use the existing action-bar messages. With no session, it reports `nothingToUndo` without creating one.
5. **End.** End pasting, holding none of the wand, either paste control item, or undo for `modeLeaveTicks` (6), death, and a dimension change end paste aiming and discard the clipboard and confirmed box. Successful placement keeps paste aiming and the clipboard, and clears the tap and locked facing (ADR 0262).
6. **New copy.** New copy returns to normal selection (`idle`): select the start and end points, confirm live height for a rectangle or box, then open the selection menu and choose Copy. The old clipboard remains until a successful copy replaces it and automatically starts paste aiming. No paste outline or mode line appears during selection. A refused oversized copy, Clear selection, or shape-menu cancel keeps the old clipboard and stays in selection. Switching items, death, or a dimension change before completion discards the clipboard.
7. **Refusal and history.** Paste preflights protection across the entire target (`pasteBlocked`), then checks for a running edit (`busy`). Either refusal keeps the player aiming. A successful placement records one undo snapshot (ADR 0202).
8. **Mode display.** `BuildFeedback.showMode` shows paste-ready dimensions, block count and effective rotation in degrees (0, 90, 180 or 270). The paste-ready mode says "Paste ready %sx%sx%s (%s blocks) | Rotation %s° | Tap a block to choose where to paste" and adds a "[Sneaking]" prefix while the player is sneaking. Skip air is removed by ADR 0243: paste replaces the whole box, including air.
9. **Removed.** Remove Paste and Stop pasting from the utility menu, the pre-paste Skip air form. The normal selection utility menu keeps Copy of the confirmed box, Undo, and Clear selection.

10. **Orientation.** The first tap locks the player's cardinal facing until paste succeeds or aiming ends (ADR 0262). The facing-derived turn is `turnBetween(clipboard.facing, flow.facing ?? clipboard.facing)` in north/east/south/west order. Paste Rotate adds one clockwise quarter turn without world writes. The effective turn is the facing-derived turn plus `manualTurn` modulo four. Odd turns swap X and Z, and the rotated point-1 corner stays at the X/Z position of the cell adjacent to the tapped face. Rotation keeps the locked facing and uses `BUILD_SPEC.rotateDebounceTicks` (7), shared with selected-box rotation. Each completed Copy or Cut starts the manual turn at zero, and a paste keeps the manual turn for the next target.

## Alternatives considered

- **Rotate entries in the paste menu.** These require reopening a form for frequent orientation changes. A separate rotate item keeps New copy, End pasting and Cancel in the menu.
- **Tap-count gestures on one wand.** Double or triple taps need a delay window and can conflict with other gestures; a short iPad tap on air sends no event, so it cannot reliably produce them. Separate items also allow paste without Sneak, which descends during Creative flight.
- **Tap Paste Place again to undo.** A placement control and an undo control keep those actions independent.
- **Confirm after every paste.** A separate confirmation after placement would interrupt repeated pasting.
- **Sneak plus tap for quick undo.** Rejected because Sneak means descend in Creative flight.
- **Plain press rotates, with the menu moved to another gesture.** This changes the established PC and touch input mapping and makes the menu harder to discover. Plain press remains the menu gesture and sneak plus press commits the currently outlined orientation.

## Open-for-veto assumptions

- Clear selection or shape-menu cancel during New copy stays in selection and keeps the old clipboard.
- Death and dimension change end pasting and discard the clipboard.
- `endPasting` clears the confirmed box as well as the clipboard and returns to idle.

## Input spike event table

Device probe logs from 2026-11-17 establish the iPad event sequences below. The control-item outcomes still need owner verification on iPad and PC.

| Device and action                             | Event and result                                                                                                                                         |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| iPad: short tap on air                        | No event for the wand or control items; no action                                                                                                        |
| iPad: short block tap with a control item     | First `playerInteractWithBlock` only; canceled, then `system.run` presses Rotate, Place or Undo                                                          |
| iPad: long press in air for about one second  | Repeated `itemUse`; control items press through their debounce; plain wand press opens the menu and a deliberate sneak press pastes at the stored target |
| PC: right click in air                        | `itemUse` presses the control item; plain wand press opens the menu and a deliberate sneak press pastes at the stored target                             |
| Control-item block interaction plus `itemUse` | Block interaction is canceled; both routes share the debounce, so one click presses once                                                                 |
| Wand block interaction during paste aiming    | Sets or deliberately confirms the target and suppresses paired `itemUse`                                                                                 |

## Consequences

- Copy starts paste aiming. A plain wand air press opens the menu. A deliberate retap, sneak air press or Paste Place commits the stored target. Paste Rotate adjusts the preview and its turn carries over to the next paste.
- Choosing End pasting discards the clipboard and confirmed box. Successful placement retains the clipboard.
- Manual checks must cover fixed targets during camera movement, touch input and action-bar readability.
- The input event mapping and the assumptions above remain subject to the spike and owner review before acceptance.
