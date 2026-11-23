import type { Entity, Player } from "@minecraft/server";
import fc from "fast-check";
import { beforeEach, expect, it, vi } from "vitest";
import { TENT_LAYOUT_VERSION, TENT_SPEC } from "../../../src/domain/camp/spec";
import {
  flapCells,
  PITCHED_STATE,
  tentCells,
} from "../../../src/domain/camp/tent";
import { asDimensionId } from "../../../src/domain/shared/ids";
import { BedrockRoofTentOccupantWorld } from "../../../src/infrastructure/camp/bedrock/bedrockRoofTentOccupantWorld";
import { registerDutchOven } from "../../../src/infrastructure/camp/bedrock/handlers/dutchOven";
import { registerFirePit } from "../../../src/infrastructure/camp/bedrock/handlers/firePit";
import { registerGasLantern } from "../../../src/infrastructure/camp/bedrock/handlers/gasLantern";
import {
  CHAIR_KINDS,
  GAS_LANTERN_TYPE,
  ROOF_TENT_ITEM,
  ROOF_TENT_STARTER_RECEIVED_PROPERTY,
  TENT_CEILING_BLOCK,
  TENT_FLAP_COMPONENT,
  TENT_FLAP_PROPERTY,
  TENT_MATTRESS_COMPONENT,
  TENT_TYPE,
  TENT_WALL_BLOCK,
  TENTS_PROPERTY,
} from "../../../src/infrastructure/camp/identifiers";
import { installCamp } from "../../../src/infrastructure/camp/install";
import { registerLaidBlockGuard } from "../../../src/infrastructure/shared/laidBlockGuard";
import { campTopHosts } from "../../support/campTopHosts";
import { defined } from "../../support/defined";

const registrations = vi.hoisted(() => {
  const log: string[] = [];
  const handler = (name: string) =>
    vi.fn(() => {
      log.push(name);
    });
  function trace<A extends unknown[], R>(register: (...args: A) => R) {
    return vi.fn((...args: A) => {
      log.push(register.name);
      return register(...args);
    });
  }
  return { log, handler, trace };
});

