# 0258. Build Undo steps back a fresh selection

- Status: Proposed
- Acceptance condition: selection step-back checks pass on PC and touch devices
- Date: 2026-11-22
- Extends: [0198](0198-one-build-wand-without-a-bulldozer.md): Decision 7, Build Undo reverses selection steps before edit history
- Related: [0229](0229-open-build-utilities-with-a-plain-air-press.md): idle utility Undo remains edit-only
- Related: [0253](0253-persistent-build-selection-and-tool-swapping.md): persistent selection and built boxes

## Context

On mobile, the second tap can fix the wrong cell. Root Cancel discards both endpoints, forcing the player to pick the material and start again. Build Undo already provides a dedicated gesture without a menu, but previously only reversed edits.

A root menu entry to re-pick the endpoint would add a menu interaction before correcting the mistake. Tapping the start marker would overload selection input and depend on accurately targeting that marker on touch devices. Neither gives the existing Undo item the expected immediate correction behavior.

## Decision

1. Build Undo reverses the newest step, either a fresh selection step or an edit. An endpoint is fresh only in `baseHeight` entered by the end tap, or in a line's `selected` flow before its root menu first opens. One press returns to the exact original `point1`, preserving its start cell, material and dimension, and reports `endCleared`. In `point1`, one press returns to `idle` and reports `startCleared`.
2. The fresh flow stores its original `point1` as optional `stepBackTo`; no separate freshness flag exists. Live height updates retain it. Height confirmation, Adjust height, pasted boxes and built boxes do not create it. Opening a line's root menu removes it, including when the player dismisses that menu. A successful rotation removes it before retaining the rotated selection.
3. In every other flow Build Undo calls the existing edit undo unchanged. After paste or build selects its result, Build Undo reverses that edit. The idle utility menu Undo remains edit-only. Selection step-back neither changes edit history nor checks or changes the running edit flag, so an ongoing job does not block correcting selection.
4. The held-item routes retain their shared per-player debounce. A selection step-back refreshes markers, live outline and tap target on the same tick.

## Consequences

The player can correct an end tap without losing the start or material. A second Undo clears the start. Selection correction consumes no history entry, while confirming height or opening the line menu ends that correction window. This freshness boundary must stay explicit when adding new selection constructors or edits. Revisit the gesture if device checks show that players cannot predict whether Undo will reverse a selection step or an edit.
