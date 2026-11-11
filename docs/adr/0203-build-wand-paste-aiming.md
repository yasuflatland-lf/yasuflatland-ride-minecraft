# 0203. Build Wand paste aiming

- Status: Proposed
- Acceptance condition: the input spike for the paste aiming event mapping is done and the owner reviews the open assumptions (#1114)
- Date: 2026-11-01
- Supersedes in part: [0202](0202-build-wand-copy-and-continuous-paste.md): Decisions 6, 8, and 9, and the Consequences bullet on Stop pasting

## Context

ADR 0202 starts continuous Paste from the utility menu, asks for Skip air before aiming, and pastes on a block tap. Its Stop pasting entry and item switching leave the clipboard available. The redesigned interaction enters paste aiming after Copy, uses the gaze for both the outline and the target, and offers paste controls on air. The wand remains one item. Touch input and the event mapping need an input spike before the interaction can be verified.

## Decision

Paste is a wand state (`pasteAim`) entered automatically, without a menu step or a block tap to paste. `AimReader` finds the first solid block within `BUILD_SPEC.reach` (64) and its face. Liquids and passable blocks do not stop the ray. The blue paste outline (`blue_flame`) is redrawn every `BUILD_SPEC.outlineInterval` (10) ticks; the paste uses the live aim at press time.

1. **Entry.** Completing Copy from the shape menu, Copy height step, or utility menu stores the clipboard and immediately enters paste aiming while the player holds the wand. A copy exceeding `BUILD_SPEC.maxCopyVolume` (32,768 cells) is refused without changing the flow or previous clipboard.
2. **Outline.** When the gaze hits a block, the outline shows the clipboard volume snapped to the highest solid ground across its footprint and follows the gaze. The initial minimum is one cell outside the viewed face. Each footprint column scans down from that initial minimum Y inclusively for at most `BUILD_SPEC.groundSearchDepth` (64) cells, skipping air, liquids and replaceable cover (including grass, flowers, vines and snow layers). Unloaded or throwing cells make that column groundless. Ignore groundless columns; set the final minimum Y to the maximum ground Y plus one, preserving X/Z and size. The anchor equals the snapped box minimum. Top-face aims on flat ground keep their height; wall-side and cave-underside aims drop to the floor below. If all columns are groundless, draw no paste outline. With no block within reach, no outline is drawn and pasting is impossible. A constant action-bar hint shows clipboard size and block count.
3. **Paste.** A long press, expected to be the wand `itemUse` event after `BUILD_SPEC.pressDebounceTicks` and subject to the input spike, pastes at the aimed target and can be repeated indefinitely. The outline and press share the application use case `ResolvePasteTarget`, which reads the session clipboard and turn and passes the box from `aimedPasteTarget` through `snapToGround` using `GroundProbe` in the player's dimension. A block hit with no ground refuses with `noGround`, starts no paste, and keeps paste aiming; protection and undo snapshot checks in `PasteAt` use the snapped box. A ray through the drawn box to a block behind it pastes at that block's face; a ray through the box into empty sky opens the menu. A short iPad tap does nothing because it sends no event on air; paste and menu actions use a long press of about one second. On PC, right click immediately sends `itemUse`, so a short click pastes. `playerInteractWithBlock` never pastes.
4. **Menu.** A missing block hit opens the menu; a hit with no ground is a refusal. A long press on air opens, without sneaking, a menu in this order: Undo when history exists, Skip air with its on/off state, New copy, and End pasting. Undo reverts the last paste, keeps the clipboard and paste aiming, and clears the same-anchor repeat window.
5. **End.** End pasting, switching items after `modeLeaveTicks` (6), death, and a dimension change end paste aiming and discard the clipboard and confirmed box. Another paste requires another copy.
6. **New copy.** New copy returns to normal selection (`idle`): select start and end points, then choose Copy. The old clipboard remains until a successful copy replaces it and automatically starts paste aiming. No paste outline or hint appears during selection. A refused oversized copy, Clear selection, or shape-menu cancel keeps the old clipboard and stays in selection. Switching items, death, or a dimension change before completion discards the clipboard.
7. **Unchanged rules.** A paste overlapping a protected cell is refused as a whole (`pasteBlocked`) and aiming continues. A press while a paste job runs shows the busy message and does not queue. A second press on the same anchor within `BUILD_SPEC.pasteRepeatTicks` (10) is ignored; a refused paste does not start that window. Each paste creates one undo record, and the job checks protection again per cell.
8. **Skip air.** The menu toggle applies only to subsequent pastes, never to a running job. It defaults to off, persists across pastes in one paste aiming session, and resets to off on each entry to paste aiming.
9. **Removed.** Remove Paste and Stop pasting from the utility menu, the pre-paste Skip air form, and block-tap pasting. The normal selection utility menu keeps Copy of the confirmed box, Undo, and Clear selection.

## Open-for-veto assumptions

- Skip air defaults to off and resets to off on every entry, including after New copy.
- Gaze on the outline means a solid block is viewed within reach, rather than a ray intersection with the drawn box. Liquids and passable blocks, including water and tall grass, count as air. Live aim can differ from the last outline by up to 10 ticks.
- Undo clears the same-anchor repeat window.
- Clear selection or shape-menu cancel during New copy stays in selection and keeps the old clipboard.
- Death and dimension change end pasting and discard the clipboard.
- `endPasting` clears the confirmed box as well as the clipboard and returns to idle.

## Input spike event table

Expected behaviour only; no device measurements exist yet. Owner verification on iPad and PC is pending.

| Device and action                     | Expected event and result                                              |
| ------------------------------------- | ---------------------------------------------------------------------- |
| iPad: short tap on air                | No event; no paste or menu                                             |
| iPad: long press for about one second | `itemUse`; paste at a viewed block or open the menu on air             |
| PC: right click                       | `itemUse` immediately; paste at a viewed block or open the menu on air |
| Block tap                             | `playerInteractWithBlock`; never pastes                                |

## Consequences

- Copy leads directly to repeatable paste aiming, and the menu on air provides the controls without sneaking.
- Ending paste aiming discards the clipboard and confirmed box, so another paste requires another copy.
- The outline can lag the live target by up to 10 ticks. Manual checks must cover a fast gaze change as well as touch input and action-bar readability.
- The input event mapping and the assumptions above remain subject to the spike and owner review before acceptance.
