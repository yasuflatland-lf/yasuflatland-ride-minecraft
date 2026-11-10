# Dining set: design

Date: 2026-11-09. Status: approved by the owner in conversation; this document is the handoff to the issues.

## Intent

The owner wants four pieces of outdoor furniture in the Resort Gear group, after the Beach Parasol and the Beach Chair ([beach parasol](2026-11-09-beach-parasol-design.md), [beach chair](2026-11-09-beach-chair-design.md)). The scene: a dining table under a parasol, chairs around it, a sofa beside it, players seated, and a lantern, a Dutch Oven, or ordinary blocks on the table.

The pieces:

1. Dining Table, square, one cell.
2. Dining Chair, one seat.
3. Sofa (single), one seat.
4. Sofa (double), two seats, two cells wide.

The owner supplied product photos. They stay out of the repository; the builder reads them from the owner's machine at `~/Downloads/`:

- Table: `daining_table_whole.png`, `daining_table_zoom.png`, `daining_table_texture_closeup.png` (the black weave).
- Chair: `daining_chair_whole.png`, `daining_chair_closeup.png`, `daining_chair_side_closeup.png`.
- Single sofa: `sofa_1person.png`, `sofa_1person_closeup.png`.
- Double sofa: `sofa_2person_whole.png`.
- Amber weave texture for the sofas: `sofa_textue.png`.

The file names keep the owner's spelling ("daining", "textue"). The visual preview the owner approved is a board of these photos with proposed sizes; the model previews come later, per piece.

## Goals

