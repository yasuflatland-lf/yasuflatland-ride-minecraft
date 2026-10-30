# 0173. Remove the inside Lantern and add the Gas Lantern

- Status: Proposed; extended (a Gas Lantern may stand on a Camp Table and is removed with it) by [0185](0185-put-things-on-the-camp-table-instead-of-sitting-at-it.md) (Proposed); superseded in part (rule 12: presses with any item or an empty hand switch the lantern; hits switch only with the light tool) by [0191](0191-press-camp-gear-without-the-light-tool.md) (Proposed)
- Date: 2026-10-28
- Supersedes in part: [0169](0169-a-lantern-for-the-oil-lamp-and-a-noga-chair.md) (section 1's `oil_lamp -> lantern` legacy entry and section 2's Lantern)

## Context

The owner wants to remove the Lantern from Camping Gear (Inside) and add an outdoor Gas Lantern that stands on the ground and toggles when tapped with the Headlight Switch (`yasu_ride:headlight_switch`). Four reference photos show a transparent cylindrical glass chimney, a metallic faceted burner with a bent wire handle and brass valve knob, a hemispherical cartridge shoulder with a silver collar, and an olive-gold cylindrical cartridge with a silver bottom rim. A warm flame glows inside the glass when lit. The photographed cartridge's logo and printed text are not copied: no logo, lettering, label or brand mark appears on any part (0009, 0130, 0169).

The Fire Pit supplies the outdoor item's architecture. The switch router currently passes only the player to a target, the tent lantern and camper seat presses each keep a keyed cooldown, and five camp take-back use cases repeat keyed hit-counter bookkeeping. The Fire Pit and Dutch Oven also repeat their ground placement rule and atlas pipeline. Panel helpers lack a dome and a disc centre, while the camping gear and Dutch Oven generators duplicate transformed-corner calculations. Share these components in separate refactors before the Gas Lantern uses them, preserving behavior and pack output.

Sharing was also considered for the remaining camp paths and left out; Decision 17 lists them and why.

The legacy-id mechanism of 0169 remains one explicit table read at the single saved-decor decode, and its panel helpers stay. Issue #777 fixes the decisions for 2/13 through 13/13; later steps may only fill in numbers explicitly marked as measured in their step.

## Decision

### Removal (Topic B)

1. `lantern` leaves `CAMPING_GEAR_IDS`: 17 decor items, 16 standing, pages stay `ceil(17/10) = 2`. Standing codes after it drop by one (desk_fan 17 -> 16).
2. `LEGACY_GEAR_IDS = { lava_lamp: null, oil_lamp: null, lantern: null }`. A camper saved with a Lantern or an Oil Lamp on its furniture loads without them; nothing is refunded. The table stays explicit, as 0169 wants, although an unknown id already resolves to `undefined`.
3. Deleted: the `lantern` row of `tools/camping_gear.json`, `def lantern()` and `SHAPES["lantern"]` in `tools/gen_camping_gear.py` and its now-unused `panels` import, the item `yasu_ride:lantern`, the block `yasu_ride:lantern_decor`, `geometry.yasu_ride.lantern`, its icon, the atlas key `yasu_ride_lantern` (by hand: the generator keeps entries it does not own), the preview, and four lang lines. The camping gear PALETTE keeps all 16 swatches (none is lantern-only).
4. Lantern decor items that players already hold become unknown items, as 0169 section 1 records for removed ids. They do not turn into the Gas Lantern.

### Gas Lantern (Topic C)

