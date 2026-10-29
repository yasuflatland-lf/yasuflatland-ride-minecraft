import { beforeEach, expect, it, vi } from "vitest";
import {
  DUTCH_OVEN_FOOTPRINT_PX,
  GAS_LANTERN_FOOTPRINT_PX,
} from "../../../src/domain/camp/spec";
import { asDimensionId } from "../../../src/domain/shared/ids";
import { BedrockGasLanternWorld } from "../../../src/infrastructure/camp/bedrock/bedrockGasLanternWorld";
import { createGasLanternLight } from "../../../src/infrastructure/camp/bedrock/gasLanternLight";
import { itemsOnTable } from "../../../src/infrastructure/camp/bedrock/tableItems";
import {
  CAMP_TABLE_TYPE,
  DUTCH_OVEN_HOST_PROPERTY,
  DUTCH_OVEN_TYPE,
  GAS_LANTERN_HOST_PROPERTY,
  GAS_LANTERN_HOSTED_EVENT,
  GAS_LANTERN_TYPE,
} from "../../../src/infrastructure/camp/identifiers";

const game = vi.hoisted(() => ({ getEntity: vi.fn(), getDimension: vi.fn() }));
vi.mock("@minecraft/server", () => ({
  world: game,
  BlockPermutation: { resolve: (id: string) => ({ id }) },
}));
beforeEach(() => vi.resetAllMocks());

const hosted = (property: string, host: string | undefined) => ({
  getDynamicProperty: (key: string) => (key === property ? host : undefined),
});

it("returns ovens and lanterns standing on the table together, and no ground lantern", () => {
  const entities: Record<string, ReturnType<typeof hosted>[]> = {
    [DUTCH_OVEN_TYPE]: [
      hosted(DUTCH_OVEN_HOST_PROPERTY, "camp_table:table:@-9,0"),
      hosted(DUTCH_OVEN_HOST_PROPERTY, "camp_table:other:@0,0"),
    ],
    [GAS_LANTERN_TYPE]: [
      hosted(GAS_LANTERN_HOST_PROPERTY, "camp_table:table:@4,-1.5"),
      hosted(GAS_LANTERN_HOST_PROPERTY, undefined),
      hosted(GAS_LANTERN_HOST_PROPERTY, ""),
    ],
  };
  game.getEntity.mockReturnValue({
    isValid: true,
    typeId: CAMP_TABLE_TYPE,
    dimension: {
      getEntities: ({ type }: { type: string }) => entities[type] ?? [],
    },
  });
  expect(itemsOnTable("table")).toEqual([
    { at: { x: -9, z: 0 }, footprint: DUTCH_OVEN_FOOTPRINT_PX },
    { at: { x: 4, z: -1.5 }, footprint: GAS_LANTERN_FOOTPRINT_PX },
  ]);
});

it("spawns a hosted lantern at the table's yaw, marks its host, and stops its fall", () => {
  const lantern = {
    setRotation: vi.fn(),
    setDynamicProperty: vi.fn(),
    triggerEvent: vi.fn(),
    clearVelocity: vi.fn(),
  };
  const spawnEntity = vi.fn(() => lantern);
  game.getDimension.mockReturnValue({ spawnEntity });
  const lanterns = new BedrockGasLanternWorld(
    { isVehicleSpace: () => false },
    createGasLanternLight(),
  );
  const at = { x: 1, y: 64.75, z: 2 };
  lanterns.spawnHostedOnTable(
    "gas_lantern",
    asDimensionId("overworld"),
    at,
    90,
    "camp_table:table:@4,0",
  );
  expect(spawnEntity).toHaveBeenCalledExactlyOnceWith(GAS_LANTERN_TYPE, at);
  expect(lantern.setRotation).toHaveBeenCalledWith({ x: 0, y: 90 });
  expect(lantern.setDynamicProperty).toHaveBeenCalledExactlyOnceWith(
    GAS_LANTERN_HOST_PROPERTY,
    "camp_table:table:@4,0",
  );
  expect(lantern.triggerEvent).toHaveBeenCalledExactlyOnceWith(
    GAS_LANTERN_HOSTED_EVENT,
  );
  expect(lantern.clearVelocity).toHaveBeenCalledOnce();
});