const game = vi.hoisted(() => {
  function signal() {
    const subscribe = vi.fn<(listener: (ev: never) => void) => void>();
    return {
      subscribe,
      fire: (event: unknown) => {
        for (const [listener] of subscribe.mock.calls) listener(event as never);
      },
    };
  }
  return {
    getDynamicProperty: vi.fn(),
    getEntity: vi.fn(),
    interactBlock: signal(),
    interactEntity: signal(),
    breakBlock: signal(),
    startup: signal(),
    entityLoad: signal(),
    entitySpawn: signal(),
    playerSpawn: signal(),
    interval: signal(),
    run: vi.fn(),
  };
});
vi.mock("@minecraft/server", () => ({
  GameMode: { Creative: "creative" },
  ItemStack: class {
    constructor(
      readonly typeId: string,
      readonly amount: number,
    ) {}
  },
  Direction: {
    Up: "up",
    Down: "down",
    North: "north",
    East: "east",
    West: "west",
    South: "south",
  },
  world: {
    getDynamicProperty: game.getDynamicProperty,
    getEntity: game.getEntity,
    beforeEvents: {
      playerInteractWithBlock: game.interactBlock,
      playerInteractWithEntity: game.interactEntity,
      playerBreakBlock: game.breakBlock,
    },
    afterEvents: {
      entityLoad: game.entityLoad,
      entitySpawn: game.entitySpawn,
      playerSpawn: game.playerSpawn,
    },
  },
  system: {
    beforeEvents: { startup: game.startup },
    runInterval: game.interval.subscribe,
    currentTick: 42,
    run: game.run,
  },
}));
vi.mock(
  "../../../src/infrastructure/camp/bedrock/handlers/testTentLantern",
  () => ({
    registerTestTentLantern: registrations.handler("registerTestTentLantern"),
  }),
);
vi.mock("../../../src/infrastructure/camp/bedrock/handlers/tentHits", () => ({
  registerTentHits: registrations.handler("registerTentHits"),
}));
vi.mock(
  "../../../src/infrastructure/camp/bedrock/handlers/tentPlacement",
  () => ({
    registerTentPlacement: registrations.handler("registerTentPlacement"),
  }),
);
vi.mock(
  "../../../src/infrastructure/camp/bedrock/handlers/tentLifecycle",
  () => ({
    registerTentLifecycle: registrations.handler("registerTentLifecycle"),
  }),
);
vi.mock("../../../src/infrastructure/camp/bedrock/handlers/testTent", () => ({
  registerTestTent: registrations.handler("registerTestTent"),
}));
vi.mock(
  "../../../src/infrastructure/camp/bedrock/handlers/testTentFlap",
  () => ({
    registerTestTentFlap: registrations.handler("registerTestTentFlap"),
  }),
);
vi.mock(
  import("../../../src/infrastructure/shared/bedBlock"),
  async (load) => ({
    registerBedBlock: registrations.trace((await load()).registerBedBlock),
  }),
);
vi.mock("../../../src/infrastructure/camp/bedrock/handlers/hits", () => ({
  registerChairHits: registrations.handler("registerChairHits"),
}));
vi.mock("../../../src/infrastructure/camp/bedrock/handlers/testHit", () => ({
  registerTestChairHit: registrations.handler("registerTestChairHit"),
}));
vi.mock("../../../src/infrastructure/camp/bedrock/handlers/table", () => ({
  registerTable: registrations.handler("registerTable"),
}));
vi.mock("../../../src/infrastructure/camp/bedrock/handlers/firePit", () => ({
  registerFirePit: registrations.handler("registerFirePit"),
}));
vi.mock("../../../src/infrastructure/camp/bedrock/handlers/dutchOven", () => ({
  registerDutchOven: registrations.handler("registerDutchOven"),
}));
vi.mock(
  import("../../../src/infrastructure/camp/bedrock/handlers/placement"),
  async (load) => ({
    registerChairPlacement: registrations.trace(
      (await load()).registerChairPlacement,
    ),
  }),
);
vi.mock(
  import("../../../src/infrastructure/camp/bedrock/handlers/roofTentPlacement"),
  async (load) => ({
    registerRoofTentPlacement: registrations.trace(
      (await load()).registerRoofTentPlacement,
    ),
  }),
);
vi.mock(
  import("../../../src/infrastructure/camp/bedrock/handlers/tentFlap"),
  async (load) => ({
    registerTentFlap: registrations.trace((await load()).registerTentFlap),
  }),
);
vi.mock(
  import("../../../src/infrastructure/camp/bedrock/handlers/tentLoop"),
  async (load) => ({
    registerTentLoop: registrations.trace((await load()).registerTentLoop),
  }),
);
vi.mock(
  import("../../../src/infrastructure/shared/laidBlockGuard"),
  async (load) => ({
    registerLaidBlockGuard: registrations.trace(
      (await load()).registerLaidBlockGuard,
    ),
  }),
);
vi.mock("../../../src/infrastructure/camp/bedrock/handlers/gasLantern", () => ({
  registerGasLantern: registrations.handler("registerGasLantern"),
}));
vi.mock(
  "../../../src/infrastructure/camp/bedrock/handlers/roofTentHits",
  () => ({
    registerRoofTentHits: registrations.handler("registerRoofTentHits"),
  }),
);
vi.mock(
  "../../../src/infrastructure/camp/bedrock/handlers/roofTentLifecycle",
  () => ({
    registerRoofTentLifecycle: registrations.handler(
      "registerRoofTentLifecycle",
    ),
  }),
);
vi.mock(
  "../../../src/infrastructure/camp/bedrock/handlers/testRoofTent",
  () => ({
    registerTestRoofTent: registrations.handler("registerTestRoofTent"),
  }),
);

