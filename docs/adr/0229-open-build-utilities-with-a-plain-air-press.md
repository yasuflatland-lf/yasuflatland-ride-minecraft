# 0229. Open Build Wand utilities with a plain air press

- Status: Proposed
- Acceptance condition: the iPad gesture check of the Build Wand series passes (#1038)
- Date: 2026-11-05
- Extends: [0198](0198-one-build-wand-without-a-bulldozer.md): Decision 10, the utility menu gesture
- Related: [0203](0203-build-wand-paste-aiming.md): Decision 4, the paste menu opens without sneaking

## Context

A player on iPad made a mistake and could not work out how to undo. Outside paste aiming, Undo lives only in the utility menu, which needs sneaking plus an air press. Paste aiming already opens its menu with a plain air press (0203). With nothing selected, an air press currently does nothing, so the most common state after an edit offers no visible way to the menu. An action bar hint alone was missed on iPad, and a chat line on every edit would flood continuous paste.

## Decision

1. An air press in `idle` opens the utility menu at either sneak state. In `point1`, a plain air press fixes the virtual end point and a sneak air press opens the utility menu. In `selected`, the wand opens the root shape menu on an air press or an interaction with any block at either sneak state. `opensUtilityMenu(flow, sneaking)` admits air presses in `idle` and `selected` and sneak air presses in other flows that reach the check. Live selection height, operation height confirmation and paste aiming have their own routing. In `baseHeight`, a wand press in air or on a block fixes the aimed height at either sneak state without opening a menu.
2. The undo hint names the idle air press in a short action bar message, plus one chat line the first time per session. `airPressOffersUndo(flow)` is true only in `idle`. The selected root menu offers the shape actions, and Build Undo remains available as a held item. In other flows the action bar shows the count and the first-use chat hint remains available for a later edit.

## Consequences

- An idle session with no history and no confirmed box has an empty utility menu, so the press opens no form.
- No duration check is added: a touch long press arrives as `itemUse` like any other press.
- 0198 Decision 3 (ignoring long press outside paste aiming) stays an open issue in the spec; this ADR does not change it.
- The gesture is checked by hand on iPad at the end of the series.