5. **Ids.** Entity `yasu_ride:gas_lantern`, item `yasu_ride:gas_lantern_item`, family `["yasu_ride_gas_lantern", "inanimate"]`, entity property `yasu_ride:lit` (bool, default false, `client_sync` true), entity dynamic property `yasu_ride:gas_lantern_cells` (the laid light cells as `CellLayer` saves them, a JSON array), hint `yasu_ride.hint.gas_lantern_hits`, interact text `action.interact.yasu_ride.gas_lantern`, server-only test events `yasu_ride:test_gas_lantern_hit` (12/13) and `yasu_ride:test_gas_lantern` (13/13). Not `lantern`: that string is the removed decor id, a legacy table key, and the tent's property; reusing it would make saved and held decor ambiguous. The `_item` suffix follows the other outdoor items.
6. **Names.** The ja_JP values below use Unicode escapes to keep this ADR English-only. The lang file holds the decoded characters, as every other ja_JP line does.

   | Key | en_US | ja_JP |
   |---|---|---|
   | `item.yasu_ride:gas_lantern_item.name` | Gas Lantern | `\u30ac\u30b9\u30e9\u30f3\u30bf\u30f3` |
   | `entity.yasu_ride:gas_lantern.name` | Gas Lantern | `\u30ac\u30b9\u30e9\u30f3\u30bf\u30f3` |
   | `yasu_ride.hint.gas_lantern_hits` | Hit %s more to take back the Gas Lantern | `\u3042\u3068%s\u56de\u53e9\u304f\u3068\u30ac\u30b9\u30e9\u30f3\u30bf\u30f3\u3092\u7247\u4ed8\u3051\u307e\u3059` |
   | `action.interact.yasu_ride.gas_lantern` | Turn the Gas Lantern On / Off | `\u30ac\u30b9\u30e9\u30f3\u30bf\u30f3\u3092\u70b9\u706f\u30fb\u6d88\u706f` |

