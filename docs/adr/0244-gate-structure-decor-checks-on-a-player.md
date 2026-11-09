# 0244. Gate structure decor checks on a player

- Status: Proposed
- Acceptance condition: build_structure_decor_probe runs with a logged-in player and the owner agrees with its results
- Date: 2026-11-10
- Supersedes in part: [0186](0186-stream-in-game-results-and-bound-runs-by-progress.md): the 300-tick declared budget for the player-driven structure decor probe only
- Related: [0001](0001-bedrock-addon-with-stable-script-api.md): stable API only
- Related: [0243](0243-copy-the-build-wand-box-as-an-engine-structure.md): item-frame contents and painting coverage

## Context

Stable APIs cannot populate an item frame or create a painting. The owner chose to run checks needing real player interaction only with a logged-in player, allowing CI to skip them. The existing `needsPlayer` catalog gate already implements that selection. The requested setup window of 1,200 ticks exceeds the catalog's 300-tick budget and the runner's 60-second stall watch.

## Decision

Register `build_structure_decor_probe` with `needsPlayer: true` and exclusive isolation. The player places a frame, inserts a diamond, and hangs a painting when prompted. Poll setup every ten ticks for up to 1,200 ticks; report incomplete setup as a fixture failure. Validate frame observation by breaking the original with `setblock ... destroy` and finding the diamond drop before testing the Memory structure round trip. Restore the player's inventory and position in cleanup.

Allow only this player-gated scenario a declared budget of 1,300 ticks. Stream setup polling progress every 200 ticks through the existing step callback; leave the stall watch and other scenario budgets unchanged. All other `build_structure_probe` checks remain headless with their existing assertions. No CI workflow change is needed: the catalog gate skips decor checks when no player is logged in.

## Consequences

CI cannot establish preservation of item-frame contents or paintings. The decor checks remain unverified until run with a logged-in player; manual row BT32 records that verification. A failed original observation establishes a fixture failure rather than evidence of structure data loss. The longer budget applies only to this interactive fixture and does not relax the headless scenario limit.
