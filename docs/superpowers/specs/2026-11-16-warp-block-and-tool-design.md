# Warp block and warp tool

Date: 2026-11-16. Status: draft, waiting for approval.

## Intent and why

Players on the home LAN server build in several places far apart. They want to
jump between build sites, jump to a family member's or friend's base, and mark
their own reference points. Walking or flying between them is slow, and
coordinates are hard to remember.

The feature is a build tool, in the same family as the Build Wand. It is a
convenience for builders, not a vehicle.

## Goals

- Placing a warp block registers a named warp point in a list shared by every
  player in the world.
- Right-clicking (tapping) a warp block opens the list. Choosing an entry
  teleports the player to that warp point.
- A new warp tool in the Building Tools creative group opens the same list with
  an air press, so a player can warp from anywhere, with no warp block nearby.
- Works from PC (keyboard and mouse) and mobile (touch).

## Non-goals

- Several kinds of warp block, such as colors for categories. One kind only.
- Reordering, folders, favorites, or teleport cooldowns and costs.
- Showing the name on the block itself (floating text). The name appears in
  the list and in the edit form only.
- Permissions: any player may warp to, or break, any warp block. This is a
  trusted LAN.
- Teleporting other players or entities, or warping by chat command.
- Detecting vanilla beacons. An earlier idea used the vanilla beacon; it is
  rejected in favor of a dedicated block.

## Anti-goals

- A list that goes stale and sends a player to a spot where the block is gone,
  without saying so.
- Any icon or texture that copies the Dragon Radar from Dragon Ball (see
  "Icon").
- A beta Script API or an experimental toggle (ADR 0001).

## Constraints

- Stable APIs only: `@minecraft/server` 2.x and `@minecraft/server-ui` (already
  used by `src/infrastructure/build/bedrock/buildMenus.ts` and
  `src/infrastructure/shared/choiceForm.ts`).
- Three layers with one-way dependencies and feature folders (ADR 0012, 0046).
  Only infrastructure imports `@minecraft/server`.
- Identifiers use the `yasu_build:` namespace, like the Build Wand (ADR 0178).
  Pack files go under `<type>/yasu_build/`, with paths at most 80 characters.
  Use `id()` from `src/infrastructure/shared/identifiers.ts`.
- Custom blocks already exist in `packs/yasu_ride_bp/blocks/` (format version
  1.21.80, `minecraft:custom_components`), so a custom block is not a new
  technique for this repo.
- Bump the Resource Pack manifest version, because the block texture, icon, and
  lang keys change tracked Resource Pack files (ADR 0015).
- The stable API cannot enumerate blocks in the world, so the list is built
  from placement and break events, not from a scan.
- All text in the repository is English. Lang files for other locales are the
  only exception.

## Approaches considered

How the list is opened:

1. A "warp" entry in the Build Wand's utility menu. Fits the build tools well
   but needs the wand in hand and adds nothing at the warp block.
2. Block right-click only. Works like a portal, but a player far from any
   block has no way to open the list.
3. Block right-click and a separate warp tool in the Building Tools group.
   Both open the same form. Chosen by the user. The wand menu entry is dropped,
   because the new tool replaces it.

How warp points are known:

- Record them from the block's placement and break events and keep them in a
  stored registry. Chosen: it is the only approach the stable API supports.
- Scan loaded chunks for the block. Rejected: unreliable and slow.

What the block is:

- The vanilla beacon. Rejected: its beam and pyramid behavior get in the way,
  it cannot be told apart from other beacons, and it has no clean place for a
  name.
- A dedicated custom block, `yasu_build:warp_block`. Chosen.

## Decisions

1. **Warp block.** `yasu_build:warp_block`, one kind. It appears in the
   Building Tools group. Right-click (tap) opens the warp list. Sneaking and right-click (a
   long press on touch) opens the name edit form instead, like editing a sign.
2. **Warp tool.** `yasu_build:warp_tool`, stacks to one, in the Building Tools
   group, using the radar icon. An press opens the warp list, whether the
   player aims at air or at a block, like the Build Wand's plain air press
   (ADR 0229). It also works from the touch long press. Pressing it on a warp
   block opens the same list.
3. **Naming like a sign.** The name is typed in a text form when the block is
   placed, and can be edited later with the sneaking press on the block. Any
   player may edit any name. An empty edit keeps the old name. Names are
   trimmed and at most 32 characters.
