import { beforeEach, expect, it, vi } from "vitest";
import { LieOnBeachChair } from "../../../src/application/resort/lieOnBeachChair";
import { BEACH_CHAIR_SPEC } from "../../../src/domain/resort/spec";
import { BedrockBeachChairWorld } from "../../../src/infrastructure/resort/bedrock/bedrockBeachChairWorld";
import { registerBeachChairLifecycle } from "../../../src/infrastructure/resort/bedrock/handlers/beachChairLifecycle";
import { BEACH_CHAIR } from "../../../src/infrastructure/resort/identifiers";
import { TopHostRegistry } from "../../../src/infrastructure/shared/tableTop/registry";

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
  const chairs = new Map([
    ["overworld", "lounge chair"],
    ["nether", "red chair"],
    ["the_end", "purple chair"],
  ]);
  game.getDimension.mockImplementation((name: string) => ({
    getEntities: ({ type }: { type: string }) => {
      const id = chairs.get(name);
      return type === BEACH_CHAIR && id ? [{ id }] : [];
    },
  }));
  const riders = new LieOnBeachChair(
    new BedrockBeachChairWorld({
      topHosts: new TopHostRegistry(),
      isVehicleSpace: () => false,
      isCampSpace: () => false,
    }),
  );
  const refresh = vi.spyOn(riders, "refresh").mockImplementation(() => {});
  registerBeachChairLifecycle(riders);
  return { refresh, chairs };
}

it("scans all loaded dimensions at the pose interval after reload", () => {
  const f = fixture();
  expect(game.interval).toHaveBeenCalledExactlyOnceWith(
    expect.any(Function),
    BEACH_CHAIR_SPEC.poseRefreshTicks,
  );
  game.interval.mock.calls[0]?.[0]();
  expect(f.refresh).toHaveBeenCalledOnce();
  expect(new Set(f.refresh.mock.calls[0]?.[0])).toEqual(
    new Set(f.chairs.values()),
  );
  f.chairs.clear();
  game.interval.mock.calls[0]?.[0]();
  expect(f.refresh).toHaveBeenLastCalledWith([]);
});
