# 0249. Shared warp points with a block and a tool

- Status: Proposed
- Acceptance condition: the manual check on PC and touch in #1781 (11/12) and the block protection gestures in #1800 (12/12) pass
- Date: 2026-11-16
- Extends: [0178](0178-bulldozer-build-tools-in-a-separate-namespace.md): the `yasu_build:` namespace and the Building Tools group
- Related: [0229](0229-open-build-utilities-with-a-plain-air-press.md): the plain air press that opens a build utility
- Related: [0243](0243-copy-the-build-wand-box-as-an-engine-structure.md): the Build Wand clipboard leaves Warp Blocks out

## Context

Players on the home LAN server build in several places far apart. They want to jump between build sites, jump to another player's base, and mark their own reference points. Walking or flying is slow and coordinates are hard to remember. The feature is a build tool in the family of the Build Wand, not a vehicle.

The stable Script API cannot enumerate blocks in the world, so a list of warp points has to come from placement and break events, not from a scan. Custom blocks already exist in the Behavior Pack, so a new block is not a new technique.

Alternatives considered for opening the list:

- A "warp" entry in the Build Wand's utility menu. It fits the build tools but needs the wand in hand and adds nothing at the warp block.
- Block right-click only. It works like a portal, but a player far from any block cannot open the list.
- Block right-click plus a separate warp tool. Both open the same form. Chosen by the owner; the wand menu entry is dropped.

Alternatives considered for knowing the warp points:

- Record them from placement and break events in a stored registry. Chosen: it is the only approach the stable API supports.
- Scan loaded chunks for the block. Rejected as unreliable and slow.

Alternatives considered for the block:

- The vanilla beacon. Rejected: its beam and pyramid behavior get in the way, it cannot be told apart from other beacons, and it has no clean place for a name.
- A dedicated custom block. Chosen.

## Decision

