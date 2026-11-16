# Warp

- Scope: The shared warp registry, the warp block and warp tool, naming, the warp list, teleport, removal and pruning, storage, and limits.
- Verified at: ae691fa7
- Source: [0249](../adr/0249-shared-warp-points-with-a-block-and-a-tool.md)

## Rules

### Registration

- Applies to: Placing `yasu_build:warp_block`.
- Rule: A block placed by a player registers one warp point holding a unique id, the name, the owner's player name, the dimension id, and the block cell. Blocks placed without a player are not registered. A full registry removes the placed block and returns one item through the inventory, dropping overflow at the player; Creative players need no refund. Placement flows hold the shared form guard until they finish, without suppressing registration. The default name is saved before the name form opens, so cancellation or a never-answered form leaves the registered point intact. The registry rejects duplicate ids and occupied dimension/cell pairs; the placement use case treats an already registered cell as registered.
- Agreement: Proposed
- Basis: [0249](../adr/0249-shared-warp-points-with-a-block-and-a-tool.md) Decision 4.
- Implementation: `src/infrastructure/warp/handlers/placement.ts`, `src/application/warp/registerWarpPoint.ts`, `src/infrastructure/warp/install.ts`, and `src/infrastructure/bootstrap.ts`.
- Verification: `tests/infrastructure/warp/handlers.test.ts` covers placement filtering and full-registry rollback; `tests/application/warp/registerWarpPoint.test.ts` covers registration. `warp_flow` exercises the use cases with a connected player and scripted menu answers; actual placement and break events and PC/touch input remain a manual check.

### Naming

- Applies to: The name form at placement and the sneaking press on a warp block.
- Rule: Names are trimmed and cut to at most 32 Unicode code points; an empty result is rejected. A cancelled or empty name at placement keeps "Warp N" with the lowest free N. An empty edit keeps the old name. Any player may edit any name. The single text field starts blank at placement and defaults to the current name when editing. Submission enforces the length because the stable form API has no text length limit. A busy name form is retried up to five times, every 10 ticks; any other cancellation closes it. A submitted name applies to the current registry entry, so a point removed while the form was open is not recreated.
- Agreement: Proposed
- Basis: [0249](../adr/0249-shared-warp-points-with-a-block-and-a-tool.md) Decisions 3 and 4.
- Implementation: `src/application/warp/registerWarpPoint.ts`, `src/application/warp/renameWarpPoint.ts`, `src/infrastructure/warp/bedrock/bedrockWarpMenus.ts`, `src/infrastructure/warp/handlers/blockInteract.ts`, and `src/infrastructure/warp/handlers/formGuard.ts`.
- Verification: `tests/domain/warp/names.test.ts`, `tests/application/warp/registerWarpPoint.test.ts`, `tests/application/warp/editWarpPoint.test.ts`, `tests/infrastructure/warp/menus.test.ts`, and `tests/infrastructure/warp/handlers.test.ts` cover naming, forms, and sneak routing; `tests/infrastructure/warp/formGuard.test.ts` checks per-player debounce and busy flows. `warp_flow` checks the saved default, naming, rename and an empty edit with scripted answers; rendered forms remain a manual check.

### List

- Applies to: Opening the list by a right-click on the block or any press of `yasu_build:warp_tool`.
- Rule: The list shows name, owner, translated dimension name (raw id for unknown dimensions), block coordinates, and an "Unverified" suffix for unloaded points. The player's current dimension comes first ordered by squared distance, then other dimensions by dimension id; ties use name then id. Pages hold 16 points and clamp out-of-range indices. Previous and next buttons follow the entries only when those pages exist. A busy or cancelled list form closes the flow; only name forms retry. Block and tool presses share a per-player guard: presses within 5 ticks and presses while a warp form flow is pending are ignored. Tool air and block before-events cancel the vanilla action and defer the list through `system.run`; held block repeats are ignored.
- Agreement: Proposed
- Basis: [0249](../adr/0249-shared-warp-points-with-a-block-and-a-tool.md) Decisions 1, 2, and 6.
- Implementation: `src/application/warp/openWarpList.ts`, `src/domain/warp/warpOrder.ts`, `src/infrastructure/warp/bedrock/bedrockWarpMenus.ts`, `src/infrastructure/warp/handlers/blockInteract.ts`, `src/infrastructure/warp/handlers/tool.ts`, and `src/infrastructure/warp/install.ts`.
- Verification: `tests/domain/warp/orderLanding.test.ts`, `tests/application/warp/openWarpList.test.ts`, and `tests/infrastructure/warp/menus.test.ts` cover ordering, pruning, paging, and labels. `tests/infrastructure/warp/handlers.test.ts` covers tool cancellation, deferred forms, duplicate events, and busy-player suppression. `warp_flow` checks the list entries and selection through scripted menus; paging and visible labels require the PC/touch check.

