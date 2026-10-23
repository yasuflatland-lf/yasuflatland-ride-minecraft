import fc from "fast-check";
import { beforeEach, expect, it, vi } from "vitest";
import { HitChair } from "../../../src/application/camp/hitChair";
import { PitchTent } from "../../../src/application/camp/pitchTent";
import { PlaceChair } from "../../../src/application/camp/placeChair";
import { TakeDownTent } from "../../../src/application/camp/takeDownTent";
import { tentCells } from "../../../src/domain/camp/tent";
import { asDimensionId } from "../../../src/domain/shared/ids";
import { registerChairHits } from "../../../src/infrastructure/camp/bedrock/handlers/hits";
import { registerChairPlacement } from "../../../src/infrastructure/camp/bedrock/handlers/placement";
import { registerTentHits } from "../../../src/infrastructure/camp/bedrock/handlers/tentHits";
import { registerTentLifecycle } from "../../../src/infrastructure/camp/bedrock/handlers/tentLifecycle";
import { registerTentLoop } from "../../../src/infrastructure/camp/bedrock/handlers/tentLoop";
import { registerTentPlacement } from "../../../src/infrastructure/camp/bedrock/handlers/tentPlacement";
import { registerTestChairHit } from "../../../src/infrastructure/camp/bedrock/handlers/testHit";
import { registerTestTent } from "../../../src/infrastructure/camp/bedrock/handlers/testTent";
import {
  TENT_WALL_BLOCK,
  TENTS_PROPERTY,
} from "../../../src/infrastructure/camp/identifiers";
import { installCamp } from "../../../src/infrastructure/camp/install";
import { registerLaidBlockGuard } from "../../../src/infrastructure/shared/laidBlockGuard";

const game = vi.hoisted(() => ({ getDynamicProperty: vi.fn() }));
vi.mock("@minecraft/server", () => ({
  world: { getDynamicProperty: game.getDynamicProperty },
  system: {},
}));
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
  const [takeDown, owner] = vi.mocked(registerTentHits).mock.calls[0] ?? [];
  expect(takeDown).toBeInstanceOf(TakeDownTent);
  expect(vi.mocked(registerTestTent).mock.calls[0]).toEqual([
    pitchTent,
    takeDown,
  ]);
  const registry = vi.mocked(registerTentLoop).mock.calls[0]?.[0];
  expect(vi.mocked(registerTentLifecycle).mock.calls[0]?.[0]).toBe(registry);
  const guard = vi.mocked(registerLaidBlockGuard).mock.calls[0]?.[0];
  const wall = tentCells(POSE).find((c) => c.block.type === "wall");
  if (!wall || !owner || !guard) throw new Error("not wired");
  const here = asDimensionId("minecraft:overworld");
  expect(owner(here, wall, TENT_WALL_BLOCK)).toBe("t");
  expect(guard(here, wall, TENT_WALL_BLOCK)).toBe("t");
  expect(guard(here, wall, "minecraft:stone")).toBeUndefined();
  game.getDynamicProperty.mockReset();
});