4. **Registration.** On placement, a name form opens for the placing player. A
   cancelled form, or an empty name, uses a default name ("Warp" plus the next
   free number). The entry stores a unique id, the name, the placing player's
   name, the dimension, and the block coordinates.
5. **Removal.** The break event removes the entry. Breaking by an explosion or
   an entity is not seen, so the list is also pruned when it opens (decision 6).
6. **Storage.** One world-level record kept with the world's dynamic
   properties, so it survives restarts. It is shared by all players. The size
   limit of a stored string applies, so the builder may need to split it
   across several keys.
7. **List form.** An action form of buttons. Each button shows the name, the
   placing player's name, the dimension, and the coordinates. Entries in the
   player's current dimension come first, ordered by distance from the player;
   entries in other dimensions follow. When the list opens, an entry whose
   chunk is loaded and whose block is no longer a warp block is removed from
   the registry. An entry in an unloaded chunk is kept and shown as
   "unverified".
8. **Teleport.** Choosing an entry teleports the player to a safe standing spot
   on or beside the block, in the entry's dimension. An "unverified" entry may be chosen: the player
   is teleported, and once the chunk has loaded the block is checked; if it is
   gone, the entry is removed and the player is told in the action bar or chat,
   so the stale list is never silent. If no safe
   spot exists next to the block, the player goes to the block's center top.
9. **Icon.** The warp tool's icon is an original radar-style picture: a round
   screen, a grid, a few dots, and a marker at the center. It must not copy the
   shape, rim, button, colors, or layout of the Dragon Radar from Dragon Ball;
   only the general idea of a scope that shows points is used. The warp block
   needs its own texture too. Both go through the existing generation flow
   (`pnpm model`) and are committed where that flow expects tracked outputs.
10. **Dimensions.** The block can be placed in all three dimensions, the
   registry stores the dimension id, and teleport works across dimensions.
   The player keeps their facing.
11. **Immovable block.** The block is defined so a piston cannot move it, if
    the stable block definition allows that; otherwise the builder decides how
    to keep coordinates from going stale.
12. **Limits.** Up to 64 entries. The registry carries a version field. The
    list form is paged when it is long.
13. **Group order.** The Building Tools group becomes: Selection Wand, blade
    switch, wide blade switch, road paver switch, warp tool, warp block. The
    new items are appended, so the existing order stays unchanged.
14. **Feature placement.** A new `warp` feature in domain, application, and
   infrastructure, wired through its infrastructure install function, with no
   imports from other features.

## Calls made by the writer, not the user

- Name entered at placement and editable by a sneaking press on the block; it
  is not drawn on the block itself.
- Anyone can break a warp block, and the entry disappears with it.
- The warp tool is held and used with an air press, not on a block.
- Sort order: current dimension first, then by distance.
- Unloaded entries stay and are labelled "unverified".
- Blocks placed without a player are not registered; the form is retried a
  few times and then the default name stays.
- Unverified entries can be chosen, with a check and a message on arrival.
- Pistons cannot move the block; dimensions: all three; 64 entries, paged.
- New items are appended to the end of the Building Tools group.
- The `warp` feature folder, and its separation from the existing `build`
  feature.
- Crafting recipes for the block and the tool: left to the builder. Match the
  Build Wand's style: always unlocked, cheap vanilla materials.

## Left to the builder

- The exact block geometry, texture, and the tool's pixel art.
- The recipes, the lang strings, and the default name wording.
- How to split the stored registry, and the form's paging if the list is long.
- The landing-spot search rules.
- Whether the name form and the list form reuse `choiceForm.ts`.

## Documentation and tests

- Add a spec for the area (for example `docs/specs/warp.md`) and register it in
  the specs index. Add an ADR for the decisions above, and run `pnpm run docs`.
  Update `docs/specs/build-tools.md`, which fixes the Building Tools group
  contents and order, and the ADR that defines the group order (0178).
- Pure logic (ordering, pruning, default names, landing choice) gets
  property-based tests with fast-check (ADR 0010).
- An in-game scenario covers placement, the list, and teleport. It needs a
  `CATALOG` entry in `src/test-pack/catalog.ts` and an entry in
  `src/test-pack/scenarios/index.ts`. Scenarios that need a connected player
  are skipped in CI, so the manual check on a real player is recorded.
- Before saying it is done: `pnpm lint`, `pnpm lint:lang`, `pnpm lint:docs`,
  `pnpm lint:unused`, `pnpm lint:deps`, `pnpm typecheck`, `pnpm test`,
  `pnpm build`, restart the dev server, and run `pnpm test:game`.
