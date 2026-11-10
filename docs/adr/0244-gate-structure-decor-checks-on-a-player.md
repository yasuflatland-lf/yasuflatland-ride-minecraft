# 0244. Gate structure decor checks on a player

- Status: Accepted
- Date: 2026-11-10
- Supersedes in part: [0186](0186-stream-in-game-results-and-bound-runs-by-progress.md): the 300-tick declared budget for the three player-driven structure decor scenarios only
- Related: [0001](0001-bedrock-addon-with-stable-script-api.md): stable API only
- Related: [0243](0243-copy-the-build-wand-box-as-an-engine-structure.md): item-frame contents and painting coverage

## Context

Stable APIs cannot populate an item frame or create a painting. The owner chose to run checks needing real player interaction only with a logged-in player, allowing CI to skip them. The existing `needsPlayer` catalog gate already implements that selection. The requested setup window of 1,200 ticks exceeds the catalog's 300-tick budget and the runner's 60-second stall watch.

## Decision

Register `build_structure_decor_probe`, `build_structure_store_decor`, and `build_paste_structure_decor` with `needsPlayer: true` and exclusive isolation. The player places a frame, inserts a diamond, and hangs a painting when prompted. Poll setup every ten ticks for up to 1,200 ticks; report incomplete setup as a fixture failure. Validate frame observation by breaking the original with `setblock ... destroy` and finding the diamond drop before testing the round trip. `build_structure_decor_probe` uses an engine Memory structure; `build_structure_store_decor` exercises the `BedrockStructureStore` adapter through capture, clearEntities, clearBlocks, and place, checking painting removal and the absence of drops after clearing. `build_paste_structure_decor` captures a structure clipboard and exercises the Build Wand paste path over an empty matching frame, observing the pasted diamond drop and exactly one painting after each of two pastes. Capture precedes breaking the original frame to prove its contents. `build_paste_structure` retains its frame block, chest, sign, cow replacement, and protected-cell refusal checks; it remains player-gated because it needs a connected builder. Restore the player's inventory, selected slot, position, and rotation in cleanup.

Allow only these three player-gated scenarios a declared budget of 1,300 ticks. Stream setup polling progress every 200 ticks through the existing step callback; leave the stall watch and other scenario budgets unchanged. All other `build_structure_probe` checks remain headless with their existing assertions. `build_structure_store` stays headless with its chest, sign, cow, excluded armor stand, clear, place, too-large, and cleanup checks unchanged. No CI workflow change is needed: the catalog gate skips decor checks when no player is logged in.

## Consequences

CI cannot establish preservation of item-frame contents or paintings. The decor checks passed on the dev BDS with a logged-in player on 2026-11-10; manual row BT32 records engine Memory structure verification, BT33 records the store adapter round trip, and BT35 records Build Wand paste decor replacement. A failed original observation establishes a fixture failure rather than evidence of structure data loss. The longer budget applies only to these three interactive fixtures and does not relax the headless scenario limit.

| Manual row                | Check                                                                                                                                                                                 | Status                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| [BT35](../manual-test.md) | With a logged-in player, set up a frame with a diamond and a painting for `build_paste_structure_decor`; verify frame contents after paste and painting replacement on repeated paste | verified on the dev BDS with a logged-in player (2026-11-10); skipped in CI |
