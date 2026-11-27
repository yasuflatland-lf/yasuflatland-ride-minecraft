# 0202. Build Wand Copy and continuous Paste

- Status: Accepted
- Date: 2026-11-01
- Extends: [0198](0198-one-build-wand-without-a-bulldozer.md): Decision 10: one paste, then done
- Extends: [0201](0201-build-wand-cylinder-and-cube.md): shared volume and placement registries

## Context

The Build Wand already copies and pastes (0198), but it is unclear whether a selected region is for building or for copying, tall regions are hard to select for a copy, and a paste cannot be repeated. A tappable always-visible button is not possible with the stable Script API (0001), so the wand stays one item and the shape menu and utility menu carry the new choices. Players can set the height while selecting the box (0253).

## Decision

Copy:

1. Copy is an entry of the root shape menu opened by the wand after the selection is fixed (ADR 0253), after Fill below, for every shape (line, rectangle of any flat axis, box). The root order is Edit height again, Fill, Cut, Build shape, Stairs, Terrace, Remove above, Fill below, Copy, Cancel, omitting inapplicable entries. Edit height again and Build shape are offered for non-lines. Stairs and Terrace are offered for a horizontal row or a single cell whose two taps match its selected bounds. The Build shape submenu starts with Fill and ends with Back to the same root selection.
2. Choosing Copy captures the inclusive selected box immediately for every shape. A horizontal rectangle copies one layer. The recorded facing is the player's cardinal facing at menu choice time.
3. Utility-menu Copy captures the confirmed box in its recorded dimension through the same copy operation.
4. If the box volume exceeds `BUILD_SPEC.maxCopyVolume` (32,768), show the existing "too large" message and preserve the selection and previous clipboard.
5. Success replaces the clipboard and enters paste aiming, ending the active selection (0253). After a copy the action bar reports the block count and how to paste. The first tapped block stays the build material for the whole selection; choosing Copy does not change it.

Paste:

6. Copy or Cut enters paste aiming. Each successful paste keeps the clipboard and manual turn, and clears the target and locked facing for the next placement (ADR 0262).
7. A paste overlapping a protected cell is refused as a whole and the player keeps aiming. If an edit is already running, an otherwise valid paste reports busy and does not queue. The per-player input debounce continues to filter duplicate presses.
8. The paste menu offers New copy, End pasting and Cancel. Build Undo is available through its item. ADR 0203 specifies the aiming and input controls.
9. Paste aiming ends on End pasting, switching away from the build items past the grace delay, death, disconnect, or a dimension change. Each successful paste adds a marked snapshot to the shared undo history of ten entries. Restoring that snapshot while paste aiming with a clipboard clears the target and locked facing and keeps the manual turn. Undo also resumes fresh paste aiming from a selection matching the snapshot box and dimension when a clipboard exists. Otherwise Undo of a paste keeps the current flow. Other edits retain their existing selection restoration rules.

Structure:

10. The height-step registry of 0201 Decision 9 is split: `HeightedVolume` (maximum height and wireframe) and `HeightedPlacement` (cells and count), reached through `volumeOf` and `placementOf`. The height step's kind becomes `HeightStepKind`, `HeightedKind` plus `rotate`. The preview, height aim, and slider use the volume; the edit plan and confirm use the placement. The split lands first as a refactor that changes no behavior.
11. Not included: a second item, a mode toggle, a Resource Pack screen, rotation, flip, cut, stack, underground copy, and block entity contents in the clipboard.

## Consequences

- A flat selection copies exactly one layer, including when the height slider fallback is enabled.
- Paste retains the clipboard and leaves the wand ready for another target (ADR 0262).
- Touch behavior (live selection height, paste controls, the utility menu with sneak) is unverified until checked on the iPad.
- `build_copy_shapes`, `build_paste_stays_aiming`, and `build_paste_blocked` cover real block permutations, continuous placement, exact undo restoration, and laid-block protection through the engine hooks, following [0188](0188-fuse-in-game-scenarios-and-keep-only-engine-facts-in-game.md) and [0010](0010-testing-strategy.md). Client taps, forms, outlines, and action-bar readability still require manual checks.
- A refused paste keeps the player aiming at the clipboard preview. A successful paste clears the preview.
- Paste, Cut, rotation and cell edits share the ten-entry undo history.
