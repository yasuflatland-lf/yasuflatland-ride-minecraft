import fc from "fast-check";
import { beforeEach, expect, it, vi } from "vitest";
import { DutchOvenActions } from "../../../src/application/camp/dutchOven";
import { EnterRoofTent } from "../../../src/application/camp/enterRoofTent";
import { FirePitActions } from "../../../src/application/camp/firePit";
import { FoldLegacyTents } from "../../../src/application/camp/foldLegacyTents";
import { FoldRoofTent } from "../../../src/application/camp/foldRoofTent";
import { GasLanternActions } from "../../../src/application/camp/gasLantern";
import { HitChair } from "../../../src/application/camp/hitChair";
import { HitTable } from "../../../src/application/camp/hitTable";
import { LeaveRoofTent } from "../../../src/application/camp/leaveRoofTent";
import { PaintRoofTent } from "../../../src/application/camp/paintRoofTent";
import { PaintTent } from "../../../src/application/camp/paintTent";
import { PitchTent } from "../../../src/application/camp/pitchTent";
import { PlaceChair } from "../../../src/application/camp/placeChair";
import { PlaceRoofTent } from "../../../src/application/camp/placeRoofTent";
import { PlaceTable } from "../../../src/application/camp/placeTable";
import { RoofTentHostGuard } from "../../../src/application/camp/roofTentHostGuard";
import { RoofTentMenu } from "../../../src/application/camp/roofTentMenu";
import {
  ClearRoofTentSpawn,
  RoofTentCleanup,
} from "../../../src/application/camp/roofTentRemoved";
import { SleepInRoofTent } from "../../../src/application/camp/sleepInRoofTent";
import { SwitchLantern } from "../../../src/application/camp/switchLantern";
import { TakeDownTent } from "../../../src/application/camp/takeDownTent";
import { UseTentFlap } from "../../../src/application/camp/useTentFlap";
import { GiveStarterItem } from "../../../src/application/shared/giveStarterItem";
import { HostedItemsGuard } from "../../../src/application/shared/hostedItemsGuard";
import { SleepInBed } from "../../../src/application/shared/sleepInBed";
import {
  asTentId,
  flapCells,
  PITCHED_STATE,
  tentCells,
} from "../../../src/domain/camp/tent";
import { asDimensionId } from "../../../src/domain/shared/ids";
import { BedrockGasLanternWorld } from "../../../src/infrastructure/camp/bedrock/bedrockGasLanternWorld";
import { BedrockRoofTentOccupantWorld } from "../../../src/infrastructure/camp/bedrock/bedrockRoofTentOccupantWorld";
import { gasLanternSwitchTarget } from "../../../src/infrastructure/camp/bedrock/gasLanternSwitch";
import { registerDutchOven } from "../../../src/infrastructure/camp/bedrock/handlers/dutchOven";
import { registerFirePit } from "../../../src/infrastructure/camp/bedrock/handlers/firePit";
import { registerGasLantern } from "../../../src/infrastructure/camp/bedrock/handlers/gasLantern";
import { registerChairHits } from "../../../src/infrastructure/camp/bedrock/handlers/hits";
import { registerChairPlacement } from "../../../src/infrastructure/camp/bedrock/handlers/placement";
import { registerRoofTentEnter } from "../../../src/infrastructure/camp/bedrock/handlers/roofTentEnter";
import { registerRoofTentHits } from "../../../src/infrastructure/camp/bedrock/handlers/roofTentHits";
import { registerRoofTentLifecycle } from "../../../src/infrastructure/camp/bedrock/handlers/roofTentLifecycle";
import { createRoofTentMenu } from "../../../src/infrastructure/camp/bedrock/handlers/roofTentMenu";
import { registerRoofTentOccupantCleanup } from "../../../src/infrastructure/camp/bedrock/handlers/roofTentOccupantCleanup";
import { registerRoofTentPlacement } from "../../../src/infrastructure/camp/bedrock/handlers/roofTentPlacement";
import { registerTable } from "../../../src/infrastructure/camp/bedrock/handlers/table";
import { registerTentFlap } from "../../../src/infrastructure/camp/bedrock/handlers/tentFlap";
import { registerTentHits } from "../../../src/infrastructure/camp/bedrock/handlers/tentHits";
import { registerTentLifecycle } from "../../../src/infrastructure/camp/bedrock/handlers/tentLifecycle";
import { registerTentLoop } from "../../../src/infrastructure/camp/bedrock/handlers/tentLoop";
import { registerTentPlacement } from "../../../src/infrastructure/camp/bedrock/handlers/tentPlacement";
import { registerTestChairHit } from "../../../src/infrastructure/camp/bedrock/handlers/testHit";
import { registerTestRoofTent } from "../../../src/infrastructure/camp/bedrock/handlers/testRoofTent";
import { registerTestTent } from "../../../src/infrastructure/camp/bedrock/handlers/testTent";
import { registerTestTentFlap } from "../../../src/infrastructure/camp/bedrock/handlers/testTentFlap";
import { registerTestTentLantern } from "../../../src/infrastructure/camp/bedrock/handlers/testTentLantern";
import { lanternSwitchTarget } from "../../../src/infrastructure/camp/bedrock/lanternSwitch";
import { TentFlapStore } from "../../../src/infrastructure/camp/bedrock/tentFlapStore";
import {
  ROOF_TENT_ITEM,
  ROOF_TENT_STARTER_RECEIVED_PROPERTY,
  TENT_FLAP_PROPERTY,
  TENT_MATTRESS_COMPONENT,
  TENT_TYPE,
  TENT_WALL_BLOCK,
  TENTS_PROPERTY,
} from "../../../src/infrastructure/camp/identifiers";
import { installCamp } from "../../../src/infrastructure/camp/install";
import { registerBedBlock } from "../../../src/infrastructure/shared/bedBlock";
import { BedrockBedWorld } from "../../../src/infrastructure/shared/bedrockBedWorld";
import { registerLaidBlockGuard } from "../../../src/infrastructure/shared/laidBlockGuard";
import { registerStarterItem } from "../../../src/infrastructure/shared/starterItem";
import { TopHostRegistry } from "../../../src/infrastructure/shared/tableTop/registry";
import { campTopHosts } from "../../support/campTopHosts";
import { defined } from "../../support/defined";

