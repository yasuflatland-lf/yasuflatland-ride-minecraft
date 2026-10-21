# 0101. Give invisible blocks a hidden cube

- Status: Accepted
- Date: 2026-10-21
- Extends: 0063, 0068, 0093

## Context

No camping gear placed in a parked camper (0093) ever showed on a client. On 2026-10-21 the owner and an agent placed blocks with `/setblock` on the dev server (BDS 1.26.52, Bedrock client on a phone, Creative) and compared screenshots:

- A custom block whose `minecraft:geometry` has no cubes makes every custom-geometry block in the same chunk invisible on the client. `geometry.yasu_ride.deck_floor` was such a geometry: one bone `root`, no cubes. One `camper_floor` block next to two decor blocks was enough to hide them, and removing it brought them back
- The render method does not matter: the same cube-less geometry with `render_method` `opaque` or `blend` hid the decor too
- A geometry with one 1 x 1 x 1 cube in bone `root`, hidden with `"bone_visibility": {"root": false}` on the block's `minecraft:geometry`, was invisible itself and did not hide the decor

Every room block of 0068 and the deck floor of 0063 used the cube-less geometry, so every decor block in a parked camper sat in a chunk with one. 0091 also relied on the room blocks drawing nothing. The unit tests and the in-game tests check only block types, so none of them could see this.

## Decision

- No block in the packs uses a geometry without cubes
- `geometry.yasu_ride.deck_floor` has one 1 x 1 x 1 px cube in bone `root`, from (-0.5, 0, -0.5) to (0.5, 1, 0.5): at the bottom middle of the cell, starting at y = 0
- Every block that must draw nothing names it as `{"identifier": "geometry.yasu_ride.deck_floor", "bone_visibility": {"root": false}}`: `deck_floor`, `camper_floor`, `camper_wall`, `camper_ceiling`, `camper_door`, `camper_bed`, `camper_furniture`, and `camper_shower_toilet`. Their collision and selection boxes, material instances, states, and permutations do not change
- Every custom geometry that a Behavior Pack block names must exist in the Resource Pack, have at least one cube, and start at y = 0, the bottom of the cell (finding F2 of #410). `tests/packs/blockGeometry.test.ts` checks every block file, so a new block is covered without a new test. Until #412 lands, the macrame planter is its one listed exception

## Consequences

- Decor in a parked camper shows, and so does any custom-geometry block in a chunk with a camper room or a boat deck
- The Resource Pack version goes up, and the changed blocks need a server restart (0015)
- The hidden cube costs nothing to draw. If a later client draws hidden bones, a 1 px glass dot would show at the bottom middle of every room cell; check for it in the manual tests
- If a later engine draws cube-less geometries without hiding their chunk, this rule can be dropped; it stays until a play test shows that
