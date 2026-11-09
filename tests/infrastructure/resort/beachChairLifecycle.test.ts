import { beforeEach, expect, it, vi } from "vitest";
import { LieOnBeachChair } from "../../../src/application/resort/lieOnBeachChair";
import { BEACH_CHAIR_SPEC } from "../../../src/domain/resort/spec";
import { BedrockBeachChairWorld } from "../../../src/infrastructure/resort/bedrock/bedrockBeachChairWorld";
import { registerBeachChairLifecycle } from "../../../src/infrastructure/resort/bedrock/handlers/beachChairLifecycle";
import { BEACH_CHAIR } from "../../../src/infrastructure/resort/identifiers";

const game = vi.hoisted(() => ({
  interval: vi.fn(),
  getDimension: vi.fn(),
}));
vi.mock("@minecraft/server", () => ({
  world: { getDimension: game.getDimension },
  system: { runInterval: game.interval },
}));
beforeEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
function fixture() {
  const dimension = {
    getEntities: vi.fn((_query: unknown) => [{ id: "chair" }]),
  };
  game.getDimension.mockReturnValue(dimension);
  const riders = new LieOnBeachChair(
    new BedrockBeachChairWorld({
      isVehicleSpace: () => false,
      isCampSpace: () => false,
    }),
  );
  const refresh = vi.spyOn(riders, "refresh").mockImplementation(() => {});
  registerBeachChairLifecycle(riders);
  return { refresh, dimension };
}

it("scans all loaded dimensions at the pose interval after reload", () => {
  const f = fixture();
  expect(game.interval).toHaveBeenCalledExactlyOnceWith(
    expect.any(Function),
    BEACH_CHAIR_SPEC.poseRefreshTicks,
  );
  game.interval.mock.calls[0]?.[0]();
  expect(game.getDimension.mock.calls.map((call) => call[0])).toEqual([
    "overworld",
    "nether",
    "the_end",
  ]);
  expect(f.dimension.getEntities).toHaveBeenCalledWith({ type: BEACH_CHAIR });
  expect(f.refresh).toHaveBeenCalledExactlyOnceWith([
    "chair",
    "chair",
    "chair",
  ]);
  f.dimension.getEntities.mockReturnValue([]);
  game.interval.mock.calls[0]?.[0]();
  expect(f.refresh).toHaveBeenLastCalledWith([]);
});