7. **Creative order.** `gas_lantern_item` is appended last to `OUTSIDE_IDS`, after `dutch_oven_item`. The group icon stays `low_chair_item`.
8. **Item and recipe.** Modeled on `fire_pit_item.item.json`: stack 16, `menu_category` items, icon `yasu_ride_gas_lantern_item` (atlas entry right after `yasu_ride_dutch_oven_item`). Shaped recipe `recipes/yasu_ride/gas_lantern_item.recipe.json`, tag `crafting_table`, pattern `[" G ", "GTG", " I "]`, `G` `minecraft:glass_pane`, `T` `minecraft:torch`, `I` `minecraft:iron_ingot`, result 1.
9. **Placement.** Use the item on the **up** face of a block that is not a laid block (`canUseBlockTop`, 6/13). The cell above that block must be air and outside vehicle space (`GAS_LANTERN_SPEC.clearance = 1`, one cell, the lantern being 11.3 px tall), and no other Gas Lantern may stand within `GAS_LANTERN_SPEC.spacing = 0.75` blocks of the spawn point (`hasGasLanternNear`, the Fire Pit's `hasFirePitNear` pattern; a radius, not a floored cell, so a lantern that settled onto a slab is still found). It spawns at `(x+0.5, y+1, z+0.5)` above the pressed block and falls onto partial blocks (slabs, carpets, snow layers) by gravity; yaw = the player's yaw snapped to `GAS_LANTERN_SPEC.yawStep = 90` degrees. One item is consumed unless the player is in Creative. The whole check-and-spawn sequence is one `placeOnGround` call (6/13) with the lantern's own near check and spawn. Standing on a Camp Table or hanging from a tent is out of scope.
10. **Take-back.** Three hits by a player within 100 ticks of each other (`GAS_LANTERN_SPEC.hitsToTakeBack = 3`, `hitResetTicks = 100`, counted by one `HitCounters<GasLanternId>` from 5/13, with no `forgetStale` call, as the Fire Pit) drop one `gas_lantern_item` at the lantern and remove it, lit or not, after clearing its light; each earlier hit shows the hint with the hits left. A hit while holding `yasu_ride:headlight_switch` is **not** a take-back hit (no count, no hint): on touch a plain tap on an entity arrives as a hit, and the owner asked that a tap with the light tool toggles the lantern, so from 13/13 such a hit switches it (rule 12). In 12/13, before switching exists, such a hit does nothing.
11. **Entity components.** `collision_box` width 0.5, height 0.75; `physics` with collision and gravity; not pushable (also by piston); knockback resistance 1; health 20; `damage_sensor` all causes, no damage; `persistent`; `minecraft:interact` with one interaction whose `interact_text` is the key in rule 5, so touch clients get a button; `is_summonable` true, `is_spawnable` false.
12. **Switch.** Any player holding `yasu_ride:headlight_switch` who presses the lantern entity (PC right-click, the touch interact button) or hits it (PC left-click, a touch tap) turns it on or off, with `random.click` (`SWITCH_CLICK_SOUND`) at the lantern. The press is claimed by a new switch target that claims only entity presses on `yasu_ride:gas_lantern` (never item use in the air, never block presses), placed after the tent lantern in camp's `switchTargets`; the vehicle target is still asked first, so a rider's press switches the vehicle's lights, as today. The hit goes through the Gas Lantern's own `entityHitEntity` handler. Both paths share one cooldown per lantern, `LIGHT_SWITCH_COOLDOWN_TICKS` (10), shared by everyone, so a held press, or a tap the client reports both as a hit and an interaction, flips it once (ADR 0024). A press or hit with any other item, or an empty hand, does not switch (a hit counts toward take-back, a press does nothing and is not cancelled). A new lantern starts off; the state survives `/reload` and a restart (entity property).
13. **Light.** While lit, the lantern keeps `minecraft:light_block_15` (`lightBlockId(15)`, `GAS_LANTERN_SPEC.light = 15`, the tent lantern's level) in one cell, through the shared `CellLayer` (no second laid-cell mechanism):
    - Pure rule `gasLanternLightCells(lit, location): LaidCell<GasLanternLight>[]` in `src/domain/camp/gasLantern.ts`, `GasLanternLight = { readonly level: number }`: `[]` when off; when lit, one cell `{ x: floor(x), y: floor(y + GAS_LANTERN_SPEC.lightLift), z: floor(z) }` with `level: light`, where `lightLift = 0.95`: a lantern standing on a full block (fraction 0) lights its own cell, and one standing on a slab, carpet or snow layer (fraction 0.0625 to 0.94) lights the air cell above that partial block, which its upper half fills.
    - A `CellCodec<GasLanternLight>` (property `yasu_ride:gas_lantern_cells`, `blockIdOf` = `lightBlockId(level)`, `permutationOf` = `BlockPermutation.resolve(lightBlockId(level))`, `same` compares `level`, `upgrade` is identity) and one `CellLayer<GasLanternId, GasLanternLight>` with recheck every lay (recheck count 1). So it lays only into air or a light block, clears only its own light block, re-lays a lost one, keeps a cell in an unloaded chunk, and saves the laid cell on the lantern.
    - It is laid right after each switch, cleared before a take-back removes the lantern, and every `lightTicks = 20` ticks every loaded lantern in the overworld, nether and end is laid again (which follows a lantern that falls), followed by `clearGone` with the ids found, so a lantern removed by `/kill` loses its light on the next pass.
    - Accepted limits: a lantern removed by a command within the first `lightTicks` after a `/reload` or restart (before the layer first reads its saved cell) leaves its light; a light cell shared with vehicle headlights or another lantern may go dark for up to `lightTicks` when either owner clears it, and is re-laid on the next pass.
14. **Model contract.** `geometry.yasu_ride.gas_lantern`, texture 32 x 32, bones: `root` (pivot 0,0,0, no parent); `body` (parent `root`); `glass` (parent `body`); `flame` (parent `body`). Front is -z (ADR 0009); the handle points +x, from the burner hexagon's +x vertex. Built from `tools/panels.py` only; every cube is turned about Y at most; no assembly; every cube size is greater than 0 on all three axes. Sizes in px (y up from the ground, centred on x = z = 0; `panel_ring(apothem, y0, y1, swatch, sides, thickness)`):

    | Part | Bone | Construction | Swatch | Cubes |
    |---|---|---|---|---|
    | Cartridge bottom rim (red) | body | `panel_ring(3.05, 0, 0.4, sides 16, thickness 0.5)` | silver | 16 |
    | Cartridge wall (red) | body | `panel_ring(3.0, 0.4, 3.5, sides 16, thickness 0.5)` | olive | 16 |
    | Shoulder hemisphere (orange) | body | `dome(radius 3.0, height 1.5, y0 3.5, sides 16, bands 6)` (7/13) | olive | 88 |
    | Collar (orange) | body | `panel_ring(1.2, 4.9, 5.4, sides 12, thickness 0.4)` | silver | 12 |
    | Burner body (blue) | body | `panel_ring(1.6, 5.4, 7.0, sides 6, thickness 0.6)` and the floor `disc(1.6, 5.4, 5.6, bars 6)` | steel | 12 |
    | Valve knob (blue) | body | `panel(1.5, 5.8, -0.35, 2.0, 6.4, 0.35)`, buried in the +x vertex and standing 0.15 px proud of it | brass | 1 |
    | Wire handle (blue) | body | two arms 0.2 px wide (z) and y 6.0 to 6.2, from inner end (1.2, z -0.9) to (3.6, z -0.5) and from (1.2, z 0.9) to (3.6, z 0.5), each a `panel` along +x of the arm's length turned about Y at its inner end by `-atan2(dz, dx)` degrees, computed from the end points: in the game convention (`cube_tilt.cube_matrix`) a positive y turn moves a +x bar toward -z, so the -z arm (dz +0.4) turns about -9.46 degrees and the +z arm (dz -0.4) about +9.46 degrees, and both outer ends meet the cross bar (a plain `atan2(dz, dx)` would splay them out to z +-1.3); the inner ends are buried in the hexagon wall; a cross bar `panel(3.5, 6.0, -0.6, 3.7, 6.2, 0.6)`. The knob (y 5.8 to 6.4) spans the arms' height between their hinges | steel | 3 |
    | Gasket (green) | body | `panel_ring(1.7, 7.0, 7.2, sides 16, thickness 0.4)` | gasket | 16 |
    | Ring plate (green) | body | `disc(1.9, 7.2, 7.4, bars 8)` | silver | 8 |
    | Burner nozzle (green) | body | `panel_ring(0.35, 7.4, 8.2, sides 8, thickness 0.2)` | brass | 8 |
    | Glass chimney (green) | glass | `panel_ring(1.5, 7.4, 10.9, sides 16, thickness 0.12)` | glass | 16 |
    | Top cap (green) | body | `panel_ring(1.55, 10.9, 11.3, sides 16, thickness 0.3)` and `disc(1.55, 11.1, 11.3, bars 8)` | chrome | 24 |
    | Flame | flame | 4 panels x -0.3 to 0.3, y 8.2 to 9.8, z -0.03 to 0.03, turned about Y at (0, 8.2, 0) by k*45 degrees, k = 0..3 | flame | 4 |

    224 cubes (204 body, 16 glass, 4 flame), measured in 11/13. Every corner lies within x -3.1 to 3.75, z -3.1 to 3.1, y 0 to 11.3; computed from the table the extents are about x -3.08 to 3.70, z -3.08 to 3.08, y 0 to 11.3 (measured in 11/13). The generator checks the bounds with `cube_tilt.bounds` (8/13), which turns each cube about its pivot the way the game does, since nearly every part is turned about Y, and checks with `cube_tilt.corners` that each handle arm's outer end (its corners at the far x end) lies within the cross bar's z span, -0.6 to 0.6, so a wrong turn sign fails the build. No logo, lettering, label, or brand mark on any part.
15. **Swatches** (index: name, RGB, alpha, MER as metalness, emissive, roughness), in a 32 x 32 atlas of 8 px swatches built with `tools/mer_atlas.py` (9/13), the module the Fire Pit and the Dutch Oven use, with an RGBA palette and `streak_rows = 0`. In `mer_atlas.atlas_pixels`, pixel rows `y < streak_rows` add the stainless streak to the R, G and B channels of every swatch, alpha untouched, so with the default 16 the streak would cover swatches 0 to 7 here and shift the glass and flame colours; with 0 every swatch is one flat colour, exactly the table's. 8 to 15 unused (black, alpha 255, MER `(0,0,255)`):

    | # | Name | Colour | Alpha | MER |
    |---|---|---|---|---|
    | 0 | olive | (150,138,74) | 255 | (40,0,150) |
    | 1 | silver | (200,202,205) | 255 | (230,0,60) |
    | 2 | steel | (168,172,178) | 255 | (255,0,40) |
    | 3 | chrome | (228,231,235) | 255 | (255,0,10) |
    | 4 | brass | (196,158,72) | 255 | (230,0,60) |
    | 5 | gasket | (38,38,40) | 255 | (0,0,210) |
    | 6 | glass | (220,235,240) | 96 | (0,0,20) |
    | 7 | flame | (255,196,96) | 0 | (0,255,255) |

    Alpha 96 makes the glass see-through under `entity_alphablend`; alpha 0 is the emissive mask under `entity_emissive` (ADR 0020, 0147), so the flame glows full-bright with Vibrant Visuals off, and the MER emissive 255 makes it glow with Vibrant Visuals on. Every other texel is alpha 255. Texture set `gas_lantern.texture_set.json`, format 1.16.100 (ADR 0147), color + `gas_lantern_mer`.
16. **Rendering.** `gas_lantern.ce.json` materials `default: entity`, `glass: entity_alphablend`, `flame: entity_emissive`. `controller.render.yasu_ride.gas_lantern`: materials `[{"*": "Material.default"}, {"glass": "Material.glass"}, {"flame": "Material.flame"}]` (the tent's per-bone pattern, ADR 0131), `part_visibility` `[{"flame": "query.property('yasu_ride:lit')"}]`. No particles. The preview and the item icon draw every bone from the texture passed through `opaque_lenses` (alpha 0 drawn opaque, the glass stays see-through), so they show a lit lantern.
17. **Code placement and shared components.** Domain `src/domain/camp/gasLantern.ts` and `GAS_LANTERN_SPEC` in `src/domain/camp/spec.ts`; application `src/application/camp/gasLantern.ts` (`GasLanternActions`) and `ports/gasLantern.ts` (`GasLanternWorld`); infrastructure in `src/infrastructure/camp/`. Shared refactors land first, each in its own PR with no behavior change and no pack output change, and the Gas Lantern steps use them instead of copying code:
    - 3/13: the switch router passes the pressed entity to its target (`switchFor(player, pressed?)`).
    - 4/13: a keyed light switch cooldown `SwitchCooldowns<K>` in `src/domain/shared/switchCooldown.ts`, used by `SwitchLantern` and `SeatPresses`; the lantern holds one `SwitchCooldowns<GasLanternId>`.
    - 5/13: a keyed take-back hit counter `HitCounters<K>` in `src/domain/shared/hitCounter.ts` (the hit-side twin of `SwitchCooldowns`), used by `FirePitActions`, `DutchOvenActions`, `HitTable`, `HitChair` and `TakeDownTent`; the lantern holds one `HitCounters<GasLanternId>`. The vehicle's single `HitCounter` stays as it is.
    - 6/13: the ground placement rule in `src/application/camp/groundPlacement.ts` (`canUseBlockTop`, `hasClearance`, `placeOnGround`) over the narrow port `GroundCellsWorld` (`src/application/camp/ports/groundCells.ts`), used by the Fire Pit and the Dutch Oven, with `canUseBlockTop` also used by the Camp Table; `yawStep: 90` joins `FIRE_PIT_SPEC` and `DUTCH_OVEN_SPEC`. The lantern's `place` is one `placeOnGround` call; `GasLanternWorld` extends `GroundCellsWorld`.
    - 7/13: a one-axis `dome` helper and a `center` for `disc` in `tools/panels.py`.
    - 8/13: public `corners(cube)` and `bounds(cubes)` in `tools/cube_tilt.py`, used by `gen_camping_gear.py` and `gen_dutch_oven.py`; the lantern generator's `validate()` uses them.
    - 9/13: `tools/mer_atlas.py`, the 8 px swatch atlas pipeline (swatch faces, RGB or RGBA colour pixels, MER pixels, PNG I/O, texture set, write-or-check), used by `gen_fire_pit.py` and `gen_dutch_oven.py`; the lantern generator adds no PNG or texture set code of its own.

    The light reuses `CellLayer` as it is. Each camp item still keeps its own actions class, port, Bedrock world and handlers in the Fire Pit's shape. Not shared, because the series does not need them or the shared form would need a special case for most users: the chair's placement (its own `canPlaceChair` and `consumeChairItem(kind, ...)`), the Camp Table's footprint loop and yaw-dependent spawn point, the Bedrock block probes and handler wiring (the Dutch Oven's one `TickScopedSet` dedupes both its block and entity presses, and its hit test hook has no server-source check), the face-the-player yaw of the chair, table and tent, a generic camp light switch use case (after 4/13 the lantern's switch is four statements), and the older items' spacing radii, which stay literals in their Bedrock worlds while the lantern's lives in `GAS_LANTERN_SPEC`.
18. **Resource Pack versions** (next free patch at merge if another PR bumps first): 2/13 0.1.187, 10/13 0.1.188, 11/13 0.1.189, 12/13 0.1.190; 3/13 to 9/13 and 13/13 do not change the Resource Pack. Each bumping step also moves every test that pins the RP version (today `tests/packs/dutchOven.test.ts`, `nogaChair.test.ts`, `sportsboatEquipment.test.ts`, and from 11/13 `gasLantern.test.ts`) to its new patch.
19. **Out of scope.** A hanging lantern, standing on a Camp Table, fuel or burn time, dimming, particles, redstone, treating the lantern's light cell as camp space, and an entity-remove hook.

## Consequences

The decor count falls to 17. Saved Lanterns and Oil Lamps vanish without refund, and held Lantern decor becomes unknown items rather than Gas Lanterns. Standing codes after the removed item shift down by one while the catalog still has two pages.

The Gas Lantern is the first camp entity to lay vanilla light blocks through `lightBlockId` and the existing `CellLayer`. It accepts the reload/removal and shared-cell limits in Decision 13. On touch, a tap with the switch toggles the lantern instead of counting toward take-back; both hit and interaction paths use the same per-lantern cooldown.

Five camp take-back use cases share `HitCounters<K>`. The Fire Pit and Dutch Oven share one ground placement rule and gain `yawStep` in their specs. Their generators share `tools/mer_atlas.py`, while the camping gear and Dutch Oven generators share `cube_tilt.corners` and `bounds`. Each camp item retains its own actions class, port, Bedrock world and handlers.

Every step uses stable Script APIs (0001), preserves layer, feature and kind boundaries (0012, 0046, 0055, 0065), and uses one-axis cubes unless in a registered assembly (0167). Pure logic uses property-based tests and engine integration uses in-game tests (0010); tests that only repeat a value and coverage-only tests are excluded. Each step changing the Resource Pack bumps both its manifest and the Behavior Pack dependency, and updates all tests pinning that version (0015). This first step changes documentation only, with no code, pack or test changes.

### Series

1. 1/13: ADR 0172 (smooth sports boat lenses) and ADR 0173 (inside Lantern removal, the outdoor Gas Lantern, and the shared refactors before it) (#777).
2. 2/13: the sports boat's headlight lenses from finer panels (#778).
3. 3/13: refactor, the switch router passes the pressed entity to its target (#779).
4. 4/13: refactor, a keyed light switch cooldown `SwitchCooldowns<K>` in domain/shared, used by SwitchLantern and SeatPresses (#780).
5. 5/13: refactor, a keyed take-back hit counter `HitCounters<K>` in domain/shared, used by the Fire Pit, Dutch Oven, Camp Table, chair and tent take-back (#781).
6. 6/13: refactor, one ground placement rule (`canUseBlockTop`, `hasClearance`, `placeOnGround` over `GroundCellsWorld`) for the Fire Pit and the Dutch Oven, with the block-top check also used by the Camp Table (#782).
7. 7/13: tools, a one-axis dome helper and a disc center in tools/panels.py (#783).
8. 8/13: tools, public cube corners() and bounds() in tools/cube_tilt.py, used by gen_camping_gear.py and gen_dutch_oven.py (#784).
9. 9/13: tools, the shared MER swatch atlas module tools/mer_atlas.py, used by gen_fire_pit.py and gen_dutch_oven.py (#785).
10. 10/13: remove the Lantern decor from Camping Gear (Inside) (#786).
11. 11/13: the Gas Lantern model, textures, render controller, preview and icon (#787).
12. 12/13: the Gas Lantern item, entity, recipe, placement, and take-back (#788).
13. 13/13: switching the Gas Lantern with the Headlight Switch, and its light (#789).

The PRs form a linear stack in this order, each based on the previous step's branch. 2/13 touches only the sports boat and depends on no lantern step; it sits second only to keep the stack linear. 3/13 to 9/13 are refactors placed before the first feature step that uses them: each changes no behavior and no pack output (`pnpm model` gives no diff, no Resource Pack bump), and existing tests pass unchanged. Each PR title starts with its `N/13`, the PR body is in English, and it links its issue with `Closes #N`. Assignee: `yasuflatland-lf`.
