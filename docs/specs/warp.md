# Warp

- Scope: The shared warp registry, the warp block and warp tool, naming, the warp list, teleport, removal and pruning, storage, and limits.
- Verified at: 8c5203d8
- Source: [0249](../adr/0249-shared-warp-points-with-a-block-and-a-tool.md)

## Rules

### Registration

- Applies to: Placing `yasu_build:warp_block`.
- Rule: A block placed by a player registers one warp point holding a unique id, the name, the owner's player name, the dimension id, and the block cell. Blocks placed without a player are not registered. A full registry removes the placed block and returns one item through the inventory, dropping overflow at the player; Creative players need no refund. Placement flows hold the shared form guard until they finish, without suppressing registration.
- Agreement: Proposed
- Basis: [0249](../adr/0249-shared-warp-points-with-a-block-and-a-tool.md) Decision 4.
- Implementation: `src/infrastructure/warp/handlers/placement.ts`, `src/application/warp/registerWarpPoint.ts`, `src/infrastructure/warp/install.ts`, and `src/infrastructure/bootstrap.ts`.
- Verification: `tests/infrastructure/warp/handlers.test.ts` covers placement filtering and full-registry rollback; `tests/application/warp/registerWarpPoint.test.ts` covers registration. The in-game scenario and manual check remain planned in #1781.

### Naming

- Applies to: The name form at placement and the sneaking press on a warp block.
- Rule: Names are trimmed and at most 32 characters. A cancelled or empty name at placement uses "Warp N" with the lowest free N. An empty edit keeps the old name. Any player may edit any name.
- Agreement: Proposed
- Basis: [0249](../adr/0249-shared-warp-points-with-a-block-and-a-tool.md) Decisions 3 and 4.
- Implementation: `src/application/warp/registerWarpPoint.ts`, `src/application/warp/renameWarpPoint.ts`, `src/infrastructure/warp/bedrock/bedrockWarpMenus.ts`, `src/infrastructure/warp/handlers/blockInteract.ts`, and `src/infrastructure/warp/handlers/formGuard.ts`.
- Verification: `tests/domain/warp/names.test.ts`, `tests/application/warp/registerWarpPoint.test.ts`, `tests/application/warp/editWarpPoint.test.ts`, `tests/infrastructure/warp/menus.test.ts`, and `tests/infrastructure/warp/handlers.test.ts` cover naming, forms, and sneak routing; `tests/infrastructure/warp/formGuard.test.ts` checks per-player debounce and busy flows.

### List

- Applies to: Opening the list by a right-click on the block or any press of `yasu_build:warp_tool`.
- Rule: The list shows name, owner, dimension, and coordinates per entry. The player's current dimension comes first ordered by distance, then other dimensions. A long list is paged. Block and tool presses share a per-player guard: presses within 5 ticks and presses while a warp form flow is pending are ignored. Tool air and block before-events cancel the vanilla action and defer the list through `system.run`; held block repeats are ignored.
- Agreement: Proposed
- Basis: [0249](../adr/0249-shared-warp-points-with-a-block-and-a-tool.md) Decisions 1, 2, and 6.
- Implementation: `src/application/warp/openWarpList.ts`, `src/domain/warp/warpOrder.ts`, `src/infrastructure/warp/bedrock/bedrockWarpMenus.ts`, `src/infrastructure/warp/handlers/blockInteract.ts`, `src/infrastructure/warp/handlers/tool.ts`, and `src/infrastructure/warp/install.ts`.
- Verification: `tests/domain/warp/orderLanding.test.ts`, `tests/application/warp/openWarpList.test.ts`, and `tests/infrastructure/warp/menus.test.ts` cover ordering, pruning, paging, and labels. `tests/infrastructure/warp/handlers.test.ts` covers tool cancellation, deferred forms, duplicate events, and busy-player suppression.

### Teleport

- Applies to: Choosing an entry in the list.
- Rule: Landing selection takes the first standable cell above the block, beside it at block height, or beside it one cell higher, in that order; if none is standable, it falls back to the cell above the block. A cell is standable when its floor is solid and not liquid, its feet and head cells are air or passable non-liquid blocks, and none of those three cells is lava, flowing lava, fire, soul fire, cactus, or magma. A missing cell or an engine error makes the cell non-standable. The player lands at the centre of the chosen cell (`x + 0.5, y, z + 0.5`), in the point's dimension, keeping the facing because no rotation is passed to teleport. A missing or invalid player, or a teleport that throws, returns `false` to the use case, which reports a failed teleport. A point already known to be gone is removed with feedback before teleporting. An unverified entry may be chosen; after a successful teleport, its block is checked immediately and then every 5 ticks for up to 100 ticks while unloaded. A gone block removes the entry with feedback; a still-unloaded point is kept.
- Agreement: Proposed
- Basis: [0249](../adr/0249-shared-warp-points-with-a-block-and-a-tool.md) Decisions 7 and 10.
- Implementation: `src/infrastructure/warp/bedrock/bedrockWarpWorld.ts`, `src/domain/warp/landing.ts`, `src/application/warp/warpTo.ts`, `src/domain/warp/spec.ts`, `src/infrastructure/warp/bedrock/systemWarpTicks.ts`.
- Verification: Mocked unit tests in `tests/infrastructure/warp/bedrockWarp.test.ts`; landing-choice property tests in `tests/domain/warp/orderLanding.test.ts` and `tests/application/warp/warpTo.test.ts`, with application tests for arrival rechecks and failure feedback. The in-game scenario and manual check remain planned in #1781.