vi.mock(
  "../../../src/infrastructure/camp/bedrock/handlers/roofTentEnter",
  () => ({
    registerRoofTentEnter: registrations.handler("registerRoofTentEnter"),
  }),
);

vi.mock(
  "../../../src/infrastructure/camp/bedrock/handlers/roofTentMenu",
  () => ({ createRoofTentMenu: vi.fn(() => vi.fn()) }),
);

vi.mock(
  "../../../src/infrastructure/camp/bedrock/handlers/roofTentOccupantCleanup",
  () => ({
    registerRoofTentOccupantCleanup: vi.fn(() => {
      registrations.log.push("registerRoofTentOccupantCleanup");
      return vi.fn();
    }),
  }),
);

vi.mock(
  import("../../../src/infrastructure/shared/starterItem"),
  async (load) => {
    const original = await load();
    return {
      ...original,
      registerStarterItem: registrations.trace(original.registerStarterItem),
    };
  },
);

function install(deps: Partial<Parameters<typeof installCamp>[0]> = {}) {
  return installCamp({
    topHosts: campTopHosts(),
    vehicleHost: () => ({ status: "unknown" }),
    isVehicleSpace: () => false,
    ...deps,
  });
}

const dimension = { id: "minecraft:overworld" };
const POSE = { x: 110, y: -60, z: 46, yaw: 180 } as const;
const SAVED = JSON.stringify([
  {
    id: "t",
    dimensionId: dimension.id,
    pose: POSE,
    layout: TENT_LAYOUT_VERSION,
  },
]);
const wall = defined(
  tentCells(POSE, PITCHED_STATE).find((c) => c.block.type === "wall"),
  "wall",
);

beforeEach(() => {
  vi.clearAllMocks();
  game.getDynamicProperty.mockReset();
  game.getEntity.mockReset();
  registrations.log.length = 0;
});

it("leaves a chair placement in vehicle space unclaimed (ADR 0122)", () => {
  const isVehicleSpace = vi.fn(() => true);
  install({ isVehicleSpace });
  const event = {
    itemStack: { typeId: CHAIR_KINDS.low_chair.itemId },
    isFirstEvent: true,
    block: { dimension, location: { x: 0, y: 64, z: 0 } },
    blockFace: "up",
    cancel: false,
  };
  game.interactBlock.fire(event);
  expect(isVehicleSpace).toHaveBeenCalledWith(dimension.id, {
    x: 0,
    y: 65,
    z: 0,
  });
  expect(event.cancel).toBe(false);
  expect(game.run).not.toHaveBeenCalled();
});
it("registers the tent mattress component at startup (ADR 0133)", () => {
  install();
  const registerCustomComponent = vi.fn();
  game.startup.fire({ blockComponentRegistry: { registerCustomComponent } });
  expect(registerCustomComponent).toHaveBeenCalledWith(
    TENT_MATTRESS_COMPONENT,
    { onPlayerInteract: expect.any(Function) },
  );
});

it("gives the roof tent starter on join and marks the roof tent receipt", () => {
  const addItem = vi.fn();
  const player = {
    id: "p",
    typeId: "minecraft:player",
    isValid: true,
    getGameMode: () => "survival",
    getDynamicProperty: vi.fn(),
    setDynamicProperty: vi.fn(),
    getComponent: () => ({ container: { addItem } }),
  };
  game.getEntity.mockImplementation((id) =>
    id === player.id ? player : undefined,
  );
  install();
  game.playerSpawn.fire({ initialSpawn: true, player });
  expect(addItem).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ typeId: ROOF_TENT_ITEM, amount: 1 }),
  );
  expect(player.setDynamicProperty).toHaveBeenCalledExactlyOnceWith(
    ROOF_TENT_STARTER_RECEIVED_PROPERTY,
    true,
  );
});

it("claims no camp space for any dimension and integer cell without a tent (ADR 0129)", () => {
  const { isCampSpace } = install();
  fc.assert(
    fc.property(
      fc.string(),
      fc.record({ x: fc.integer(), y: fc.integer(), z: fc.integer() }),
      (dim, at) => {
        expect(isCampSpace(asDimensionId(dim), at)).toBe(false);
      },
    ),
  );
});