1. **Warp block.** `yasu_build:warp_block`, one kind, in the Building Tools group. A use (right-click on PC, tap on touch) opens the warp list once the tap window passes (5). A hit (left-click on PC, a long press on touch, a Creative break attempt) opens the name edit form. No gesture needs sneaking: on a phone against the dev BDS (2026-11-18), a sneaking tap never opened the earlier sneak-to-rename form.
2. **Warp tool.** `yasu_build:warp_tool` stacks to one, sits in the Building Tools group, and uses an original radar-style icon. Any press opens the warp list, in the air or on a block, like the Build Wand's plain air press (0229). Pressing it on a warp block opens the same list.
3. **Naming.** The name is typed in a text form when the block is placed and can be edited with a hit on the block (1). Any player may edit any name. An empty edit keeps the old name. Names are trimmed and at most 32 Unicode code points. The placement field starts blank; the edit field contains the current name. Busy name forms retry five times at 10-tick intervals.
4. **Registration.** Placing the block by a player saves the default name before opening a name form for that player. A cancelled form or an empty name uses the default name "Warp N", where N is the lowest free number. An entry stores a unique id, the name, the placing player's name, the dimension id, and the block cell. Blocks placed without a player (dispenser, `/setblock`, `/clone`, structure paste, piston) are not registered.
5. **Removal.** Three uses (taps) in a row remove the block, return one block item only after removal succeeds, and remove its registry entry. The warp feature configures `TakeBackByHits` to cancel pending list opens, remove the block and show the broken hint, then return the item. It removes the registry entry after the item return. `WARP_SPEC.breakRule` is `hitRule(3, ticks(10))`. Each tap must come within the window of the previous one, and a longer gap starts the count again. Counters are shared across players at a dimension/cell. Block interactions are counted once per player per tick and deferred with `system.run`; a deferred tap rechecks that the player and block still exist. The first two counted taps show "Tap (right-click) the Warp Block %s more times to break it", using the singular form for the last remaining tap; the third shows "Warp Block broken", both localized in English and Japanese. A tap that does not break the block waits `WARP_SPEC.breakRule.resetTicks + 1` ticks; if the same player made no later tap on that block and the block did not break, it opens the list for that player; another player's tap still counts toward the shared break counter but does not cancel this list through the shared form guard. Opening the list at once would put a form over the second and third taps. The cost is a half-second delay before the list. Blocks are taken down by taps, not hits, because a touch long press reports `entityHitBlock` once, while taps report the block interaction; measured on a phone against the dev BDS (2026-11-18). The break after-event remains a fallback, and missing blocks are pruned when the list opens (6).
6. **List form.** An action form with one button per entry showing the name, the owner, the dimension, and the coordinates. Entries in the player's current dimension come first, ordered by squared distance; entries in other dimensions follow by dimension id, with name and id breaking ties. The form uses 16-entry pages, with previous and next buttons only for existing pages. Busy or cancelled list forms close the flow. When the list opens, an entry whose chunk is loaded and whose block is no longer a warp block is removed. An entry in an unloaded chunk is kept and labelled "unverified".
7. **Teleport.** Choosing an entry teleports the player to a safe standing spot near the block, in the entry's dimension, keeping the player's facing. An unverified entry may be chosen: the player is teleported, then the block is checked on arrival, and if it is gone the entry is removed and the player is told, so a stale list is never silent. Landing selection searches a 5x5 square at block height and one cell higher, excluding the warp block itself. Candidates are checked in ascending squared distance between cell centres. Ties prefer the block's own column, then lower rise, then ascending x and z offsets. The first standable cell wins. If none qualifies, the player lands on top. Infrastructure reads floor, body and head cells directly and supplies plain samples to a pure domain classifier. The floor must be solid, non-air and non-liquid; body and head must be air or non-solid and non-liquid. All three reject lava, flowing lava, fire, soul fire, cactus and magma. Missing cells or engine errors reject a candidate. The solidity query starts at the cell itself because `getBlockAbove` includes its origin on BDS 1.26.63.1; starting below tests the supporting block instead.
8. **Storage.** One world-level registry in the world's dynamic properties, shared by all players, with a version field. Snapshot version 1 is split into 10,000-UTF-16-code-unit chunks across two banks. A save writes the inactive bank, publishes its bank and count in one final write, then deletes the old bank. Unreadable data is not overwritten by use cases; break removal silently skips it while player form and teleport actions report it.
9. **Limits.** At most 64 entries.
10. **Dimensions.** The block can be placed in all three dimensions. The same landing radius and rises from WARP_SPEC apply in the destination dimension.
11. **Immovable block.** The Warp Block alone uses format 1.21.100 with stable `minecraft:movable` and `movement_type: immovable`, and disables mining and explosion destruction. Its `tag:yasu_ride:laid` protects it from blade cuts and Build Wand edits (0137). Format 1.21.100 declares the custom component directly as `"yasu_build:warp_block": {}`; script registration keeps the same identifier. The Behavior Pack minimum engine rises to 1.21.100 to state the block requirement explicitly. The Resource Pack already requires 1.21.120 (0147), so no supported client is lost. Other blocks retain their formats. The piston probe now requires the warp block to stay in place while its stone control moves.
12. **Group order.** The Building Tools group becomes: Selection Wand, blade switch, wide blade switch, road paver switch, warp tool, warp block. New items are appended, so the existing order is unchanged.
13. **Icon.** The tool icon and the block texture are original radar-style art: a round screen, a grid, a few dots, and a center marker. They must not copy the shape, rim, button, colors, or layout of the Dragon Radar from Dragon Ball.
14. **Placement in the code.** A new `warp` feature in domain, application, and infrastructure, wired through its infrastructure install function, with no imports from other features (0046). Only infrastructure imports `@minecraft/server` (0012), and only stable APIs are used (0001).

## Consequences

- Any player may warp to, rename, or break any warp block. This is accepted on a trusted LAN; there are no permissions, cooldowns, or costs.
- The name is shown in the list and the edit form only, not on the block.
- A block removed by an entity or a world edit stays in the registry until a list opens with its chunk loaded, or until a player arrives at it.
- Blocks placed without a player are not registered, so a structure paste of warp blocks would leave them unlisted. The Build Wand Copy therefore saves a Warp Block as air (0243), and its Paste cannot create one. A Warp Block that already exists without a registration, such as one pasted before that rule or put back by Undo, stays a decoration that the list does not show; nothing registers it automatically.
- The Resource Pack manifest version must be bumped when the block texture, icon, and lang keys land (0015).
- The Building Tools group order text in 0178 and the build-tools spec change together with the group change.
- Revisit the decision if the 64-entry limit or the dynamic property size makes the registry too small, or if a permission model is needed.

