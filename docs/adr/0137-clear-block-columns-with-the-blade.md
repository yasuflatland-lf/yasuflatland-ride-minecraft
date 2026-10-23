# 0137. Clear block columns with the blade, keeping liquids, containers, and laid blocks

- Status: Proposed
- Date: 2026-10-24
- Extends: [0055](0055-kind-neutral-vehicle-core.md) (the DriveStep/TickOutcome contract and the order of the world calls in a tick)

## Context

This is the first feature that removes arbitrary blocks. The existing per-cell `clear` path (0063, 0068) cannot clear a hill. One filtered `Dimension.fillBlocks` per column worked in the bulldozer spike, but neighbor updates can drop items such as torches and carpets. The add-on's own laid blocks must survive a cut, as must liquids and blocks holding items with their contents.

## Decision

- Define `CutColumn` and the single `CUT_KEPT_BLOCKS` list in `src/domain/vehicle/cut.ts`, with no imports. Drives return columns through `DriveStep.cut`; the aggregate passes them through `TickOutcome.cut`, defaulting to an empty array. No existing kind returns a cut.
- Apply cuts right after `clear` and before movement inside the existing per-vehicle isolation (0055). A failed world call skips that vehicle's remaining tick; a failed column fill skips only that column. The per-cell clear path is unchanged.
- On the ground, scan from the feet upward to the first air gap or the world's top. Only `isAir` ends the run: kept blocks and light blocks do not. In flight, cut a fixed height through air gaps. Clamp to the dimension's height range and never cut below the requested feet.
- Keep air, water, flowing water, lava, flowing lava, and every block that holds items, with its contents. Share one list across all kinds and read it directly in the adapter. Check its 61 IDs against `@minecraft/vanilla-data` 1.26.52 in unit tests and against the server in game. Omit `poplar_shelf`, which may not exist on the dev BDS: an unknown filter ID can reject the fill.
- Cut bedrock, barrier, command blocks, structure blocks, end portal frames, reinforced deepslate, and light blocks by the owner's decision.
- Add `yasu_ride:laid` to every Behavior Pack block the add-on lays. Keep that tag in every cut and enforce it with `tests/packs/laidTag.test.ts`; generated decor blocks carry it too.
- Use `getBlock` returning undefined or throwing as the chunk check (0125); skip unloaded columns until the drive requests them again. Keep the BP's `@minecraft/server` dependency at 2.2.0. Do not use `isChunkLoaded` or experiments (0001).
- Use one `fillBlocks` per column, filtering `excludeTypes` and `excludeTags` with `ignoreChunkBoundErrors: true`. A dimension-height column has at most 384 cells, below the 32,768-block fill cap (0010).
- Record successful fill boxes and ticks, without per-vehicle state. Remove valid spawned item entities only in the same dimension, within `DROP_MARGIN = 1` block on every axis of the box and `DROP_WINDOW_TICKS = 1` tick of its fill, including the fill tick. Prune older records on cuts and sweeps. The in-game drop scenario records the measured `dt` and `d` below.
- Never sweep entities whose initialization cause is Loaded. Falling blocks may fall. No player or game mode is read, so cuts run in every game mode, Adventure included.

## Consequences

A headlight light block cut from a parked vehicle is not laid again until the beam moves or the headlights are switched: `relight` compares cell keys. Camper ceiling lights are rechecked and return within 20 ticks (0096). This change accepts that gap and leaves headlights unchanged.

The upward scan costs one `getBlock` per cell of hill height plus at most one fill per column. The brief drop sweep can also remove an unrelated newly spawned item in its box and window; loaded items survive. Revisit the shared keep rule if a future kind needs a different list.