const registrations = vi.hoisted(() => {
  const log: string[] = [];
  const handler = (name: string) =>
    vi.fn(() => {
      log.push(name);
    });
  return { log, handler };
});

const game = vi.hoisted(() => ({
  getDynamicProperty: vi.fn(),
  getEntity: vi.fn(),
}));
vi.mock("@minecraft/server", () => ({
  world: {
    getDynamicProperty: game.getDynamicProperty,
    getEntity: game.getEntity,
  },
  system: {},
}));
const gasLanternTarget = vi.hoisted(() => ({ fake: "Gas Lantern target" }));
vi.mock("../../../src/infrastructure/camp/bedrock/gasLanternSwitch", () => ({
  gasLanternSwitchTarget: vi.fn(() => gasLanternTarget),
}));
const lanternTarget = vi.hoisted(() => ({ fake: "lantern target" }));
vi.mock("../../../src/infrastructure/camp/bedrock/lanternSwitch", () => ({
  lanternSwitchTarget: vi.fn(() => lanternTarget),
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
vi.mock("../../../src/infrastructure/camp/bedrock/handlers/tentLoop", () => ({
  registerTentLoop: registrations.handler("registerTentLoop"),
}));
vi.mock(
  "../../../src/infrastructure/camp/bedrock/handlers/tentLifecycle",
  () => ({
    registerTentLifecycle: registrations.handler("registerTentLifecycle"),
  }),
);
vi.mock("../../../src/infrastructure/camp/bedrock/handlers/testTent", () => ({
  registerTestTent: registrations.handler("registerTestTent"),
}));
vi.mock("../../../src/infrastructure/camp/bedrock/handlers/tentFlap", () => ({
  registerTentFlap: registrations.handler("registerTentFlap"),
}));
vi.mock(
  "../../../src/infrastructure/camp/bedrock/handlers/testTentFlap",
  () => ({
    registerTestTentFlap: registrations.handler("registerTestTentFlap"),
  }),
);
vi.mock("../../../src/infrastructure/shared/bedBlock", () => ({
  registerBedBlock: registrations.handler("registerBedBlock"),
}));
vi.mock("../../../src/infrastructure/shared/laidBlockGuard", () => ({
  registerLaidBlockGuard: registrations.handler("registerLaidBlockGuard"),
}));
vi.mock("../../../src/infrastructure/camp/bedrock/handlers/hits", () => ({
  registerChairHits: registrations.handler("registerChairHits"),
}));
vi.mock("../../../src/infrastructure/camp/bedrock/handlers/placement", () => ({
  registerChairPlacement: registrations.handler("registerChairPlacement"),
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

it("wires one hit use case into both hit handlers and asks the vehicles for their space (ADR 0122)", () => {
  const isVehicleSpace = vi.fn(() => true);
  installCamp({
    topHosts: campTopHosts(),
    vehicleHost: () => ({ status: "unknown" }),
    isVehicleSpace,
  });
  const hitChair = vi.mocked(registerChairHits).mock.calls[0]?.[0];
  expect(hitChair).toBeInstanceOf(HitChair);
  expect(vi.mocked(registerTestChairHit).mock.calls[0]?.[0]).toBe(hitChair);
  const placeChair = vi.mocked(registerChairPlacement).mock.calls[0]?.[0];
  expect(placeChair).toBeInstanceOf(PlaceChair);
  // A refusal for the vehicles' space shows the check reached the chair world.
  const here = asDimensionId("overworld");
  expect(
    placeChair?.cellFor(here, { x: 0, y: 64, z: 0 }, "up"),
  ).toBeUndefined();
  expect(isVehicleSpace).toHaveBeenCalledWith(here, { x: 0, y: 65, z: 0 });
  const [placeTable, hitTable] = vi.mocked(registerTable).mock.calls[0] ?? [];
  expect(placeTable).toBeInstanceOf(PlaceTable);
  expect(hitTable).toBeInstanceOf(HitTable);
  expect(vi.mocked(registerFirePit).mock.calls[0]?.[0]).toBeInstanceOf(
    FirePitActions,
  );
  const [ovenActions, hostedItems] =
    vi.mocked(registerDutchOven).mock.calls[0] ?? [];
  expect(ovenActions).toBeInstanceOf(DutchOvenActions);
  expect(hostedItems).toBeInstanceOf(HostedItemsGuard);
});

it("registers the tent mattress as a bed with its own SleepInBed (ADR 0092, 0133)", () => {
  installCamp({
    topHosts: campTopHosts(),
    vehicleHost: () => ({ status: "unknown" }),
    isVehicleSpace: () => false,
  });
  expect(registerBedBlock).toHaveBeenCalledTimes(1);
  const [componentId, bed] = vi.mocked(registerBedBlock).mock.calls[0] ?? [];
  expect(componentId).toBe(TENT_MATTRESS_COMPONENT);
  expect(bed).toBeInstanceOf(SleepInBed);
});

it("claims no camp space for any dimension and integer cell without a tent (ADR 0129)", () => {
  const { isCampSpace } = installCamp({
    topHosts: campTopHosts(),
    vehicleHost: () => ({ status: "unknown" }),
    isVehicleSpace: () => false,
  });
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

const POSE = { x: 110, y: -60, z: 46, yaw: 180 } as const;
const SAVED = JSON.stringify([
  { id: "t", dimensionId: "minecraft:overworld", pose: POSE },
]);

beforeEach(() => vi.clearAllMocks());

it("claims each registered tent's footprint as camp space (ADR 0131)", () => {
  game.getDynamicProperty.mockReturnValue(SAVED);
  const { isCampSpace } = installCamp({
    topHosts: campTopHosts(),
    vehicleHost: () => ({ status: "unknown" }),
    isVehicleSpace: () => false,
  });
  const here = asDimensionId("minecraft:overworld");
  expect(isCampSpace(here, { x: 110, y: -60, z: 50 })).toBe(true);
  expect(isCampSpace(here, { x: 110, y: -60, z: 58 })).toBe(false);
  expect(
    isCampSpace(asDimensionId("minecraft:nether"), { x: 110, y: -60, z: 50 }),
  ).toBe(false);
  expect(game.getDynamicProperty).toHaveBeenCalledWith(TENTS_PROPERTY);
  game.getDynamicProperty.mockReset();
});

it("wires the tent handlers with the same use cases, registry, and owner lookup (ADR 0131)", () => {
  game.getDynamicProperty.mockReturnValue(SAVED);
  installCamp({
    topHosts: campTopHosts(),
    vehicleHost: () => ({ status: "unknown" }),
    isVehicleSpace: () => false,
  });
  const pitchTent = vi.mocked(registerTentPlacement).mock.calls[0]?.[0];
  expect(pitchTent).toBeInstanceOf(PitchTent);
  const [takeDown, paintTent, owner] =
    vi.mocked(registerTentHits).mock.calls[0] ?? [];
  expect(takeDown).toBeInstanceOf(TakeDownTent);
  expect(paintTent).toBeInstanceOf(PaintTent);
  expect(vi.mocked(registerTestTent).mock.calls[0]).toEqual([
    pitchTent,
    takeDown,
    vi.mocked(registerTentLoop).mock.calls[0]?.[0],
    vi.mocked(registerTentLoop).mock.calls[0]?.[3],
  ]);
  expect(vi.mocked(registerTentLoop).mock.calls[0]?.[3]).toBeInstanceOf(
    FoldLegacyTents,
  );
  const registry = vi.mocked(registerTentLoop).mock.calls[0]?.[0];
  expect(vi.mocked(registerTentLifecycle).mock.calls[0]).toEqual([
    registry,
    vi.mocked(registerTentLoop).mock.calls[0]?.[1],
  ]);
  const guard = vi.mocked(registerLaidBlockGuard).mock.calls[0]?.[0];
  const wall = tentCells(POSE, PITCHED_STATE).find(
    (c) => c.block.type === "wall",
  );
  if (!wall || !owner || !guard) throw new Error("not wired");
  const here = asDimensionId("minecraft:overworld");
  expect(owner(here, wall, TENT_WALL_BLOCK)).toBe("t");
  expect(guard(here, wall, TENT_WALL_BLOCK)).toBe("t");
  expect(guard(here, wall, "minecraft:stone")).toBeUndefined();
  game.getDynamicProperty.mockReset();
});

it("shares one flap store between the tent world and the loop, and one flap use case between both flap handlers (ADR 0132)", () => {
  game.getDynamicProperty.mockReturnValue(SAVED);
  installCamp({
    topHosts: campTopHosts(),
    vehicleHost: () => ({ status: "unknown" }),
    isVehicleSpace: () => false,
  });
  const store = vi.mocked(registerTentLoop).mock.calls[0]?.[2];
  expect(store).toBeInstanceOf(TentFlapStore);
  const [useFlap, flapAt] = vi.mocked(registerTentFlap).mock.calls[0] ?? [];
  expect(useFlap).toBeInstanceOf(UseTentFlap);
  expect(vi.mocked(registerTestTentFlap).mock.calls[0]?.[0]).toBe(useFlap);
  const tent = {
    id: "t",
    isValid: true,
    typeId: TENT_TYPE,
    getProperty: vi.fn((name: string) =>
      name === TENT_FLAP_PROPERTY.left ? 1 : 0,
    ),
  };
  game.getEntity.mockImplementation((id: string) =>
    id === "t" ? tent : undefined,
  );
  // The world built the flaps into the loop's store, so the loop sees the same ones.
  const built = defined(store, "store").flapsOf(tent as never);
  const front = flapCells(POSE, "front")[0];
  if (!flapAt || !front) throw new Error("not wired");
  const here = asDimensionId("minecraft:overworld");
  expect(flapAt(here, front)).toEqual({ tentId: "t", flap: "front" });
  expect(
    useFlap?.execute({ tentId: asTentId("t"), flap: "front", tick: 0 }),
  ).toBe(true);
  expect(built.isOpen("front")).toBe(true);
  expect(built.isOpen("left")).toBe(true);
  game.getDynamicProperty.mockReset();
  game.getEntity.mockReset();
});

it("returns tent and Gas Lantern targets built on the registered actions", () => {
  game.getDynamicProperty.mockReturnValue(SAVED);
  game.getEntity.mockImplementation((id: string) =>
    id === "t" ? { isValid: true, typeId: TENT_TYPE } : undefined,
  );
  const { switchTargets } = installCamp({
    topHosts: campTopHosts(),
    vehicleHost: () => ({ status: "unknown" }),
    isVehicleSpace: () => false,
  });
  expect(switchTargets).toEqual([lanternTarget, gasLanternTarget]);
  expect(gasLanternSwitchTarget).toHaveBeenCalledExactlyOnceWith(
    vi.mocked(registerGasLantern).mock.calls[0]?.[0],
  );
  const [lantern, tentContaining] =
    vi.mocked(lanternSwitchTarget).mock.calls[0] ?? [];
  expect(lantern).toBeInstanceOf(SwitchLantern);
  expect(vi.mocked(registerTestTentLantern).mock.calls[0]?.[0]).toBe(lantern);
  const here = asDimensionId("minecraft:overworld");
  expect(tentContaining?.(here, { x: 110.5, y: -60, z: 52.5 })).toBe("t");
  expect(tentContaining?.(here, { x: 110.5, y: -60, z: 47.5 })).toBe("t");
  expect(tentContaining?.(here, { x: 113.5, y: -60, z: 47.5 })).toBeUndefined();
  game.getDynamicProperty.mockReset();
  game.getEntity.mockReset();
});

it("registers oven interactions before fire pit interactions", () => {
  installCamp({
    topHosts: campTopHosts(),
    vehicleHost: () => ({ status: "unknown" }),
    isVehicleSpace: () => false,
  });
  expect(vi.mocked(registerDutchOven).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(registerFirePit).mock.invocationCallOrder[0] ?? 0,
  );
});

vi.mock("../../../src/infrastructure/camp/bedrock/handlers/gasLantern", () => ({
  registerGasLantern: registrations.handler("registerGasLantern"),
}));
it("registers one Gas Lantern use case after the Fire Pit", () => {
  installCamp({
    topHosts: campTopHosts(),
    vehicleHost: () => ({ status: "unknown" }),
    isVehicleSpace: () => false,
  });
  expect(registerGasLantern).toHaveBeenCalledExactlyOnceWith(
    expect.any(GasLanternActions),
    expect.any(BedrockGasLanternWorld),
    expect.any(TopHostRegistry),
  );
  expect(vi.mocked(registerFirePit).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(registerGasLantern).mock.invocationCallOrder[0] ?? 0,
  );
});

vi.mock(
  "../../../src/infrastructure/camp/bedrock/handlers/roofTentPlacement",
  () => ({
    registerRoofTentPlacement: registrations.handler(
      "registerRoofTentPlacement",
    ),
  }),
);
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

it("shares roof tent actions, occupant adapters and the vehicle host lookup across handlers", () => {
  const ceilingOwner = vi.spyOn(
    BedrockRoofTentOccupantWorld.prototype,
    "ceilingOwner",
  );
  const vehicleHost = vi.fn(() => ({ status: "unknown" as const }));
  installCamp({
    topHosts: campTopHosts(),
    isVehicleSpace: () => false,
    vehicleHost,
  });
  const [place, lookup] =
    vi.mocked(registerRoofTentPlacement).mock.calls[0] ?? [];
  const [fold, paint] = vi.mocked(registerRoofTentHits).mock.calls[0] ?? [];
  const [occupants, guard, hosts, cleanup] =
    vi.mocked(registerRoofTentLifecycle).mock.calls[0] ?? [];
  expect(place).toBeInstanceOf(PlaceRoofTent);
  expect(fold).toBeInstanceOf(FoldRoofTent);
  expect(paint).toBeInstanceOf(PaintRoofTent);
  expect(lookup?.("host")).toEqual({ status: "unknown" });
  expect(vehicleHost).toHaveBeenCalledWith("host");
  expect(occupants).toBeInstanceOf(BedrockRoofTentOccupantWorld);
  const ceilingGuard = vi.mocked(registerLaidBlockGuard).mock.calls[1]?.[0];
  const cell = { x: 0, y: 4, z: 0 };
  ceilingGuard?.(
    asDimensionId("minecraft:overworld"),
    cell,
    "yasu_ride:tent_ceiling",
  );
  expect(ceilingOwner).toHaveBeenCalledWith(
    asDimensionId("minecraft:overworld"),
    cell,
    "yasu_ride:tent_ceiling",
  );
  ceilingOwner.mockRestore();
  expect(guard).toBeInstanceOf(RoofTentHostGuard);
  expect(cleanup).toBeInstanceOf(RoofTentCleanup);
  expect(registerTestRoofTent).toHaveBeenCalledExactlyOnceWith(
    place,
    fold,
    guard,
    occupants,
    hosts,
  );
});

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

it("wires roof tent entry, menu and cleanup to the same occupant adapter", () => {
  installCamp({
    topHosts: campTopHosts(),
    isVehicleSpace: () => false,
    vehicleHost: () => ({ status: "unknown" }),
  });
  const [enter, occupants, showMenu, track] =
    vi.mocked(registerRoofTentEnter).mock.calls[0] ?? [];
  expect(enter).toBeInstanceOf(EnterRoofTent);
  expect(vi.mocked(createRoofTentMenu).mock.calls[0]?.[0]).toBeInstanceOf(
    RoofTentMenu,
  );
  expect(
    vi.mocked(registerRoofTentOccupantCleanup).mock.calls[0]?.[0],
  ).toBeInstanceOf(LeaveRoofTent);
  expect(occupants).toBe(
    vi.mocked(registerRoofTentLifecycle).mock.calls[0]?.[0],
  );
  expect(showMenu).toBe(vi.mocked(createRoofTentMenu).mock.results[0]?.value);
  expect(track).toBe(
    vi.mocked(registerRoofTentOccupantCleanup).mock.results[0]?.value,
  );
  expect(vi.mocked(registerRoofTentOccupantCleanup).mock.calls[0]?.[1]).toBe(
    occupants,
  );
});

const starterArgs = vi.hoisted(() => [] as unknown[][]);
vi.mock("../../../src/infrastructure/shared/starterItem", () => ({
  registerStarterItem: registrations.handler("registerStarterItem"),
  BedrockStarterItemWorld: class {
    constructor(...args: unknown[]) {
      starterArgs.push(args);
    }
  },
}));

it("registers the roof tent starter with its camp use case", () => {
  starterArgs.length = 0;
  installCamp({
    topHosts: campTopHosts(),
    vehicleHost: () => ({ status: "unknown" }),
    isVehicleSpace: () => false,
  });
  expect(registerStarterItem).toHaveBeenCalledExactlyOnceWith(
    expect.any(GiveStarterItem),
  );
  expect(starterArgs).toEqual([
    [ROOF_TENT_ITEM, ROOF_TENT_STARTER_RECEIVED_PROPERTY],
  ]);
});

it("preserves handler registration order on each engine signal", () => {
  registrations.log.length = 0;
  vi.mocked(registerLaidBlockGuard).mockImplementation((owner) => {
    const tentOwner = vi.mocked(registerTentHits).mock.calls[0]?.[2];
    registrations.log.push(owner === tentOwner ? "tentGuard" : "ceilingGuard");
  });
  installCamp({
    topHosts: campTopHosts(),
    isVehicleSpace: () => false,
    vehicleHost: () => ({ status: "unknown" }),
  });

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

vi.mock("../../../src/infrastructure/shared/bedrockBedWorld", { spy: true });
vi.mock("../../../src/application/shared/sleepInBed", { spy: true });
vi.mock("../../../src/application/camp/sleepInRoofTent", { spy: true });
vi.mock("../../../src/application/camp/roofTentRemoved", { spy: true });

it("shares one bed world and sleep use case between the mattress and roof tent", () => {
  installCamp({
    topHosts: campTopHosts(),
    isVehicleSpace: () => false,
    vehicleHost: () => ({ status: "unknown" }),
  });
  expect(BedrockBedWorld).toHaveBeenCalledTimes(1);
  const beds = vi.mocked(BedrockBedWorld).mock.instances[0];
  expect(SleepInBed).toHaveBeenCalledTimes(1);
  expect(vi.mocked(SleepInBed).mock.calls[0]?.[0]).toBe(beds);
  expect(vi.mocked(ClearRoofTentSpawn).mock.calls[0]?.[1]).toBe(beds);
  const sleep = vi.mocked(SleepInBed).mock.instances[0];
  expect(vi.mocked(registerBedBlock).mock.calls[0]?.[1]).toBe(sleep);
  expect(vi.mocked(SleepInRoofTent).mock.calls[0]?.[1]).toBe(sleep);
});