it("claims each registered tent's footprint as camp space (ADR 0131)", () => {
  game.getDynamicProperty.mockReturnValue(SAVED);
  const { isCampSpace } = install();
  const here = asDimensionId("minecraft:overworld");
  expect(isCampSpace(here, { x: 110, y: -60, z: 50 })).toBe(true);
  expect(isCampSpace(here, { x: 110, y: -60, z: 58 })).toBe(false);
  expect(
    isCampSpace(asDimensionId("minecraft:nether"), { x: 110, y: -60, z: 50 }),
  ).toBe(false);
  expect(game.getDynamicProperty).toHaveBeenCalledWith(TENTS_PROPERTY);
});

it("protects a saved tent wall and leaves a replacement block breakable (ADR 0131)", () => {
  game.getDynamicProperty.mockReturnValue(SAVED);
  install();
  for (const [typeId, protectedBlock] of [
    [TENT_WALL_BLOCK, true],
    ["minecraft:stone", false],
  ] as const) {
    const event = {
      dimension,
      block: { location: wall, typeId },
      cancel: false,
    };
    game.breakBlock.fire(event);
    expect(event.cancel).toBe(protectedBlock);
  }
});

it("opens the tapped front flap on the next tick while preserving the saved left flap (ADR 0132)", () => {
  game.getDynamicProperty.mockReturnValue(SAVED);
  const tent = {
    id: "t",
    typeId: TENT_TYPE,
    isValid: true,
    dimension: { ...dimension, getBlock: () => undefined },
    getDynamicProperty: vi.fn(),
    setDynamicProperty: vi.fn(),
    getProperty: (name: string) => (name === TENT_FLAP_PROPERTY.left ? 1 : 0),
    setProperty: vi.fn(),
  };
  game.getEntity.mockImplementation((id) => (id === "t" ? tent : undefined));
  install();
  const front = defined(flapCells(POSE, "front")[0], "front flap");
  game.startup.fire({
    blockComponentRegistry: {
      registerCustomComponent: (
        id: string,
        component: { onPlayerInteract: (event: unknown) => void },
      ) => {
        if (id === TENT_FLAP_COMPONENT)
          component.onPlayerInteract({ dimension, block: { location: front } });
      },
    },
  });
  game.interval.fire(undefined);
  expect(tent.setProperty).toHaveBeenCalledWith(
    TENT_FLAP_PROPERTY.front,
    1 / TENT_SPEC.flapSwingTicks,
  );
  expect(tent.setProperty).toHaveBeenCalledWith(TENT_FLAP_PROPERTY.left, 1);
});

it("offers the tent switch in both rooms and the Gas Lantern switch on its entity", () => {
  game.getDynamicProperty.mockReturnValue(SAVED);
  game.getEntity.mockImplementation((id) =>
    id === "t" ? { isValid: true, typeId: TENT_TYPE } : undefined,
  );
  const { switchTargets } = install();
  const playerAt = (x: number, z: number) =>
    ({
      isValid: true,
      dimension,
      location: { x, y: -60, z },
      getComponent: () => undefined,
    }) as unknown as Player;
  for (const [x, z, inside] of [
    [110.5, 52.5, true],
    [110.5, 47.5, true],
    [113.5, 47.5, false],
  ] as const) {
    expect(
      switchTargets.map((target) => target.claimsItemUse(playerAt(x, z))),
    ).toEqual([inside, false]);
  }
  expect(
    switchTargets.map((target) =>
      target.claimsEntityPress(playerAt(110.5, 52.5), {
        typeId: GAS_LANTERN_TYPE,
      } as Entity),
    ),
  ).toEqual([false, true]);
});

