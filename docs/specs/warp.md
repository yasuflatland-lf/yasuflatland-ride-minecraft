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
- Rule: The player is teleported across dimensions if needed, keeping the facing, to a safe spot on or beside the block, with the top of the block as the fallback. An unverified entry may be chosen; the block is checked on arrival and the entry is removed with a message to the player if it is gone.
- Agreement: Proposed
- Basis: [0249](../adr/0249-shared-warp-points-with-a-block-and-a-tool.md) Decisions 7 and 10.
- Implementation: `docs/superpowers/specs/2026-11-16-warp-block-and-tool-design.md` (design only; the `warp` feature is planned).
- Verification: None yet. Property tests for the landing choice and the in-game scenario are planned.

### Removal and pruning

- Applies to: Breaking a warp block and opening the list.
- Rule: Breaking the block removes its entry. When the list opens, an entry whose chunk is loaded and whose block is gone is removed; an entry in an unloaded chunk is kept and labelled "unverified".
- Agreement: Proposed
- Basis: [0249](../adr/0249-shared-warp-points-with-a-block-and-a-tool.md) Decisions 5 and 6.
- Implementation: `docs/superpowers/specs/2026-11-16-warp-block-and-tool-design.md` (design only; the `warp` feature is planned).
- Verification: None yet. Property tests for pruning are planned.

### Storage

- Applies to: The registry across restarts.
- Rule: One world-level registry lives in the world's dynamic properties, shared by all players, with a version field. The snapshot JSON is split into chunks of at most 10,000 UTF-16 code units under `yasu_build:warp_registry:<bank>:<index>`, where the bank is 0 or 1. The published value of `yasu_build:warp_registry:count` is `<bank>:<count>`. A save writes the chunks into the bank the published value does not reference, then writes the count last in one write, then deletes the old bank's chunks, so a failed save leaves the previously published registry readable. A missing count loads an empty registry; an invalid count, a missing or non-string chunk, malformed JSON, or an unsupported snapshot version loads as unreadable (`undefined`) and is never overwritten. Reads are lazy and uncached. The store is not wired into the composition root yet.
- Agreement: Proposed
- Basis: [0249](../adr/0249-shared-warp-points-with-a-block-and-a-tool.md) Decision 8.
- Implementation: `src/infrastructure/warp/identifiers.ts`; `src/infrastructure/warp/persistence/chunks.ts`; `src/infrastructure/warp/persistence/dynamicPropertyWarpRegistryStore.ts`
- Verification: `tests/infrastructure/warp/chunks.test.ts` checks string round trips, chunk bounds and invalid sizes; `tests/infrastructure/warp/dynamicPropertyWarpRegistryStore.test.ts` checks lazy reads, registry round trips, unreadable data, chunk sizes, count-last writes, old-bank cleanup, and that a failed overwrite keeps the old registry readable, using a mocked world. Engine persistence is not verified in game; the round trip is planned for the in-game scenarios.

### Limits

- Applies to: The size of the registry and the block's behavior.
- Rule: The registry holds at most 64 entries. The block can be placed in all three dimensions and cannot be moved by a piston where the block definition allows that.
- Agreement: Proposed
- Basis: [0249](../adr/0249-shared-warp-points-with-a-block-and-a-tool.md) Decisions 9, 10, and 11.
- Implementation: `docs/superpowers/specs/2026-11-16-warp-block-and-tool-design.md` (design only; the `warp` feature is planned).
- Verification: None yet. A limit property test is planned.

## Open issues

- Nothing in this spec is implemented yet. Every rule above is planned: the domain, application, and infrastructure `warp` feature, the block and tool definitions, the icon and texture, the lang strings, and the Building Tools group order. The implementation PRs of the series (#1773 to #1780) replace the design document in each rule's Implementation field and remove this issue; the manual check in #1781 decides whether ADR 0249 is Accepted.
- ADR 0178 and the Building Tools rules in `build-tools.md` still list the group without the warp tool and block; #1775 changes them together with the group change.
