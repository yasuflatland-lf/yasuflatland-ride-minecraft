import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { DECOR_CELLS } from "../../../../../src/domain/vehicle/kinds/camper/decor";
import {
  decorBlockName,
  ownSlotBlock,
} from "../../../../../src/domain/vehicle/kinds/camper/decorCells";
import {
  FRIDGE,
  WALL_CABINET,
} from "../../../../../src/domain/vehicle/kinds/camper/furniture";
import { ownPlateBlock } from "../../../../../src/domain/vehicle/kinds/camper/storagePlates";
import {
  CAMPING_GEAR_IDS,
  STANDING_GEAR_IDS,
} from "../../../../../src/domain/vehicle/kinds/index";
import { NAMESPACE } from "../../../../../src/infrastructure/shared/identifiers";
import {
  campingGearItem,
  DECK_FLOOR_BLOCK,
  ITEM_TYPE,
} from "../../../../../src/infrastructure/vehicle/bedrock/identifiers";
import {
  CAMPER_BED_BLOCK,
  CAMPER_BUNK_BLOCK,
  CAMPER_CABINET_DOOR_BLOCK,
  CAMPER_CEILING_BLOCK,
  CAMPER_DOOR_BLOCK,
  CAMPER_FLOOR_BLOCK,
  CAMPER_FRIDGE_DOOR_BLOCK,
  CAMPER_FURNITURE_BLOCK,
  CAMPER_SHOWER_DOOR_BLOCK,
  CAMPER_SHOWER_TOILET_BLOCK,
  CAMPER_SHOWER_TOILET_COMPONENT,
  CAMPER_WALL_BLOCK,
  campingGearOfDecorBlock,
  campingGearOfItem,
  decorBlockId,
  isCamperRoomBlock,
  isDecorBlock,
  isStandableRoomBlock,
  PAIR_END_STATES,
  PAIR_PAGE_SIZE,
  pairDecorBlockId,
  pairEndStates,
} from "../../../../../src/infrastructure/vehicle/kinds/camper/identifiers";
import { decorItemId } from "../../../../support/decorIds";