### Removal and pruning

- Applies to: Breaking a warp block, and block checks when opening the list or teleporting.
- Rule: Breaking the block removes its entry; the removal use case removes the entry at the supplied dimension and block cell, through the player break event handler. A point's block is checked with `getBlock`: a warp block is present, and only a loaded cell holding another block counts as gone. A return value of `undefined` or any engine error counts as unloaded. When the list opens, gone entries are removed; unloaded entries are kept and labelled "unverified". Teleport uses the same presence check before departure and when rechecking an unverified arrival.
- Agreement: Proposed
- Basis: [0249](../adr/0249-shared-warp-points-with-a-block-and-a-tool.md) Decisions 5 and 6.
- Implementation: `src/infrastructure/warp/bedrock/bedrockWarpWorld.ts`, `src/domain/warp/presence.ts`, `src/application/warp/removeWarpPoint.ts`, `src/infrastructure/warp/handlers/removal.ts`, `src/application/warp/openWarpList.ts`, `src/application/warp/warpTo.ts`.
- Verification: Mocked event tests in `tests/infrastructure/warp/handlers.test.ts` cover removal filtering; adapter tests in `tests/infrastructure/warp/bedrockWarp.test.ts` and pruning property tests in `tests/application/warp/openWarpList.test.ts` and arrival recheck tests in `tests/application/warp/warpTo.test.ts` cover stale entries. The in-game scenario and manual check remain planned in #1781.

### Storage

- Applies to: The registry across restarts.
- Rule: One world-level registry lives in the world's dynamic properties, shared by all players, with a version field. The snapshot JSON is split into chunks of at most 10,000 UTF-16 code units under `yasu_build:warp_registry:<bank>:<index>`, where the bank is 0 or 1. The published value of `yasu_build:warp_registry:count` is `<bank>:<count>`. A save writes the chunks into the bank the published value does not reference, then writes the count last in one write, then deletes the old bank's chunks, so a failed save leaves the previously published registry readable. A missing count loads an empty registry; an invalid count, a missing or non-string chunk, malformed JSON, or an unsupported snapshot version loads as unreadable (`undefined`) and is never overwritten. Reads are lazy and uncached. The warp install function supplies the store to every use case and is called once by bootstrap.
- Agreement: Proposed
- Basis: [0249](../adr/0249-shared-warp-points-with-a-block-and-a-tool.md) Decision 8.
- Implementation: `src/infrastructure/warp/identifiers.ts`; `src/infrastructure/warp/persistence/chunks.ts`; `src/infrastructure/warp/persistence/dynamicPropertyWarpRegistryStore.ts`; `src/infrastructure/warp/install.ts`; `src/infrastructure/bootstrap.ts`.
- Verification: `tests/infrastructure/warp/chunks.test.ts` checks string round trips, chunk bounds and invalid sizes; `tests/infrastructure/warp/dynamicPropertyWarpRegistryStore.test.ts` checks lazy reads, registry round trips, unreadable data, chunk sizes, count-last writes, old-bank cleanup, and that a failed overwrite keeps the old registry readable, using a mocked world. Engine persistence is not verified in game; the round trip is planned for the in-game scenarios.

### Limits

- Applies to: The size of the registry and the block's behavior.
- Rule: The registry holds at most 64 entries. The block can be placed in all three dimensions and cannot be moved by a piston where the block definition allows that.
- Agreement: Proposed
- Basis: [0249](../adr/0249-shared-warp-points-with-a-block-and-a-tool.md) Decisions 9, 10, and 11.
- Implementation: `src/domain/warp/warpRegistry.ts`, `src/domain/warp/spec.ts`, `src/infrastructure/warp/handlers/placement.ts`, and `packs/yasu_ride_bp/blocks/yasu_build/warp_block.block.json`.
- Verification: `tests/domain/warp/registry.test.ts` checks the registry limit; `tests/infrastructure/warp/handlers.test.ts` checks full-registry rollback.

## Open issues

- Event handlers, adapters, pack definitions, and bootstrap installation are implemented. The in-game scenarios and PC/touch manual check remain in #1781; ADR 0249 stays Proposed until that check passes.
- The Warp Block can still be moved by a piston: the block definition omits `minecraft:movable` because of the block format version (see the Open issues in [build-tools.md](build-tools.md)). A piston-moved block leaves its warp point at the old cell, which the list prunes as gone.
- Teleporting into an unloaded chunk is unmeasured. #1781 (11/11) adds a probe scenario; until then, a throwing teleport is reported as a failed teleport by `src/infrastructure/warp/bedrock/bedrockWarpWorld.ts` and `src/application/warp/warpTo.ts`.