it("leaves a roof tent press on an unknown vehicle host unclaimed", () => {
  const vehicleHost = vi.fn(() => ({ status: "unknown" as const }));
  install({ vehicleHost });
  const event = {
    itemStack: { typeId: ROOF_TENT_ITEM },
    target: { id: "host" },
    cancel: false,
  };
  game.interactEntity.fire(event);
  expect(vehicleHost).toHaveBeenCalledWith("host");
  expect(event.cancel).toBe(false);
  expect(game.run).not.toHaveBeenCalled();
});
it("cancels a break claimed by the roof tent ceiling guard", () => {
  const tent = vi
    .spyOn(BedrockRoofTentOccupantWorld.prototype, "ceilingOwner")
    .mockImplementation((_dim, _cell, typeId) =>
      typeId === TENT_CEILING_BLOCK ? "roof" : undefined,
    );
  try {
    install();
    const event = {
      dimension,
      block: { location: { x: 0, y: 4, z: 0 }, typeId: TENT_CEILING_BLOCK },
      cancel: false,
    };
    game.breakBlock.fire(event);
    expect(event.cancel).toBe(true);
  } finally {
    tent.mockRestore();
  }
});

it("registers oven interactions before fire pit interactions", () => {
  install();
  expect(vi.mocked(registerDutchOven).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(registerFirePit).mock.invocationCallOrder[0] ?? 0,
  );
});

it("registers Gas Lantern interactions after Fire Pit interactions", () => {
  install();
  expect(vi.mocked(registerFirePit).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(registerGasLantern).mock.invocationCallOrder[0] ?? 0,
  );
});

it("preserves handler registration order on each engine signal", () => {
  game.getDynamicProperty.mockReturnValue(SAVED);
  const logGuard = (owner: Parameters<typeof registerLaidBlockGuard>[0]) => {
    registrations.log.push(
      owner(asDimensionId(dimension.id), wall, TENT_WALL_BLOCK) === "t"
        ? "tentGuard"
        : "ceilingGuard",
    );
  };
  vi.mocked(registerLaidBlockGuard)
    .mockImplementationOnce(logGuard)
    .mockImplementationOnce(logGuard);
  install();

  const lifecycle = [
    "registerRoofTentLifecycle",
    "registerTentLoop",
    "registerTentLifecycle",
  ];
  const expected = {
    playerInteractWithBlock: [
      "registerChairPlacement",
      "registerTable",
      "registerDutchOven",
      "registerFirePit",
      "registerGasLantern",
      "registerRoofTentPlacement",
      "registerTentPlacement",
    ],
    playerInteractWithEntity: [
      "registerDutchOven",
      "registerFirePit",
      "registerGasLantern",
      "registerRoofTentEnter",
      "registerRoofTentPlacement",
    ],
    entityHitEntity: [
      "registerChairHits",
      "registerTable",
      "registerDutchOven",
      "registerFirePit",
      "registerGasLantern",
      "registerRoofTentHits",
      "registerTentHits",
    ],
    scriptEventReceive: [
      "registerTestChairHit",
      "registerTable",
      "registerDutchOven",
      "registerFirePit",
      "registerGasLantern",
      "registerTestRoofTent",
      "registerTestTent",
      "registerTestTentFlap",
      "registerTestTentLantern",
    ],
    entityLoad: lifecycle,
    entitySpawn: lifecycle,
    entityRemove: ["registerRoofTentLifecycle", "registerTentLifecycle"],
    playerBreakBlock: ["registerTentHits", "tentGuard", "ceilingGuard"],
    startup: ["registerBedBlock", "registerTentFlap"],
    playerSpawn: ["registerStarterItem"],
    playerLeave: ["registerRoofTentOccupantCleanup"],
    entityDie: ["registerRoofTentOccupantCleanup"],
    playerDimensionChange: ["registerRoofTentOccupantCleanup"],
    itemUse: ["registerRoofTentEnter"],
    entityHitBlock: ["registerTentHits"],
  };
  for (const [signal, handlers] of Object.entries(expected)) {
    expect(
      registrations.log.filter((name) => handlers.includes(name)),
      signal,
    ).toEqual(handlers);
  }
});