describe("camper identifiers", () => {
  it("names an item's decor block", () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z][a-z0-9_]{0,20}$/), (item) => {
        expect(decorBlockId(item)).toBe(`yasu_ride:${item}_decor`);
      }),
    );
  });
  it("maps camping gear items and decor blocks to their gear ids and nothing else (ADR 0093)", () => {
    fc.assert(
      fc.property(fc.constantFrom(...CAMPING_GEAR_IDS), (gear) => {
        expect(campingGearOfItem(`yasu_ride:${gear}`)).toBe(gear);
        expect(campingGearOfDecorBlock(`yasu_ride:${gear}_decor`)).toBe(gear);
        expect(campingGearItem(gear)).toBe(`yasu_ride:${gear}`);
        expect(campingGearOfItem(`yasu_ride:${gear}_decor`)).toBeUndefined();
        expect(campingGearOfDecorBlock(`yasu_ride:${gear}`)).toBeUndefined();
      }),
    );
    expect(campingGearOfItem(undefined)).toBeUndefined();
    expect(campingGearOfItem(ITEM_TYPE.camper)).toBeUndefined();
    expect(campingGearOfItem("minecraft:stone")).toBeUndefined();
  });

  it("keeps the upper bunk out of the standable room blocks, since stand-up spots are aisle cells (ADR 0182)", () => {
    expect(isCamperRoomBlock(CAMPER_BUNK_BLOCK)).toBe(true);
    expect(isStandableRoomBlock(CAMPER_BUNK_BLOCK)).toBe(false);
  });

  it("recognizes only the camper's own room blocks", () => {
    for (const typeId of [
      CAMPER_CABINET_DOOR_BLOCK,
      CAMPER_FRIDGE_DOOR_BLOCK,
      CAMPER_FLOOR_BLOCK,
      CAMPER_CEILING_BLOCK,
      CAMPER_WALL_BLOCK,
      CAMPER_DOOR_BLOCK,
      CAMPER_BED_BLOCK,
      CAMPER_BUNK_BLOCK,
      CAMPER_FURNITURE_BLOCK,
      CAMPER_SHOWER_TOILET_BLOCK,
      CAMPER_SHOWER_DOOR_BLOCK,
    ])
      expect(isCamperRoomBlock(typeId)).toBe(true);
    for (const typeId of [
      DECK_FLOOR_BLOCK,
      decorBlockId("percolator"),
      "minecraft:stone",
    ])
      expect(isCamperRoomBlock(typeId)).toBe(false);
  });

  it("gives every end item of a pair block its own page and item states, 0 for an empty end, each within a block state's 16 values (ADR 0108)", () => {
    const codes = new Set<string>();
    for (const end of [0, 1] as const) {
      const states = PAIR_END_STATES[end];
      expect(pairEndStates(end, undefined)).toEqual({
        [states.page]: 0,
        [states.item]: 0,
      });
      for (const item of [undefined, ...STANDING_GEAR_IDS]) {
        const s = pairEndStates(end, item);
        const page = s[states.page] ?? -1;
        const index = s[states.item] ?? -1;
        expect(index).toBeGreaterThanOrEqual(0);
        expect(index).toBeLessThan(PAIR_PAGE_SIZE);
        expect(page).toBeGreaterThanOrEqual(0);
        expect(page * PAIR_PAGE_SIZE + index).toBe(
          item === undefined ? 0 : STANDING_GEAR_IDS.indexOf(item) + 1,
        );
        codes.add(`${end}:${page}:${index}`);
      }
    }
    expect(codes.size).toBe(2 * (STANDING_GEAR_IDS.length + 1));
    expect(PAIR_PAGE_SIZE).toBeLessThanOrEqual(16);
    expect(
      Math.ceil((STANDING_GEAR_IDS.length + 1) / PAIR_PAGE_SIZE),
    ).toBeLessThanOrEqual(16);
  });

  it("names the pair blocks, the wall cabinet's too, the way the domain's slot check expects and counts them as decor blocks (ADR 0108, 0114)", () => {
    for (const kind of ["shelf", "table", "cabinet", "fridge"]) {
      expect(pairDecorBlockId(kind)).toBe(`yasu_ride:${kind}_decor_pair`);
      expect(isDecorBlock(pairDecorBlockId(kind))).toBe(true);
    }
    for (const { cell, slots } of DECOR_CELLS) {
      const [first] = slots;
      if (!first?.pair) continue;
      const name = decorBlockName(cell, [
        { slot: first.id, item: decorItemId("cushion") },
      ]);
      expect(ownSlotBlock(pairDecorBlockId(first.pair.kind), name)).toBe(true);
    }
    expect(isDecorBlock(decorBlockId("percolator"))).toBe(true);
    expect(isDecorBlock(CAMPER_FURNITURE_BLOCK)).toBe(false);
    expect(isDecorBlock("yasu_ride:bed_decor_pair")).toBe(false);
  });

  it("names the wall cabinet's plate block the way the domain's plate check expects (ADR 0114, 0121)", () => {
    expect(WALL_CABINET.plateBlockName).toBe(
      CAMPER_CABINET_DOOR_BLOCK.slice(`${NAMESPACE}:`.length),
    );
    for (const door of WALL_CABINET.doors)
      expect(
        ownPlateBlock(CAMPER_CABINET_DOOR_BLOCK, {
          ...door,
          unit: WALL_CABINET,
        }),
      ).toBe(true);
  });

  it("names the fridge's plate block the way the domain's plate check expects, and lets a player stand only in it among the room blocks (ADR 0121, 0123)", () => {
    expect(FRIDGE.plateBlockName).toBe(
      CAMPER_FRIDGE_DOOR_BLOCK.slice(`${NAMESPACE}:`.length),
    );
    for (const door of FRIDGE.doors)
      expect(
        ownPlateBlock(CAMPER_FRIDGE_DOOR_BLOCK, { ...door, unit: FRIDGE }),
      ).toBe(true);
    expect(isStandableRoomBlock(CAMPER_FRIDGE_DOOR_BLOCK)).toBe(true);
    for (const typeId of [
      CAMPER_CABINET_DOOR_BLOCK,
      CAMPER_FLOOR_BLOCK,
      CAMPER_FURNITURE_BLOCK,
      "minecraft:stone",
    ])
      expect(isStandableRoomBlock(typeId)).toBe(false);
  });

  it("names the furniture block the way the domain's slot check expects (ADR 0097)", () => {
    expect(CAMPER_FURNITURE_BLOCK).toBe("yasu_ride:camper_furniture");
    expect(ownSlotBlock(CAMPER_FURNITURE_BLOCK, undefined)).toBe(true);
  });

  it("names the shower-toilet block and its custom component (ADR 0098)", () => {
    expect(CAMPER_SHOWER_TOILET_BLOCK).toBe("yasu_ride:camper_shower_toilet");
    expect(CAMPER_SHOWER_TOILET_COMPONENT).toBe(
      "yasu_ride:camper_shower_toilet",
    );
  });
});
