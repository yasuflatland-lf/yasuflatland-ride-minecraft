# Warp

- Scope: The shared warp registry, the warp block and warp tool, naming, the warp list, teleport, removal and pruning, storage, and limits.
- Verified at: 8c5203d8
- Source: [0249](../adr/0249-shared-warp-points-with-a-block-and-a-tool.md)

## Rules

### Registration

- Applies to: Placing `yasu_build:warp_block`.
- Rule: A block placed by a player registers one warp point holding a unique id, the name, the owner's player name, the dimension id, and the block cell. Blocks placed without a player are not registered.
- Agreement: Proposed
- Basis: [0249](../adr/0249-shared-warp-points-with-a-block-and-a-tool.md) Decision 4.
- Implementation: `docs/superpowers/specs/2026-11-16-warp-block-and-tool-design.md` (design only; the `warp` feature is planned).
- Verification: None yet. The in-game scenario and the manual check are planned in #1780 and #1781.

### Naming

- Applies to: The name form at placement and the sneaking press on a warp block.
- Rule: Names are trimmed and at most 32 characters. A cancelled or empty name at placement uses "Warp N" with the lowest free N. An empty edit keeps the old name. Any player may edit any name.
- Agreement: Proposed
- Basis: [0249](../adr/0249-shared-warp-points-with-a-block-and-a-tool.md) Decisions 3 and 4.
- Implementation: `docs/superpowers/specs/2026-11-16-warp-block-and-tool-design.md` (design only; the `warp` feature is planned).
- Verification: None yet. Property tests for the default name are planned.

### List

- Applies to: Opening the list by a right-click on the block or any press of `yasu_build:warp_tool`.
- Rule: The list shows name, owner, dimension, and coordinates per entry. The player's current dimension comes first ordered by distance, then other dimensions. A long list is paged.
- Agreement: Proposed
- Basis: [0249](../adr/0249-shared-warp-points-with-a-block-and-a-tool.md) Decisions 1, 2, and 6.
- Implementation: `docs/superpowers/specs/2026-11-16-warp-block-and-tool-design.md` (design only; the `warp` feature is planned).
- Verification: None yet. Property tests for ordering and paging are planned.

### Teleport

- Applies to: Choosing an entry in the list.
- Rule: Landing selection takes the first standable cell above the block, beside it at block height, or beside it one cell higher, in that order; if none is standable, it falls back to the cell above the block. A cell is standable when its floor is solid and not liquid, its feet and head cells are air or passable non-liquid blocks, and none of those three cells is lava, flowing lava, fire, soul fire, cactus, or magma. A missing cell or an engine error makes the cell non-standable. The player lands at the centre of the chosen cell (`x + 0.5, y, z + 0.5`), in the point's dimension, keeping the facing because no rotation is passed to teleport. A missing or invalid player, or a teleport that throws, returns `false` to the use case, which reports a failed teleport. A point already known to be gone is removed with feedback before teleporting. An unverified entry may be chosen; after a successful teleport, its block is checked immediately and then every 5 ticks for up to 100 ticks while unloaded. A gone block removes the entry with feedback; a still-unloaded point is kept.
- Agreement: Proposed
- Basis: [0249](../adr/0249-shared-warp-points-with-a-block-and-a-tool.md) Decisions 7 and 10.
- Implementation: `src/infrastructure/warp/bedrock/bedrockWarpWorld.ts`, `src/domain/warp/landing.ts`, `src/application/warp/warpTo.ts`, `src/domain/warp/spec.ts`, `src/infrastructure/warp/bedrock/systemWarpTicks.ts`.
- Verification: Mocked unit tests in `tests/infrastructure/warp/bedrockWarp.test.ts`; landing-choice property tests in `tests/domain/warp/orderLanding.test.ts` and `tests/application/warp/warpTo.test.ts`, with application tests for arrival rechecks and failure feedback. The in-game scenario and manual check remain planned in #1780 and #1781.

### Removal and pruning

- Applies to: Breaking a warp block, and block checks when opening the list or teleporting.
- Rule: Breaking the block removes its entry; the removal use case removes the entry at the supplied dimension and block cell, and the break event handler that calls it is planned. A point's block is checked with `getBlock`: a warp block is present, and only a loaded cell holding another block counts as gone. A return value of `undefined` or any engine error counts as unloaded. When the list opens, gone entries are removed; unloaded entries are kept and labelled "unverified". Teleport uses the same presence check before departure and when rechecking an unverified arrival.
- Agreement: Proposed
- Basis: [0249](../adr/0249-shared-warp-points-with-a-block-and-a-tool.md) Decisions 5 and 6.
- Implementation: `src/infrastructure/warp/bedrock/bedrockWarpWorld.ts`, `src/domain/warp/presence.ts`, `src/application/warp/removeWarpPoint.ts`, `src/application/warp/openWarpList.ts`, `src/application/warp/warpTo.ts`.
- Verification: Mocked unit tests in `tests/infrastructure/warp/bedrockWarp.test.ts`; pruning property tests in `tests/application/warp/openWarpList.test.ts` and arrival recheck tests in `tests/application/warp/warpTo.test.ts`. The in-game scenario and manual check remain planned in #1780 and #1781.

### Storage

- Applies to: The registry across restarts.
- Rule: One world-level registry lives in the world's dynamic properties, shared by all players, with a version field, split across keys when a string would exceed the property size limit.
- Agreement: Proposed
- Basis: [0249](../adr/0249-shared-warp-points-with-a-block-and-a-tool.md) Decision 8.
- Implementation: `docs/superpowers/specs/2026-11-16-warp-block-and-tool-design.md` (design only; the `warp` feature is planned).
- Verification: None yet. Round-trip property tests are planned.

### Limits

- Applies to: The size of the registry and the block's behavior.
- Rule: The registry holds at most 64 entries. The block can be placed in all three dimensions and cannot be moved by a piston where the block definition allows that.
- Agreement: Proposed
- Basis: [0249](../adr/0249-shared-warp-points-with-a-block-and-a-tool.md) Decisions 9, 10, and 11.
- Implementation: `docs/superpowers/specs/2026-11-16-warp-block-and-tool-design.md` (design only; the `warp` feature is planned).
- Verification: None yet. A limit property test is planned.

## Open issues

- The domain registry, naming, ordering, paging, pruning, landing selection, and snapshots, the application use cases, and the infrastructure identifiers, block check, teleport, player lookup, and tick adapters exist on this branch. ADR 0249 Decisions 1 to 5, 8, and 11 to 14 describe game integration that is still planned: placement, break, and interaction event handlers, menu, feedback, and world dynamic-property storage adapters, block and tool definitions, the icon and texture, lang strings, the Building Tools group order, and installation wired into bootstrap. The implementation series (#1773 to #1780) must complete that integration and update the remaining design-only references; ADR 0249 needs an edit or a superseding ADR if the completed implementation differs. The manual check in #1781 decides whether ADR 0249 is Accepted.
- Teleporting into an unloaded chunk is unmeasured. #1781 (11/11) adds a probe scenario; until then, a throwing teleport is reported as a failed teleport by `src/infrastructure/warp/bedrock/bedrockWarpWorld.ts` and `src/application/warp/warpTo.ts`.
- ADR 0178 and the Building Tools rules in `build-tools.md` still list the group without the warp tool and block; #1775 changes them together with the group change.
