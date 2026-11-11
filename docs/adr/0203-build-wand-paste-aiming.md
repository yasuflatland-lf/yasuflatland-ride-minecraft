# 0203. Build Wand paste aiming

- Status: Proposed
- Acceptance condition: the input spike for the paste aiming event mapping is done and the owner reviews the open assumptions (#1114)
- Date: 2026-11-01
- Supersedes in part: [0202](0202-build-wand-copy-and-continuous-paste.md): Decisions 6, 8, and 9, and the Consequences bullet on Stop pasting

## Context

ADR 0202 starts continuous Paste from the utility menu, asks for Skip air before aiming, and pastes on a block tap. Its Stop pasting entry and item switching leave the clipboard available. The redesigned interaction enters paste aiming after Copy, uses the gaze for both the outline and the target, and offers paste controls on a plain press. The wand remains one item. Touch input and the event mapping need an input spike before the interaction can be verified.

## Decision

Paste is a wand state (`pasteAim`) entered automatically, without a menu step or a block tap to paste. `AimReader` finds the first solid block within `BUILD_SPEC.reach` (64) and its face. Liquids and passable blocks do not stop the ray. The blue paste outline (`blue_flame`) is redrawn every `BUILD_SPEC.outlineInterval` (10) ticks; the paste uses the live aim at press time.

1. **Entry.** Completing Copy from the shape menu, Copy height step, or utility menu stores the clipboard and immediately enters paste aiming while the player holds the wand. A copy exceeding `BUILD_SPEC.maxCopyVolume` (32,768 cells) is refused without changing the flow or previous clipboard.
2. **Outline.** When the gaze hits a block, the outline shows the clipboard's x, y, and z volume anchored at the viewed face and follows the gaze. With no block within reach, no outline is drawn and pasting is impossible. Every outline interval, an action-bar mode line shows clipboard size, block count, and the menu and sneak-to-paste gestures, even without a target. A separate translated sneak prefix is visible while sneaking.
3. **Paste.** A plain accepted wand `itemUse` always opens the paste menu, even while viewing a block or when no aim is available, and never writes the world. Only sneak plus press pastes at the live aimed target. With no block target, a sneak press shows "Aim at a block to paste." and keeps aiming. The outline and press share `aimedPasteTarget`. PC right click immediately produces `itemUse`; iPad is expected to require a long press of about one second. A short iPad air tap is expected to send no event. `playerInteractWithBlock` never pastes. Device timing remains subject to the input spike. Separate per-player windows use `BUILD_SPEC.pressDebounceTicks` for ordinary presses and `BUILD_SPEC.pasteRepeatTicks` for sneak presses during paste aiming. A menu press does not suppress a following commit, and repeated commits within the window are suppressed across different anchors. Each attempted press updates its own window, including rejected repeats.
4. **Menu.** A plain press opens a menu in this order: Undo when history exists, New copy, End pasting, Cancel. Cancel and dismissal keep paste aiming. Rotate is absent; selected-box rotation belongs to the shape menu. Undo reverts the last paste, keeps the clipboard and paste aiming, and clears the same-anchor repeat window.
5. **End.** End pasting, switching items after `modeLeaveTicks` (6), death, and a dimension change end paste aiming and discard the clipboard and confirmed box. Another paste requires another copy.
6. **New copy.** New copy returns to normal selection (`idle`): select start and end points, then choose Copy. The old clipboard remains until a successful copy replaces it and automatically starts paste aiming. No paste outline or mode line appears during selection. A refused oversized copy, Clear selection, or shape-menu cancel keeps the old clipboard and stays in selection. Switching items, death, or a dimension change before completion discards the clipboard.
7. **Unchanged rules.** A paste overlapping a protected cell is refused as a whole (`pasteBlocked`) and aiming continues. An accepted sneak press while a paste job runs shows the busy message and does not queue. A second press on the same anchor within `BUILD_SPEC.pasteRepeatTicks` (10) is ignored; a refused paste does not start that window. Each paste creates one undo record, and the job checks protection again per cell.
8. **Mode display.** `BuildFeedback.showMode` supports paste-ready dimensions and block count, and a declared rotate variant with degrees 0, 90, 180 or 270. The rotate variant is rendered but its input wiring is deferred. The paste-ready mode says "Press: menu | Sneak + press: paste" and adds a "[Sneaking]" prefix while the player is sneaking. Skip air is removed by ADR 0243: paste replaces the whole box, including air.
9. **Removed.** Remove Paste and Stop pasting from the utility menu, the pre-paste Skip air form, and block-tap pasting. The normal selection utility menu keeps Copy of the confirmed box, Undo, and Clear selection.

## Open-for-veto assumptions

- Gaze on the outline means a solid block is viewed within reach, rather than a ray intersection with the drawn box. Liquids and passable blocks, including water and tall grass, count as air. Live aim can differ from the last outline by up to 10 ticks.
- Undo clears the same-anchor repeat window.
- Clear selection or shape-menu cancel during New copy stays in selection and keeps the old clipboard.
- Death and dimension change end pasting and discard the clipboard.
- `endPasting` clears the confirmed box as well as the clipboard and returns to idle.

## Input spike event table

Expected behaviour only; no device measurements exist yet. Owner verification on iPad and PC is pending.

| Device and action                     | Expected event and result                                                           |
| ------------------------------------- | ----------------------------------------------------------------------------------- |
| iPad: short tap on air                | No event; no paste or menu                                                          |
| iPad: long press for about one second | `itemUse`; plain press opens menu; sneak press pastes at a viewed block             |
| PC: right click                       | `itemUse` immediately; plain press opens menu; sneak press pastes at a viewed block |
| Block tap                             | `playerInteractWithBlock`; never pastes                                             |

## Consequences

- Copy leads directly to repeatable paste aiming, and a plain press provides the controls and sneak plus press commits a paste.
- Ending paste aiming discards the clipboard and confirmed box, so another paste requires another copy.
- The outline can lag the live target by up to 10 ticks. Manual checks must cover a fast gaze change as well as touch input and action-bar readability.
- The input event mapping and the assumptions above remain subject to the spike and owner review before acceptance.