### Teleport

- Applies to: Choosing an entry in the list.
- Rule: Landing selection takes the first standable cell above the block, beside it at block height, or beside it one cell higher, in that order; if none is standable, it falls back to the cell above the block. A cell is standable when its floor is solid and not liquid, its feet and head cells are air or passable non-liquid blocks, and none of those three cells is lava, flowing lava, fire, soul fire, cactus, or magma. A missing cell or an engine error makes the cell non-standable. The player lands at the centre of the chosen cell (`x + 0.5, y, z + 0.5`), in the point's dimension, keeping the facing because no rotation is passed to teleport. A missing or invalid player, or a teleport that throws, returns `false` to the use case, which reports a failed teleport. A point already known to be gone is removed with feedback before teleporting. An unverified entry may be chosen; after a successful teleport, its block is checked immediately and then every 5 ticks for up to 100 ticks while unloaded. A gone block removes the entry with feedback; a still-unloaded point is kept.
- Agreement: Proposed
- Basis: [0249](../adr/0249-shared-warp-points-with-a-block-and-a-tool.md) Decisions 7 and 10.
- Implementation: `src/infrastructure/warp/bedrock/bedrockWarpWorld.ts`, `src/domain/warp/landing.ts`, `src/application/warp/warpTo.ts`, `src/domain/warp/spec.ts`, `src/infrastructure/warp/bedrock/systemWarpTicks.ts`.
- Verification: Mocked unit tests in `tests/infrastructure/warp/bedrockWarp.test.ts`; landing-choice property tests in `tests/domain/warp/orderLanding.test.ts` and `tests/application/warp/warpTo.test.ts`, with application tests for arrival rechecks and failure feedback. `warp_world` checks real presence, landing choices and a summoned entity's teleport location and rotation; `warp_flow` checks the player-only adapter through list selection. `warp_engine_probes` records unloaded teleport behavior. These scenarios have not yet run on BDS; cross-dimension PC/touch checks remain pending.

### Removal and pruning

- Applies to: Breaking a warp block, and block checks when opening the list or teleporting.
- Rule: Breaking the block removes its entry; the removal use case removes the entry at the supplied dimension and block cell, through the player break event handler. A point's block is checked with `getBlock`: a warp block is present, and only a loaded cell holding another block counts as gone. A return value of `undefined` or any engine error counts as unloaded. When the list opens, gone entries are removed and saved only if anything was removed; unloaded entries are kept and labelled "unverified". Teleport uses the same presence check before departure and when rechecking an unverified arrival.
- Agreement: Proposed
- Basis: [0249](../adr/0249-shared-warp-points-with-a-block-and-a-tool.md) Decisions 5 and 6.
- Implementation: `src/infrastructure/warp/bedrock/bedrockWarpWorld.ts`, `src/domain/warp/presence.ts`, `src/application/warp/removeWarpPoint.ts`, `src/infrastructure/warp/handlers/removal.ts`, `src/application/warp/openWarpList.ts`, `src/application/warp/warpTo.ts`.
- Verification: Mocked event tests in `tests/infrastructure/warp/handlers.test.ts` cover removal filtering; adapter tests in `tests/infrastructure/warp/bedrockWarp.test.ts` and pruning property tests in `tests/application/warp/openWarpList.test.ts` and arrival recheck tests in `tests/application/warp/warpTo.test.ts` cover stale entries. `warp_world` checks real block presence and `warp_flow` checks removal and list pruning through use cases. Actual break events remain a manual check.

### Storage

- Applies to: The registry across restarts.
- Rule: One world-level registry lives in the world's dynamic properties, shared by all players, with snapshot version 1. Invalid, duplicate and excess points in an otherwise readable snapshot are skipped. The snapshot JSON is split into chunks of at most 10,000 UTF-16 code units under `yasu_build:warp_registry:<bank>:<index>`, where the bank is 0 or 1. The published value of `yasu_build:warp_registry:count` is `<bank>:<count>`. A save writes the chunks into the bank the published value does not reference, then writes the count last in one write, then deletes the old bank's chunks, so a failed save leaves the previously published registry readable. A missing count loads an empty registry; an invalid count, a missing or non-string chunk, malformed JSON, or an unsupported snapshot version loads as unreadable (`undefined`) and is never overwritten. Reads are lazy and uncached. Naming, registration, list and teleport actions report an unreadable registry without writing; break removal silently leaves it untouched. Registry unreadable, registry full, point gone (including its name), no points and teleport failed feedback use the action bar. The warp install function supplies the store to every use case and is called once by bootstrap.
- Agreement: Proposed
- Basis: [0249](../adr/0249-shared-warp-points-with-a-block-and-a-tool.md) Decision 8.
- Implementation: `src/infrastructure/warp/identifiers.ts`; `src/infrastructure/warp/persistence/chunks.ts`; `src/infrastructure/warp/persistence/dynamicPropertyWarpRegistryStore.ts`; `src/infrastructure/warp/install.ts`; `src/infrastructure/bootstrap.ts`.
- Verification: `tests/infrastructure/warp/chunks.test.ts` checks string round trips, chunk bounds and invalid sizes; `tests/infrastructure/warp/dynamicPropertyWarpRegistryStore.test.ts` checks lazy reads, registry round trips, unreadable data, chunk sizes, count-last writes, old-bank cleanup, and that a failed overwrite keeps the old registry readable, using a mocked world. `warp_registry_store` exercises real dynamic properties with small, multi-chunk (64 points with 32-code-point names), then small snapshots, checks published bank/count values and old-bank deletion, and restores every original raw registry key in a finally block. It runs exclusively. Dynamic properties are pack-scoped (ADR 0010), so it exercises the production store implementation in the test pack, not the main pack's registry. This is a same-run round trip, not a server-restart durability test; its first BDS run is pending.

