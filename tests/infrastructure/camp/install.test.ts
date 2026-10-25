import fc from "fast-check";
import { beforeEach, expect, it, vi } from "vitest";
import { FirePitActions } from "../../../src/application/camp/firePit";
import { HitChair } from "../../../src/application/camp/hitChair";
import { HitTable } from "../../../src/application/camp/hitTable";
import { PaintTent } from "../../../src/application/camp/paintTent";
import { PitchTent } from "../../../src/application/camp/pitchTent";
import { PlaceChair } from "../../../src/application/camp/placeChair";
import { PlaceTable } from "../../../src/application/camp/placeTable";
import { SwitchLantern } from "../../../src/application/camp/switchLantern";
import { TakeDownTent } from "../../../src/application/camp/takeDownTent";
import { UseTentFlap } from "../../../src/application/camp/useTentFlap";
import { SleepInBed } from "../../../src/application/shared/sleepInBed";
import {
  asTentId,
  flapCells,
  PITCHED_STATE,
  tentCells,
} from "../../../src/domain/camp/tent";
import { asDimensionId } from "../../../src/domain/shared/ids";
import { registerFirePit } from "../../../src/infrastructure/camp/bedrock/handlers/firePit";
import { registerChairHits } from "../../../src/infrastructure/camp/bedrock/handlers/hits";
import { registerChairPlacement } from "../../../src/infrastructure/camp/bedrock/handlers/placement";
import { registerTable } from "../../../src/infrastructure/camp/bedrock/handlers/table";
import { registerTentFlap } from "../../../src/infrastructure/camp/bedrock/handlers/tentFlap";
import { registerTentHits } from "../../../src/infrastructure/camp/bedrock/handlers/tentHits";
import { registerTentLifecycle } from "../../../src/infrastructure/camp/bedrock/handlers/tentLifecycle";
import { registerTentLoop } from "../../../src/infrastructure/camp/bedrock/handlers/tentLoop";
import { registerTentPlacement } from "../../../src/infrastructure/camp/bedrock/handlers/tentPlacement";
import { registerTestChairHit } from "../../../src/infrastructure/camp/bedrock/handlers/testHit";
import { registerTestTent } from "../../../src/infrastructure/camp/bedrock/handlers/testTent";
import { registerTestTentFlap } from "../../../src/infrastructure/camp/bedrock/handlers/testTentFlap";
import { registerTestTentLantern } from "../../../src/infrastructure/camp/bedrock/handlers/testTentLantern";
import { lanternSwitchTarget } from "../../../src/infrastructure/camp/bedrock/lanternSwitch";
import { TentFlapStore } from "../../../src/infrastructure/camp/bedrock/tentFlapStore";
import {
  TENT_FLAP_PROPERTY,
  TENT_MATTRESS_COMPONENT,
  TENT_TYPE,
  TENT_WALL_BLOCK,
  TENTS_PROPERTY,
} from "../../../src/infrastructure/camp/identifiers";
import { installCamp } from "../../../src/infrastructure/camp/install";
import { registerBedBlock } from "../../../src/infrastructure/shared/bedBlock";
import { registerLaidBlockGuard } from "../../../src/infrastructure/shared/laidBlockGuard";
import { defined } from "../../support/defined";

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
const lanternTarget = vi.hoisted(() => ({ fake: "lantern target" }));
vi.mock("../../../src/infrastructure/camp/bedrock/lanternSwitch", () => ({
  lanternSwitchTarget: vi.fn(() => lanternTarget),
}));
vi.mock(
  "../../../src/infrastructure/camp/bedrock/handlers/testTentLantern",
  () => ({
    registerTestTentLantern: vi.fn(),
  }),
);
vi.mock("../../../src/infrastructure/camp/bedrock/handlers/tentHits", () => ({
  registerTentHits: vi.fn(),
}));
vi.mock(
  "../../../src/infrastructure/camp/bedrock/handlers/tentPlacement",
  () => ({
    registerTentPlacement: vi.fn(),
  }),
);
vi.mock("../../../src/infrastructure/camp/bedrock/handlers/tentLoop", () => ({
  registerTentLoop: vi.fn(),
}));
vi.mock(
  "../../../src/infrastructure/camp/bedrock/handlers/tentLifecycle",
  () => ({
    registerTentLifecycle: vi.fn(),
  }),
);
vi.mock("../../../src/infrastructure/camp/bedrock/handlers/testTent", () => ({
  registerTestTent: vi.fn(),
}));
vi.mock("../../../src/infrastructure/camp/bedrock/handlers/tentFlap", () => ({
  registerTentFlap: vi.fn(),
}));
vi.mock(
  "../../../src/infrastructure/camp/bedrock/handlers/testTentFlap",
  () => ({
    registerTestTentFlap: vi.fn(),
  }),
);
vi.mock("../../../src/infrastructure/shared/bedBlock", () => ({
  registerBedBlock: vi.fn(),
}));
vi.mock("../../../src/infrastructure/shared/laidBlockGuard", () => ({
  registerLaidBlockGuard: vi.fn(),
}));
vi.mock("../../../src/infrastructure/camp/bedrock/handlers/hits", () => ({
  registerChairHits: vi.fn(),
}));
vi.mock("../../../src/infrastructure/camp/bedrock/handlers/placement", () => ({
  registerChairPlacement: vi.fn(),
}));
vi.mock("../../../src/infrastructure/camp/bedrock/handlers/testHit", () => ({
  registerTestChairHit: vi.fn(),
}));
vi.mock("../../../src/infrastructure/camp/bedrock/handlers/table", () => ({
  registerTable: vi.fn(),
}));
vi.mock("../../../src/infrastructure/camp/bedrock/handlers/firePit", () => ({
  registerFirePit: vi.fn(),
}));

