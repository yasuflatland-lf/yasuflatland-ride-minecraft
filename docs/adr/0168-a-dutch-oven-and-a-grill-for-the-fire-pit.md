# 0168. A Dutch oven and a grill for the fire pit

- Status: Proposed; superseded in part (rule 1: new table ovens go at the aimed point, not two fixed spots; rule 5: a missing host removes the oven with no drop; rule 8: an overlap and limit check replaces the occupied-spot refusal on a table; the table may now hold Gas Lanterns) by [0185](0185-put-things-on-the-camp-table-instead-of-sitting-at-it.md) (Proposed)
- Date: 2026-10-27
- Extends: 0122, 0144, 0152, 0153

## Context

The owner wants a Dutch oven in the outside camping gear and a change to the Fire Pit (0153): when something stands on top of the pit, a wire grill appears. The `camp` feature already has the Low Chair (0122), the Tent, the Camp Table (0152), and the Fire Pit (0153).

The owner supplied reference photos, which are not committed: a matte black cast-iron Dutch oven with a flat lid, a rectangular loop handle on the lid, two flat side lugs with an oval hole, and a stainless wire bail; the same pot open and empty; a simmering pot of fish, clams, tomatoes, olives, and parsley in a dark broth with steam; and a crimped stainless wire mesh grill on a fire pit's rim.

On a fire pit the food sits in the pot and simmers. On a table the pot is closed with its lid. The photos show a brand mark, lettering, and an emblem embossed on the lid. The model does not copy them and uses a plain lid, as the Camper grille rule does for logos (0009, 0130).

This ADR fixes one contract of ids, states, and rules that the later pull requests of the series (see Series) build on.

## Decision

### Ids and states

| What | Id | Notes |
|---|---|---|
| Entity | `yasu_ride:dutch_oven` | Script-managed, persistent, `is_summonable: true`, `is_spawnable: false` |
| Item | `yasu_ride:dutch_oven_item` | In the Camping Gear (Outside) group after the Fire Pit |
| Oven property | `yasu_ride:simmering` | Boolean, default false, `client_sync`. True: lid off, stew visible, bubbling animation, steam. False: lid on, stew hidden |
| Fire pit property | `yasu_ride:covered` | Boolean, default false, `client_sync`. True: the `grill` bone is visible |
| Oven dynamic property | `yasu_ride:host` | String. Empty on the ground; `<hostEntityId>:<spot>` while standing on a Fire Pit or a Camp Table |
| Spec | `DUTCH_OVEN_SPEC` in `src/domain/camp/spec.ts` | `clearance: 2`, `hitsToTakeBack: 3`, `hitResetTicks: 100`, `hostCheckTicks: 20` |
| Hint keys | `yasu_ride.hint.dutch_oven_hits`, `yasu_ride.hint.dutch_oven_on_top` | Hits left, and "Take the Dutch oven off first" |

### Rules

1. **Where it stands.** Three hosts: the ground (the top of a block outside vehicle space), a Fire Pit (1 spot, its center), and a Camp Table (2 spots, 7.5 px either side of the center along the long axis, one oven per spot).
2. **Simmering.** `yasu_ride:simmering` is true exactly while the oven stands on a Fire Pit, whether or not the pit is lit. On the ground or a table it is false (lid on). This reading of "placed on the fire pit" follows the owner's wording and keeps the rule a pure function of the host kind.
3. **Grill.** `yasu_ride:covered` on the Fire Pit is true exactly while an oven stands on it, and the `grill` bone shows. The grill is not a separate item or entity.
4. **Taking it back.** Three quick hits on the oven fold it into its item (as 0122) and clear the host's state. The pit and the table refuse their own three-hit fold while any oven stands on them and show `dutch_oven_on_top`; the hit counter does not advance.
5. **Host vanishes.** Every `hostCheckTicks`, an oven whose host id does not resolve clears `host`, sets `simmering` false, and falls to the ground with gravity, but only when the chunk at the oven's own position is loaded and the host's block position is too. If either is unloaded, the host may only be out of reach, so the oven changes nothing and checks again on the next interval.
6. **Lighting is independent.** Flint and steel still lights and puts out the pit with an oven on it (0153).
7. **No cooking.** Like the fire (0153), simmering is visual: nothing is consumed and nothing burns.
8. **Placement refuses** a spot inside vehicle space; a spot without `clearance` free blocks above; a spot within 0.5 block of another oven that is also on the ground; and a host spot that already holds an oven.

### Models

The numbers are targets; `tools/gen_dutch_oven.py` fixes them in the model PR.

- **Dutch oven.** Texture 32 x 32 of 8 px swatches, geometry `geometry.yasu_ride.dutch_oven`. Bones: `root`, `body`, `lid`, `bail`, `food`. The body is a shallow wide bowl about 9 px across and 4.5 px high, built from stacked rings. The lid is flat, about 9.6 px across, with a rectangular loop handle and no marks. Two flat lugs with a 2 x 1 px hole reach about 5.4 px either side. The wire bail is stainless. Overall the oven is about 11 px wide, 6 px high with the lid, and up to 9 px with the bail raised.
- **Stew.** The `food` bone holds a dark brown broth surface just below the rim, a seared fish fillet slice, two open clams, three cherry tomatoes, two olives, and a few parsley bits. Small bubble cubes sit on a `bubbles` child bone that a client animation bobs.
- **Fire pit grill.** Add a `grill` bone to `geometry.yasu_ride.fire_pit`: a square rim frame of 0.5 px rods about 11.4 px across at y 11.9 to 12.5 (just above the bowl rim top at 11.9 px), with crossing wires about 1.2 px apart, drawn from the existing stainless swatches with PBR like the rest of the pit. Its top face, y 12.5, is the oven's standing height.
- **Camp Table.** The top is at y 12.25 px (30 x 12 px footprint). The oven stands on it at that height.

### Series

1. This ADR.
2. Fire pit grill: the `covered` property and the `grill` bone.
3. Dutch oven model, entity, item, recipe, and ground placement.
4. Stand the oven on a fire pit and simmer.
5. Stand the oven on a camp table, with docs and manual-test rows.

### Out of scope

Cooking, food items, taking food out, the oven as inside decor, a paintable oven, and the table holding anything else.

## Consequences

The oven is the one item a Camp Table and a Fire Pit can hold, so the "does not hold placed items" rule of 0152 is partly superseded for the Dutch oven only; the Decision of 0152 is not rewritten. The pit and the table gain a refusal path while an oven stands on them, and a periodic host check adds a small per-oven cost every `hostCheckTicks`.

Because simmering depends only on the host kind, an oven on an unlit pit still shows a bubbling stew. Revisit this if the owner wants the stew to follow the fire; that is a one-line change in the domain function. The model numbers may shift when `tools/gen_dutch_oven.py` is written, and the Resource Pack version advances in the PRs that change the pack, not in this one. Cooking and taking food out stay out of scope until the owner asks for them.
