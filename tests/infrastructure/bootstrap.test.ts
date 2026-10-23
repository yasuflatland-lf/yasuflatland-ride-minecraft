import { afterEach, expect, it, vi } from "vitest";
import type { SpaceCheck } from "../../src/application/shared/ports/space";
import { asDimensionId } from "../../src/domain/shared/ids";
import { bootstrap } from "../../src/infrastructure/bootstrap";
import { installCamp } from "../../src/infrastructure/camp/install";
import { installVehicles } from "../../src/infrastructure/vehicle/install";

vi.mock("@minecraft/server", () => ({ world: {}, system: {} }));
vi.mock("../../src/infrastructure/vehicle/install", () => ({
  installVehicles: vi.fn(),
}));
vi.mock("../../src/infrastructure/camp/install", () => ({
  installCamp: vi.fn(),
}));
afterEach(() => vi.restoreAllMocks());

it("wires space both ways through a late-bound camp reference (ADR 0129)", () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const dim = asDimensionId("overworld");
  const at = { x: 1, y: 65, z: 3 };
  const isVehicleSpace: SpaceCheck = () => true;
  const isCampSpace = vi.fn<SpaceCheck>();
  vi.mocked(installVehicles).mockImplementation((deps) => {
    expect(deps.isCampSpace(dim, at)).toBe(false);
    return { isVehicleSpace };
  });
  vi.mocked(installCamp).mockReturnValue({ isCampSpace });
  bootstrap();
  expect(installVehicles).toHaveBeenCalledTimes(1);
  expect(installCamp).toHaveBeenCalledExactlyOnceWith({ isVehicleSpace });
  expect(vi.mocked(installVehicles).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(installCamp).mock.invocationCallOrder[0] ?? 0,
  );
  const check = vi.mocked(installVehicles).mock.calls[0]?.[0].isCampSpace;
  for (const answer of [true, false]) {
    isCampSpace.mockReturnValue(answer);
    expect(check?.(dim, at)).toBe(answer);
    expect(isCampSpace).toHaveBeenLastCalledWith(dim, at);
  }
});
