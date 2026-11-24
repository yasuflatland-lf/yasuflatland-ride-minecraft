import type { Entity } from "@minecraft/server";
import type { SpaceCheck } from "../../src/application/shared/ports/space";
import { type Cell, cellKey } from "../../src/domain/shared/cells";
import type { DockCell } from "../../src/domain/vehicle/dock/floor";
import {
  composeDockCodec,
  DECK_CODEC,
  DockBlocks,
  LIGHT_CODEC,
} from "../../src/infrastructure/vehicle/bedrock/dockBlocks";
import { DECK_CELLS_PROPERTY } from "../../src/infrastructure/vehicle/bedrock/identifiers";
import { CAMPER_ROOM_CODEC } from "../../src/infrastructure/vehicle/kinds/camper/dockBlocks";

export const dockCodec = composeDockCodec({
  ...DECK_CODEC,
  ...LIGHT_CODEC,
  ...CAMPER_ROOM_CODEC,
});

export function createDockBlocks(campSpace: SpaceCheck = () => false) {
  return new DockBlocks(campSpace, dockCodec);
}

type Unavailable = "throw" | "undefined" | undefined;

// Each dimension has its own blocks, so a test can tell which one was changed.
export function fakeDimension(id: string) {
  const blocks = new Map<
    string,
    { typeId: string; states?: Record<string, number | boolean> }
  >();
  let unavailable: Unavailable;
  const at = (c: Cell) => blocks.get(cellKey(c)) ?? { typeId: "minecraft:air" };
  const writes: string[] = [];
  const dimension = {
    id,
    getBlock: (c: DockCell) => {
      if (unavailable === "throw") throw new Error("unloaded");
      if (unavailable === "undefined") return undefined;
      return {
        get typeId() {
          return at(c).typeId;
        },
        get isAir() {
          return at(c).typeId === "minecraft:air";
        },
        setType: (typeId: string) => blocks.set(cellKey(c), { typeId }),
        setPermutation: (p: {
          typeId: string;
          states: Record<string, number | boolean>;
        }) => {
          writes.push(cellKey(c));
          return blocks.set(cellKey(c), {
            typeId: p.typeId,
            states: p.states,
          });
        },
      };
    },
  };
  return {
    dimension,
    writes,
    at,
    blocks,
    unavailable: (mode: Unavailable) => {
      unavailable = mode;
    },
  };
}

export function dockFixture() {
  const overworld = fakeDimension("overworld");
  const saved = new Map<string, unknown>();
  const car = {
    id: "car",
    isValid: true,
    dimension: overworld.dimension,
    getDynamicProperty: (key: string) => saved.get(key),
    setDynamicProperty: (key: string, value: unknown) => saved.set(key, value),
  } as unknown as Entity;
  return {
    car,
    writes: overworld.writes,
    at: overworld.at,
    blocks: overworld.blocks,
    saved,
    savedCells: () => JSON.parse(String(saved.get(DECK_CELLS_PROPERTY))),
    unavailable: overworld.unavailable,
  };
}