1. Four items in the Resort Gear group, in this order after the Beach Chair: Dining Table, Dining Chair, Sofa (single), Sofa (double). Item ids: `yasu_ride:dining_table_item`, `yasu_ride:dining_chair_item`, `yasu_ride:sofa_single_item`, `yasu_ride:sofa_double_item`.
2. Each model matches its photos closely. This is the main quality bar: "it looks different from the photo" is the failure the owner named.
3. A tap on the top face of a block places the piece. Three hits take it back as an item, as for the other gear.
4. Chairs and sofas can be sat on: one seat for the chair and the single sofa, two for the double sofa. Sitting and getting up use the vanilla rideable behavior, as the Low Chair does.
5. Things can stand on the Dining Table: Gas Lanterns and Dutch Ovens (the shared tabletop host, as the Camp Table and the folded Beach Chair do), and ordinary blocks (invisible solid block laid in the table's cell).
6. Survival players can craft each piece.

## Non-goals

- No paint. Colors stay as in the photos (black weave and steel; amber weave with beige cushions).
- No starter item on first join.
- No lying down, no pose override: sitting only, using the existing rideable seat.
- No stacking furniture, no linking neighbouring pieces into a corner sofa.
- No changes to the Beach Chair, the Beach Parasol, or the Camp gear behavior.

## Anti-goals

- Models that read as generic furniture rather than the photographed pieces: the black table with a flared four-leg stance joined by a ring and a woven mesh top; the chair with piped steel arms sloping from the back's top edge to the legs and a woven back and seat; the sofas with a boxy amber-weave frame, thick arms, cushions, and small metal feet. The grille-style trademark rule in ADR 0009 is not involved here, but no logo or name appears on any piece.
- A table that accepts blocks on top but leaves them floating, or lets players walk through an invisible solid block after the table is taken back (laid blocks must be recorded, cleared on take-back, and repaired after reload).
- A table taken back while a lantern, an oven, or a block stands on it, which would drop the item or leave the thing in the air.
- A seat that kicks the rider into the furniture's own box or leaves them inside a wall.

## Sizes (the builder may adjust within these, to match the photos)

One block is 1 m (16 px). Seat and top heights are taken from the photos.

| Piece         | Cells (across x along, at yaw 0)              | Rough height                   | Seats |
| ------------- | --------------------------------------------- | ------------------------------ | ----- |
| Dining Table  | 1 x 1                                         | 0.75                           | none  |
| Dining Chair  | 1 x 1 (body about 0.55 wide, inside the cell) | back 0.8, seat 0.45            | 1     |
| Sofa (single) | 1 x 1                                         | 0.7 (back 0.8 to cushion tops) | 1     |
| Sofa (double) | 2 x 1 (two cells across, one deep)            | as the single                  | 2     |

Facing: the front of every piece is its model -z side (ADR 0009). On placement it faces the player (rotated half a turn from the player's yaw, snapped to a quarter turn), like the camp chairs. The double sofa's two cells run across its front: the pressed cell and the cell to the player's right.

## Domain model (value objects and rules)

A new family, "furniture", in the `resort` feature. It is a table of kinds with per-kind parameters, as ADR 0050 asks (no branching on the kind in shared logic):

- `FurnitureKind`: `"dining_table" | "dining_chair" | "sofa_single" | "sofa_double"`.
- `FurnitureId`: branded string, the entity id.
- `FurnitureSpec` (per kind, all tuning in one frozen table `FURNITURE_SPEC` in `src/domain/resort/furniture.ts`): `cells` (local offsets, `ahead` and `left`, as the parasol's `footCells`), `clearance` (layers of air above the support block), `seats` (rideable seat offsets in blocks, pinned equal to the pack by a test), `hitsToTakeBack`, `hitResetTicks`, and for the table a `top: TopSurface` (the shared value object from `src/domain/shared/tableTop.ts`).
- `FurniturePose`: origin (entity position) and quarter-turn yaw. `furniturePose(block, playerYaw, kind)`, `furnitureCells(pose, kind)`, `furnitureSupportCells`, `furnitureClearCells` generalize the Beach Chair's `beachChairPose`, `beachChairSupportCells` and `beachChairClearCells`. Property tests cover all four yaws.

Layers (ADR 0012, 0046): domain in `src/domain/resort/`, use cases and ports in `src/application/resort/`, Bedrock adapters and handlers in `src/infrastructure/resort/`, wired in `installResort`. New files are flat and prefixed `furniture` (the resort feature has no kind subfolders). Nothing imports `camp`; shared code is reused from `shared/` only.

## Behavior

### Placing

Using the item on the top face of a block outside the add-on's blocks places the piece in the cells from its spec. Every cell needs a solid full-height support under it, and `clearance` layers of air over it outside vehicle and camp space (same checks as `PlaceBeachChair`). A refusal shows an action-bar hint and consumes nothing. Survival consumes one item; Creative none; a failed spawn refunds. Presses are deduplicated per player per tick and deferred, as other gear does.

### Sitting

Chairs and sofas are rideable entities with `minecraft:rideable` seats in the entity definition, using the pack's `action.interact.yasu_ride.sit` interact text, as `low_chair.se.json` does. No script runs while sitting. Nothing about the player pose changes.

### Taking back

Three non-dye hits within `hitResetTicks` return one item to the hitter (dropping an overflow) and remove the entity (`handleHit` from `src/application/shared/takeBackByHits.ts` with `HitCounters`). Earlier hits show how many remain. Refused with a message, counter unchanged, while someone sits on the piece. For the table, the refusal also covers "anything on it" (below). The hit boxes cover the whole piece; for the double sofa, both cells.

### Dining Table: things on top

- **Lanterns and ovens.** Register a `dining_table` host in `TopHostRegistry` in `installResort` (the shared registry that `installCamp` and the Beach Chair already use), with `isTopNow: () => true`, the table's `TopSurface` and refusal hint keys in both locales. A tap with a Gas Lantern or Dutch Oven item on the table entity works through the existing camp handlers with no new code in them.
- **Blocks.** While placed, the table lays an invisible solid block (`yasu_ride:dining_table_top`) in its one cell, with its top at the visible top height so a block placed on it sits flush. It is laid only when the cell is air and outside vehicle space. The laid cells are recorded on the entity (dynamic property `yasu_ride:top_cells`), cleared when the piece is taken back (only cells that still hold the block), and repaired after reload by the lifecycle scan, the pattern of the parasol ceiling and the old Beach Chair table blocks. The block resists mining and explosions, does not block light, and breaks by Creative players are cancelled through `registerLaidBlockGuard`.
- **Taps on the block.** The laid block has no custom component. The `playerInteractWithBlock` before-event forwards first-event Gas Lantern or Dutch Oven taps on the tabletop block to the table, cancelling only when handled by a `PlaceHostedOnTop` function that `installCamp` returns and `bootstrap` passes to `installResort` as a dependency (resort never imports camp; this function does not exist on `origin/main` yet, so a small refactor pull request adds it, with no change to camp behavior; the removed commit `afdbd220` shows the earlier shape); holding a placeable block lets the engine place it with a plain tap (no sneak), unless the destination overlaps a hosted footprint; anything else does nothing (the table has no form to switch). Hits on the block count as hits on the table.
- **Sharing the top.** A hosted lantern or oven and a block cannot share the top: hosting is refused when the cell above the table holds a block, and placing a block above the table is refused while a hosted item stands on it.
- **"Anything on it"** means any hosted lantern or oven, or a non-air block in the cell directly above the laid block. Taking back is refused while anything is on it.

The reference implementation for the blocks is in git history: commit `0b822bfe` (Beach Chair table blocks), later removed by `aa3c5400` and `a3d3245c`. The builder reads those diffs for the pattern and does not restore the Beach Chair's blocks.

## Pack contract

- Entities `yasu_ride:dining_table`, `yasu_ride:dining_chair`, `yasu_ride:sofa_single`, `yasu_ride:sofa_double`, each `is_spawnable: false`, persistent, not pushable, damage immune, gravity on, `inanimate` family, with a collision box, hit boxes covering the model, and, for chairs and sofas, rideable seats. Files follow the layout rules in `AGENTS.md` (short type suffixes, paths within 80 characters).
- Geometry `geometry.yasu_ride.<name>`, texture, render controller, client entity, item, recipe, lang keys in `en_US` and `ja_JP`, item icon and preview from `pnpm model`, catalog entry in `tools/gen_item_catalog.py`.
- Bump the Resource Pack manifest version in every pull request that touches the Resource Pack. When two such pull requests meet in `main`, the second one raises the version again.
- Recipes are shaped crafting-table recipes. The builder picks patterns that do not collide with vanilla or existing add-on recipes: the table from planks, sticks and iron ingots; the chair from the same; the sofas from planks, sticks and wool.

## Model generation and textures

- A shared weave generator in `tools/wicker.py` produces the black and amber weave tiles from the photos' pattern (a flat-strand basket weave for the black, a fine tight weave with light and dark bands for the amber). Each piece's generator calls it.
- One generator per piece, as for the other gear: `tools/gen_dining_table.py`, `tools/gen_dining_chair.py`, `tools/gen_sofa.py` (single and double share it). They use `tools/panels.py` and `tools/cube_tilt.py` for tilted parts, and put the geometry, texture, and item preview where `pnpm model` expects them. `pnpm model:check` must pass.
- **Fidelity check.** Each model pull request includes previews from `tools/render_preview.py` at the same viewpoints as the owner's photos, side by side with them. The owner approves the look before the pull request merges. Expect a round or two of adjustments.

## Constraints

- Stable Script API only (ADR 0001); no beta APIs, no experimental toggles.
- English in everything committed (`pnpm lint:lang`). Japanese appears only in `texts/ja_JP.lang`.
- No branching on the kind inside shared logic; parameters live in `FURNITURE_SPEC`.
- A pull request that changes behavior updates `docs/specs/resort-gear.md`. The decision is recorded in a new ADR, written in the first domain pull request and kept in step by the others.
- Pin exact dependency versions; no new dependency is expected.

## Left to the builder

- Pixel dimensions, part counts, and how tilted parts are built from cubes.
- Exact recipe patterns, hint wording in both languages, sounds (reuse existing ones).
- Hit box sizes, within "cover the whole model".
- The invisible block's exact shape (full cell or a plate at the table-top height), as long as a block placed on top sits flush.

## Decisions made while writing this (the owner can overrule)

1. The code base is `origin/main`. The Beach Chair, `TopHostRegistry`, and `placeOnTop` are already there. The Beach Chair stays as it is; `furniture*` does not replace its pose functions, so some pose math is duplicated on purpose (the Beach Chair has a different shape and a lying pose).
2. Entity origin: the centre of the piece's footprint at floor height. For the double sofa the footprint is the pressed cell and the cell to the player's right, so the origin is on their shared edge, and the two seats sit at x = -0.5 and +0.5 blocks. Cell offsets in `FURNITURE_SPEC` are relative to the pressed cell; a property test checks every cell at all four yaws.
3. Taps with a lantern or oven on the table entity itself already reach the shared hosting through the registry. Only taps on the invisible block need the new `PlaceHostedOnTop` forwarding.
4. Build order: shared groundwork first (a laid-block layer rename, the domain family, the weave tool, the forwarding function), then the generic place and take-back pipeline, then the pieces. The Dining Chair is the first piece to prove the pipeline. The Dining Table with blocks comes last because it is the riskiest.
5. Model pull requests wait for the owner's approval of previews against the photos before merging; the pipeline pull request is unit-tested only and ships no entity.