### Limits

- Applies to: The size of the registry and the block's behavior.
- Rule: The registry holds at most 64 entries. WARP_SPEC owns the point limit, name length, page size, 5-tick press debounce, 10-tick name retry delay, five retries, and arrival rechecks every 5 ticks up to 100 ticks. The warp domain lives in `src/domain/warp/` and imports only its own feature and `src/domain/shared/`. The block has no dimension restriction. Its format 1.21.80 definition omits `minecraft:movable`; piston immovability is not implemented.
- Agreement: Proposed
- Basis: [0249](../adr/0249-shared-warp-points-with-a-block-and-a-tool.md) Decisions 9, 10, and 11.
- Implementation: `src/domain/warp/warpRegistry.ts`, `src/domain/warp/spec.ts`, `src/infrastructure/warp/handlers/placement.ts`, and `packs/yasu_ride_bp/blocks/yasu_build/warp_block.block.json`.
- Verification: `tests/domain/warp/registry.test.ts` checks the registry limit; `tests/infrastructure/warp/handlers.test.ts` checks full-registry rollback. `warp_registry_store` round-trips the full 64-point registry; `warp_engine_probes` records piston behavior with a powered stone control. Neither has run on BDS yet.

### Pack definitions and art

- Applies to: Warp crafting, creative entries, block and tool visuals.
- Rule: The Warp Block is a full opaque cube with custom component `yasu_build:warp_block`. Its top uses `yasu_build_warp_block_top`, a scope on a dark panel; its sides and bottom use `yasu_build_warp_block_side`, a dark panel with one ring. `tools/terrain_texture_base.json` registers both in `terrain_texture.json`. The single-stack Warp Tool uses `yasu_build_warp_tool`, pointing to `textures/items/yasu_build/warp_tool.png`. Both have always-unlocked shapeless crafting-table recipes: compass and copper ingot for one tool; ender pearl, iron ingot and redstone for one block. Both append to the Building Tools group, tool then block. `tools/gen_warp_art.py` generates all three original radar-style textures, without copying the Dragon Radar.
- Agreement: Proposed
- Basis: [0249](../adr/0249-shared-warp-points-with-a-block-and-a-tool.md) Decisions 1, 2, 12 and 13.
- Implementation: `packs/yasu_ride_bp/blocks/yasu_build/warp_block.block.json`, `packs/yasu_ride_bp/items/yasu_build/warp_tool.item.json`, `packs/yasu_ride_bp/recipes/yasu_build/`, `tools/gen_warp_art.py`, `tools/gen_item_catalog.py`, `tools/item_texture_base.json`, and `tools/terrain_texture_base.json`.
- Verification: `tests/packs/buildTools.test.ts` and `tests/packs/warpArt.test.ts`; `warp_world` places the real block and `warp_engine_probes` measures piston behavior. Visual appearance and tool presses remain manual.

## Open issues

- The new scenarios have not run on BDS. Declared ticks are estimates. `warp_engine_probes` records piston movement and unloaded-chunk entity teleport outcomes; copy its output, the engine version and run date into ADR 0249 after a run. A throwing player teleport is reported as failed by the adapter and use case.
- Piston immovability remains unresolved: format 1.21.80 omits `minecraft:movable`, whose stable definition requires 1.21.100. Resolve format/custom-component compatibility before adding it (see [build-tools.md](build-tools.md)). Actual movement is unmeasured. If moved, the old registry cell is pruned when observed gone.
- PC and touch checks remain pending, including actual place/break and tool/block events, rendered name/list forms and paging, cross-dimension teleport, and arrival at a broken block. `warp_flow` supplies scripted menu answers to use cases and does not verify event subscriptions or form rendering. ADR 0249 remains Proposed until the manual acceptance condition passes.
