# 0202. Build Wand Copy and continuous Paste

- Status: Accepted
- Date: 2026-11-01
- Extends: [0198](0198-one-build-wand-without-a-bulldozer.md): Decision 10: one paste, then done
- Extends: [0201](0201-build-wand-cylinder-and-cube.md): the height step gains a Copy kind

## Context

The Build Wand already copies and pastes (0198), but it is unclear whether a selected region is for building or for copying, tall regions are hard to select for a copy, and a paste cannot be repeated. A tappable always-visible button is not possible with the stable Script API (0001), so the wand stays one item and the shape menu and utility menu carry the new choices. The height step of 0201 already has the steps a tall copy needs, so Copy reuses it instead of duplicating the aim, slider, preview, and confirm code. Copy places no cells, so the height step's registry is split into the part every height-step kind has (volume) and the part only building kinds have (placement).

## Decision

Copy:

1. Copy is an entry of the shape menu shown after the end point, before Cancel, for every shape (line, rectangle of any flat axis, box).
2. On a horizontal rectangle, Copy starts the same height step as the roofs and solids: aim at the height, live outline, tap to confirm. On confirm the box is copied at once, with no Fill, Hollow, or Tube menu. The height grows upward only, from 1 up to the world top (`BUILD_SPEC.worldTopY`).
3. On a box, a vertical rectangle, or a line, Copy copies the selected box as it is, with no height step.
4. During the Copy height step the outline uses its own particle layer, distinct from the build outline and the paste outline. The size readout stays, and the outline shows an over-limit state when the box volume exceeds `BUILD_SPEC.maxCopyVolume` (32,768). Confirming an over-limit box shows the existing "too large" message and stays in the step.
5. After a copy the action bar reports the block count and how to paste. The first tapped block stays the build material for the whole selection; choosing Copy does not change it.

Paste:

6. Paste is still started from the utility menu with Skip air chosen before aiming. After a paste the wand stays in the paste-aiming step with the same Skip air setting, and every further block tap pastes again at that anchor.
7. A paste overlapping a protected cell is refused as a whole and the player stays in the step. A tap while the previous paste job runs gives the existing busy message and does not queue. A second tap on the same anchor within `BUILD_SPEC.pasteRepeatTicks` (10) is ignored; a refused paste does not start that window.
8. While pasting, the utility menu shows only Undo (when there is history) and Stop pasting, and the action bar shows a constant hint with the clipboard size, block count, and both ways out.
9. Paste aiming ends with no paste when the player switches items, dies, leaves the world, or changes dimension. Each paste is one undo entry (10 per player, as today).

Structure:

10. The height-step registry of 0201 Decision 9 is split: `HeightedVolume` (maximum height and wireframe) and `HeightedPlacement` (cells and count), reached through `volumeOf` and `placementOf`. The height step's kind becomes `HeightStepKind`, `HeightedKind` plus `copy`. The preview, height aim, and slider use the volume; the edit plan and confirm use the placement. The split lands first as a refactor that changes no behavior.
11. Not included: a second item, a mode toggle, a Resource Pack screen, rotation, flip, cut, stack, underground copy, and block entity contents in the clipboard.

## Consequences

- Copy reuses the height step, so a new height-step kind that places no cells needs no placement entry.
- Continuous Paste changes the one-paste-then-done behavior of 0198 Decision 10 without rewriting its text.
- Touch behavior (the aim for the Copy height, repeated block taps, the utility menu with sneak) is unverified until checked on the iPad.
- `build_copy_shapes`, `build_continuous_paste`, and `build_paste_blocked` cover real block permutations, exact undo restoration, laid-block protection, and item-switch timing through the engine hooks, following [0188](0188-fuse-in-game-scenarios-and-keep-only-engine-facts-in-game.md) and [0010](0010-testing-strategy.md). Client taps, forms, outlines, and action-bar readability still require manual checks.
- During normal play, the paste hint points to Stop pasting and item switching as the only ways to leave paste aiming; successful or refused pastes keep it active. Death, disconnect, and dimension changes still cancel it.
- The undo stack is unchanged: each paste adds one entry, with the same ten-entry limit per player.
- Revisit this decision if players ask for rotation, flip, or cut.