it("wires one hit use case into both hit handlers and asks the vehicles for their space (ADR 0122)", () => {
  const isVehicleSpace = vi.fn(() => true);
  installCamp({ isVehicleSpace });
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
});

it("registers the tent mattress as a bed with its own SleepInBed (ADR 0092, 0133)", () => {
  installCamp({ isVehicleSpace: () => false });
  expect(registerBedBlock).toHaveBeenCalledTimes(1);
  const [componentId, bed] = vi.mocked(registerBedBlock).mock.calls[0] ?? [];
  expect(componentId).toBe(TENT_MATTRESS_COMPONENT);
  expect(bed).toBeInstanceOf(SleepInBed);
});

it("claims no camp space for any dimension and integer cell without a tent (ADR 0129)", () => {
  const { isCampSpace } = installCamp({ isVehicleSpace: () => false });
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
  const { isCampSpace } = installCamp({ isVehicleSpace: () => false });
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
  installCamp({ isVehicleSpace: () => false });
  const pitchTent = vi.mocked(registerTentPlacement).mock.calls[0]?.[0];
  expect(pitchTent).toBeInstanceOf(PitchTent);
  const [takeDown, paintTent, owner] =
    vi.mocked(registerTentHits).mock.calls[0] ?? [];
  expect(takeDown).toBeInstanceOf(TakeDownTent);
  expect(paintTent).toBeInstanceOf(PaintTent);
  expect(vi.mocked(registerTestTent).mock.calls[0]).toEqual([
    pitchTent,
    takeDown,
  ]);
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
  installCamp({ isVehicleSpace: () => false });
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

it("returns one switch target, the lantern's, built on the same SwitchLantern as the test hook", () => {
  game.getDynamicProperty.mockReturnValue(SAVED);
  game.getEntity.mockImplementation((id: string) =>
    id === "t" ? { isValid: true, typeId: TENT_TYPE } : undefined,
  );
  const { switchTargets } = installCamp({ isVehicleSpace: () => false });
  expect(switchTargets).toEqual([lanternTarget]);
  expect(switchTargets[0]).toBe(lanternTarget);
  const [lantern, tentContaining] =
    vi.mocked(lanternSwitchTarget).mock.calls[0] ?? [];
  expect(lantern).toBeInstanceOf(SwitchLantern);
  expect(vi.mocked(registerTestTentLantern).mock.calls[0]?.[0]).toBe(lantern);
  const here = asDimensionId("minecraft:overworld");
  expect(tentContaining?.(here, { x: 110.5, y: -60, z: 52.5 })).toBe("t");
  expect(tentContaining?.(here, { x: 110.5, y: -60, z: 47.5 })).toBeUndefined();
  game.getDynamicProperty.mockReset();
  game.getEntity.mockReset();
});
