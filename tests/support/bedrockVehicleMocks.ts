import { vi } from "vitest";
import {
  ENTITY_TYPE,
  VEHICLE_FAMILY,
} from "../../src/infrastructure/vehicle/bedrock/identifiers";

export const bedrockVehicleGame = {
  getDimension: vi.fn(),
  getEntity: vi.fn(),
};
export const bedrockVehicleEngine = () => ({
  world: bedrockVehicleGame,
  system: { currentTick: 0 },
  BlockVolume: class {},
  GameMode: { Creative: "Creative", Survival: "Survival" },
  ButtonState: {},
  InputButton: {},
  EntityDamageCause: {},
  BlockPermutation: {
    resolve: (typeId: string, states: Record<string, number>) => ({
      typeId,
      states,
    }),
  },
  ItemStack: class {
    constructor(
      public typeId: string,
      public amount: number,
    ) {}
  },
});

export function fakeVehicleEntities() {
  const dimension = {
    id: "minecraft:overworld",
    getBlock: vi.fn(),
    getPlayers: vi.fn(),
    getEntities: vi.fn(),
    spawnItem: vi.fn(),
    spawnEntity: vi.fn(),
    playSound: vi.fn(),
  };
  const car = {
    id: "car",
    typeId: ENTITY_TYPE.suv,
    families: [VEHICLE_FAMILY],
    isValid: true,
    location: { x: -1.25, y: 64.25, z: 2.75 },
    dimension,
    isOnGround: false,
    getVelocity: () => ({ x: 0, y: 0, z: 0 }),
    getRotation: () => ({ y: 0 }),
    getProperty: vi.fn((_key: string): unknown => undefined),
    getComponent: vi.fn((_name: string): unknown => undefined),
    getDynamicProperty: vi.fn(),
    setDynamicProperty: vi.fn(),
    teleport: vi.fn(),
    clearVelocity: vi.fn(),
    applyImpulse: vi.fn(),
    setRotation: vi.fn(),
    remove: vi.fn(),
    triggerEvent: vi.fn(),
    playAnimation: vi.fn(),
    setProperty: vi.fn(),
  };
  const entities = [car];
  dimension.getEntities.mockImplementation(
    (query: { type?: string; families?: string[] } = {}) =>
      entities.filter(
        (e) =>
          (query.type === undefined || e.typeId === query.type) &&
          (query.families === undefined ||
            query.families.every((family) => e.families.includes(family))),
      ),
  );
  bedrockVehicleGame.getDimension.mockImplementation((id: string) =>
    id === "overworld" ? dimension : { getEntities: () => [] },
  );
  bedrockVehicleGame.getEntity.mockImplementation((id: string) =>
    id === car.id ? car : undefined,
  );
  return { dimension, car, entities };
}
