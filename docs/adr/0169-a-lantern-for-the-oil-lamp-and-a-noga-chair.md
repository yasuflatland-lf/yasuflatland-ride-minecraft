# 0169. A Lantern for the Oil Lamp, no Lava Lamp, and a Noga Chair

- Status: Proposed
- Date: 2026-10-27
- Extends: 0093, 0122, 0144, 0152, 0153, 0168

## Context

The owner asked for three changes to the camping gear (`docs/items/camping-gear.md`):

1. Remove the Lava Lamp, an inside decor item.
2. Change the Oil Lamp, an inside decor item, into a Lantern modeled on a glass-globe gas-style lantern, built from panels instead of cubes for fidelity.
3. Add a Noga Chair to the Camping Gear (Outside) group: a compact folding chair that a player sits on, like the Low Chair (0122).

The owner supplied reference photos, which are not committed. The lantern has a squat black cast base like a bottle shoulder, a short black neck collar, a flat silver ring plate, a frosted white cylindrical inner shade with a ribbed pattern inside a clear glass globe, a thin stainless wire cage from the top cap to the base ring, a silver cap with a small round knob, and a small black side loop with a little black cup at the neck. The Noga Chair is a low folding chair with a one-piece gray-olive ripstop sling (a seat and a high wrap-around back with rolled, bound edges and side wings that curve forward, one wing with a cut-out hole), a black aluminium frame (four legs splayed outward ending in black rubber feet, a black hub where the legs cross under the seat, two back poles rising from the hub to the top of the back), and a zippered pocket under the rear of the seat. A person sits reclined with their knees higher than the seat.

The lantern base has printed text and an emblem, and the chair back has a woven label patch. The models do not copy them and stay plain, as the Camper grille rule does for logos (0009, 0130).

This ADR fixes one contract that the later pull requests of the series (see Series) build on.

## Decision

### 1. Lava Lamp removed

- The Lava Lamp id leaves the gear catalog: `tools/camping_gear.json`, `CAMPING_GEAR_IDS` in `src/domain/vehicle/kinds/camper/campingGear.ts`, and its model, item, decor block, texts, tests, and docs. The catalog drops from 19 to 18 items.
- The pair-block end codes are `1 + index in STANDING_GEAR_IDS`, so removing an item shifts the codes of the items after it. Rooms are re-laid by script when parked, so this is accepted.
- Saved decor. A camper saved before this change may hold the Lava Lamp id or `oil_lamp`. A table `LEGACY_GEAR_IDS` in `campingGear.ts` maps `oil_lamp` to `lantern` and the Lava Lamp id to nothing. At the single place where saved decor ids are decoded, a mapped id is read as its new id, and an id mapped to nothing is dropped: the cell shows its empty furniture, and nothing is handed back because the item no longer exists.
- Items of the removed ids that players already hold become unknown items (Bedrock shows them as unknown). This is accepted for a pre-release add-on.

### 2. Oil Lamp becomes a Lantern

| What | Value |
|---|---|
| Id | `lantern`, replacing `oil_lamp` at the same catalog index (position 10) |
| Item | `yasu_ride:lantern` |
| Decor block | `yasu_ride:lantern_decor` |
| Texts | English `Lantern`, plus a Japanese translation in the locale file |
| Kind | Standing item with `glass: true` |
| Size target | 5 px wide, 8 px high |

- The 8 px height is safe because the removed Lava Lamp was 8 px tall and fit every shelf, table, cabinet, and fridge slot; the generator's `validate()` holds the real limits.
- Build from panels (Y-rotated, one axis per cube, 0009): the squat base, the neck collar, the silver ring plate, the cylindrical frosted shade and the glass globe as 12 to 16 vertical panels, the cap, the thin cage wires, and the small side loop. Swatches come from the shared gear atlas by name. Add new swatches (frosted white, glass, silver, black cast iron) only when no existing name fits.
- In pair blocks every face is opaque (a BDS limit recorded in the generator), so the glass globe shows opaque there; the standalone decor block blends it. This ADR notes that and does not try to change it.
- The camper's wall lantern is unrelated. The tent's lantern (0131, 0134) is a bone of the tent and stays.

### 3. Noga Chair

| What | Id |
|---|---|
| Entity | `yasu_ride:noga_chair` |
| Item | `yasu_ride:noga_chair_item` |
| Family | `yasu_ride_noga_chair` (plus `inanimate`) |
| Hits hint | `yasu_ride.hint.noga_chair_hits` |
| Test event | `yasu_ride_test:test_noga_chair_hit` |
| Names | English `Noga Chair`; the Japanese name is the owner's katakana transliteration, in the locale file |

- **Behavior** is the Low Chair's (0122), through a per-kind profile (the refactor in 3/6). It is placed on the top of a block outside vehicle space with two free blocks above, turned to face the player in 45 degree steps, and refuses on the add-on's own blocks. It has one seat with the Sit interaction. Three quick hits fold it while nobody sits; hits while seated are not counted. It never appears in the camping gear box and is never decor.
- **Seat.** One seat at about `[0, 0.1, 0.18]`, to be tuned on a device: the reclined sling sits lower and further back than the Low Chair's `[0, 0.14, 0.1]`. Collision box about 0.8 x 0.9.
- **Model.** About 14 px wide and 15 px tall, with the seat top about 5 px above the ground and the back reclined about 20 degrees. Plain gray-olive fabric, black frame, black hub and rubber feet. The curved back sling is built from Y-rotated panels that are then tilted as a rigid group with `tilt_assembly` (0167: a registered assembly in the generator's `ASSEMBLIES` table). The side wings, the rolled binding along the rim, the slightly dished seat sling, the under-seat pocket with a flap, the four splayed legs with rubber feet, the hub, and the two back poles complete it. Every cube outside a registered assembly has at most one rotation axis.
- **Recipe.** Shaped, 3 x 3, `"WW "`, `"WIW"`, `"I I"` (W any wool, I iron ingot: four wool and three iron ingots). Creative group: after the Low Chair.
- **Resource Pack version.** Each pull request that changes the Resource Pack bumps the manifest and the Behavior Pack dependency (0015). The plan over main at 0.1.173: 4/6 to 0.1.174, 5/6 to 0.1.175, 6/6 to 0.1.176. 1/6 to 3/6 do not bump.

### Series

1. This ADR.
2. Refactor, no behavior change: shared panel helpers and a rotation-aware gear generator.
3. Refactor, no behavior change: generalize the camp chair code into a per-kind profile.
4. Remove the Lava Lamp, with the legacy id rule.
5. Replace the Oil Lamp with the Lantern.
6. Add the Noga Chair.

### Out of scope

Light from the lantern, cooking, the chair holding items, a paintable chair, and any change to the Low Chair's look or behavior.

## Consequences

The gear catalog shrinks by one item, and the end codes of the standing items after the Lava Lamp shift. Saved campers keep working through `LEGACY_GEAR_IDS`: an Oil Lamp reads as a Lantern and a Lava Lamp disappears without a refund. Held Lava Lamps and Oil Lamps turn into unknown items, which a pre-release add-on can accept; revisit this if the add-on has shipped to other players by the time 4/6 merges.

A glass globe that shows opaque inside pair blocks is a known visual limit. The Noga Chair adds a second rider of the per-kind chair profile, so the Low Chair and the Noga Chair share one code path with different specs. The numbers for the models and the seat are targets and may shift when the generators are written and the seat is tuned on a device.
