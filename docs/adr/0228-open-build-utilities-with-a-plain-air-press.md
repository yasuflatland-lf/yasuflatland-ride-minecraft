# 0228. Open Build Wand utilities with a plain air press

- Status: Proposed
- Acceptance condition: the iPad gesture check of the Build Wand series passes (#1038)
- Date: 2026-11-05
- Extends: [0198](0198-one-build-wand-without-a-bulldozer.md): Decision 10, the utility menu gesture
- Related: [0203](0203-build-wand-paste-aiming.md): Decision 4, the paste menu opens without sneaking

## Context

A player on iPad made a mistake and could not work out how to undo. Outside paste aiming, Undo lives only in the utility menu, which needs sneaking plus an air press. Paste aiming already opens its menu with a plain air press (0203). With nothing selected, an air press currently does nothing, so the most common state after an edit offers no visible way to the menu. An action bar hint alone was missed on iPad, and a chat line on every edit would flood continuous paste.

## Decision

1. An air press in `idle` opens the utility menu without sneaking. Sneaking plus an air press still opens it in every flow that reaches that check. During `point1` and `endpoint`, a plain air press keeps fixing the virtual end point. `opensUtilityMenu(flow, sneaking)` in the domain returns `sneaking || flow.kind === "idle"`.
2. The undo hint names this gesture in a short action bar message, plus one chat line the first time per session. The hint is implemented separately from this decision's gesture change.

## Consequences

- An idle session with no history and no confirmed box has an empty utility menu, so the press opens no form.
- No duration check is added: a touch long press arrives as `itemUse` like any other press.
- 0198 Decision 3 (ignoring long press outside paste aiming) stays an open issue in the spec; this ADR does not change it.
- The gesture is checked by hand on iPad at the end of the series.