### Verification record

The first BDS 1.26.63.1 run (player connected) passed `warp_registry_store` and `warp_flow`; `warp_world` failed the clear-top landing check and `warp_engine_probes` failed its piston control. Probes on the same engine found both causes. `getBlockAbove` includes its origin cell, so the old solidity check, which started one cell below, tested the supporting block: a floor on a solid block was rejected, and a solid block on a solid block counted as passable, which also let the top-cell fallback hide the error in `warp_flow`. A powered piston with `facing_direction=4` pushes toward +x and `5` toward -x (`2` toward +z, `3` toward -z); the fixture used `5` and pushed away from the stone. Declared scenario ticks remain estimates.

Headless rerun on BDS 1.26.63.1, 2026-11-16, with the fixes (no player connected, so `warp_flow` was skipped):

- `piston_control: moved=true; source=minecraft:piston_arm_collision; destination=minecraft:stone`
- `piston_warp: moved=false; source=yasu_build:warp_block; destination=minecraft:air`: the Warp Block does not move.
- `unloaded_teleport: succeeded`; `unloaded_teleport_immediate: valid=true; location={"x":1000000.5,"y":-60,"z":1000000.5}`: teleporting an entity into an unloaded chunk does not throw, and the handle stays valid at the target location in the same tick.

| Scenario              | Evidence to record                                                                                                                            | Result  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| `warp_registry_store` | Small / multi-chunk / small round trips, published banks and counts, old-bank deletion, original test-pack registry restoration               | Pass    |
| `warp_world`          | Present / gone / unloaded cells, top / side / fallback landing, summoned entity location and rotation                                         | Pass    |
| `warp_engine_probes`  | Unloaded-chunk teleport: throw or success and immediate entity location/validity; piston stone control and warp source/destination cells      | Pass    |
| `warp_flow`           | Connected player with scripted menu answers: default/name/list/rename/empty edit/teleport/facing/single-tap list/three-tap break/refund/prune | Pending |

`warp_flow` passed before the fix and still needs a rerun with a connected player now that it requires a side landing when the top is blocked. Record later scenario output here after a BDS run, including failed fixture checks. Cleanup preserves the first body error; a cleanup failure still fails an otherwise successful scenario. The unloaded teleport probe records its immediate outcome before temporarily loading the destination if needed to remove an unloaded test entity. A probe observation is not an assertion that the measured engine behavior is supported. Dynamic properties are pack-scoped; the store scenario tests real world properties in the test pack and restores its original raw keys. The player scenario does not synthesize placement/break/input events or answer rendered engine forms; those remain manual.

Manual acceptance check date: pending. PC device/client version: pending. Touch device/client version: pending.

| Check                                                                                   | PC result | Touch result |
| --------------------------------------------------------------------------------------- | --------- | ------------ |
| Place a block and save the default before naming                                        | Pending   | Pending      |
| Name; cancel; submit an empty name/edit                                                 | Pending   | Pending      |
| Tap/right-click to open; inspect labels and page forward/back with more than 16 points  | Pending   | Pending      |
| Left-click or long press to rename                                                      | Pending   | Pending      |
| Press the tool in air and on a block                                                    | Pending   | Pending      |
| Teleport across dimensions and keep facing                                              | Pending   | Pending      |
| Right-click or tap a registered block three times; check messages, item return, removal | Pending   | Pending      |
| Warp to an unverified broken block and receive gone feedback                            | Pending   | Pending      |

Status remains Proposed until the PC and touch acceptance checks pass.

Touch gestures were observed on a phone against the dev BDS (2026-11-18): a tap reaches the block's `onPlayerInteract`, and a long press reports `entityHitBlock`. Whether a held tap repeats `onPlayerInteract` is unmeasured; repeats would count as taps.
