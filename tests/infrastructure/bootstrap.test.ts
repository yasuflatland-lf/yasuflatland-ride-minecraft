import { afterEach, expect, it, vi } from "vitest";
import { PlaceChair } from "../../src/application/camp/placeChair";
import type { SpaceCheck } from "../../src/application/shared/ports/space";
import { asDimensionId, asPlayerId } from "../../src/domain/shared/ids";
import { bootstrap } from "../../src/infrastructure/bootstrap";
import { installBuild } from "../../src/infrastructure/build/install";
import { CHAIR_KINDS } from "../../src/infrastructure/camp/identifiers";
import { installCamp } from "../../src/infrastructure/camp/install";
import { installResort } from "../../src/infrastructure/resort/install";
import type { SwitchTarget } from "../../src/infrastructure/shared/switchRouter";
import { TopHostRegistry } from "../../src/infrastructure/shared/tableTop/registry";
import { installVehicles } from "../../src/infrastructure/vehicle/install";

vi.mock("@minecraft/server-ui", () => ({
  FormCancelationReason: { UserBusy: "UserBusy", UserClosed: "UserClosed" },
  ActionFormData: vi.fn(),
}));

const isFleetEntityType = vi.fn(() => false);
const vehicleHost = () => ({ status: "unknown" as const });

const game = vi.hoisted(() => {
  // Every event a feature subscribes to records its handlers under its name.
  const handlers = new Map<string, ((ev: unknown) => void)[]>();
  const events = () =>
    new Proxy(
      {},
      {
        get: (_t, name: string) => ({
          subscribe: (h: (ev: unknown) => void) => {
            handlers.set(name, [...(handlers.get(name) ?? []), h]);
          },
        }),
      },
    );
  return {
    handlers,
    getBlock: vi.fn(),
    getDynamicProperty: vi.fn(),
    world: { beforeEvents: events(), afterEvents: events() },
    system: {
      afterEvents: events(),
      beforeEvents: events(),
      run: vi.fn(),
      runInterval: vi.fn(),
    },
  };
});
vi.mock("@minecraft/server", () => ({
  Direction: { Up: "Up" },
  world: {
    ...game.world,
    getDynamicProperty: game.getDynamicProperty,
    getDimension: () => ({ getBlock: game.getBlock }),
  },
  system: game.system,
}));
vi.mock("../../src/infrastructure/vehicle/install", () => ({
  installVehicles: vi.fn(),
}));
vi.mock("../../src/infrastructure/camp/install", () => ({
  installCamp: vi.fn(),
}));
vi.mock("../../src/infrastructure/build/install", () => ({
  installBuild: vi.fn(),
}));
vi.mock("../../src/infrastructure/resort/install", () => ({
  installResort: vi.fn(),
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
    return { isVehicleSpace, vehicleHost, isFleetEntityType };
  });
  vi.mocked(installCamp).mockReturnValue({
    isCampSpace,
    switchTargets: [],
    placeHostedOnTop: () => false,
  });
  bootstrap();
  expect(installVehicles).toHaveBeenCalledTimes(1);
  expect(installCamp).toHaveBeenCalledExactlyOnceWith({
    topHosts: expect.any(TopHostRegistry),
    isVehicleSpace,
    vehicleHost,
  });
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

it("lets the vehicles see a registered tent, and the chair stand on its floor but not on its walls (ADR 0129, 0131)", async () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const actual = await vi.importActual<
    typeof import("../../src/infrastructure/camp/install")
  >("../../src/infrastructure/camp/install");
  vi.mocked(installCamp).mockImplementation(actual.installCamp);
  vi.mocked(installVehicles).mockReturnValue({
    isVehicleSpace: () => false,
    vehicleHost,
    isFleetEntityType,
  });
  game.getDynamicProperty.mockReturnValue(
    JSON.stringify([
      {
        id: "t",
        dimensionId: "minecraft:overworld",
        pose: { x: 110, y: -60, z: 46, yaw: 180 },
      },
    ]),
  );
  const cellFor = vi.spyOn(PlaceChair.prototype, "cellFor");
  bootstrap();
  const dim = asDimensionId("minecraft:overworld");
  const isCampSpace = vi
    .mocked(installVehicles)
    .mock.calls.at(-1)?.[0].isCampSpace;
  expect(isCampSpace?.(dim, { x: 110, y: -60, z: 50 })).toBe(true);
  expect(isCampSpace?.(dim, { x: 110, y: -60, z: 60 })).toBe(false);
  const chairPress = game.handlers.get("playerInteractWithBlock")?.[0];
  const press = (y: number, z: number, typeId: string) => {
    game.getBlock.mockReturnValue({ typeId });
    const ev = {
      isFirstEvent: true,
      itemStack: { typeId: CHAIR_KINDS.low_chair.itemId },
      block: { dimension: { id: dim }, location: { x: 110, y, z } },
      blockFace: "Up",
      player: { id: "p", selectedSlotIndex: 0, getRotation: () => ({ y: 0 }) },
      cancel: false,
    };
    chairPress?.(ev);
  };
  press(-61, 50, "minecraft:grass_block");
  expect(cellFor).toHaveLastReturnedWith({ x: 110, y: -61, z: 50 });
  // The front wall's middle cell.
  press(-60, 49, "yasu_ride:tent_wall");
  expect(cellFor).toHaveLastReturnedWith(undefined);
  game.getDynamicProperty.mockReset();
});

it("hands the vehicles the camp's switch targets once camp is installed", () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const switchTargets = [{} as SwitchTarget];
  let before: readonly SwitchTarget[] | undefined;
  vi.mocked(installVehicles).mockImplementation((deps) => {
    before = deps.laterSwitchTargets();
    return { isVehicleSpace: () => false, vehicleHost, isFleetEntityType };
  });
  vi.mocked(installCamp).mockReturnValue({
    isCampSpace: () => false,
    switchTargets,
    placeHostedOnTop: () => false,
  });
  bootstrap();
  expect(before).toEqual([]);
  const later =
    vi.mocked(installVehicles).mock.lastCall?.[0].laterSwitchTargets;
  expect(later?.()).toBe(switchTargets);
});

it("installs build last and passes both space checks without requesting a camera change", () => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const isVehicleSpace = vi.fn<SpaceCheck>();
  const isCampSpace = vi.fn<SpaceCheck>();
  const playerId = asPlayerId("builder");
  vi.mocked(installVehicles).mockImplementation((deps) => {
    expect(deps.wantsChaseCamera(playerId)).toBe(false);
    return { isVehicleSpace, vehicleHost, isFleetEntityType };
  });
  vi.mocked(installCamp).mockReturnValue({
    isCampSpace,
    switchTargets: [],
    placeHostedOnTop: () => false,
  });
  bootstrap();
  expect(installBuild).toHaveBeenCalledTimes(1);
  expect(vi.mocked(installBuild).mock.lastCall?.[0].isFleetEntityType).toBe(
    isFleetEntityType,
  );
  expect(installResort).toHaveBeenCalledExactlyOnceWith({
    topHosts: vi.mocked(installCamp).mock.lastCall?.[0].topHosts,
    isVehicleSpace,
    isCampSpace,
    placeHostedOnTop:
      vi.mocked(installCamp).mock.results[0]?.value.placeHostedOnTop,
  });
  expect(vi.mocked(installCamp).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(installResort).mock.invocationCallOrder[0] ?? 0,
  );
  expect(vi.mocked(installCamp).mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(installBuild).mock.invocationCallOrder[0] ?? 0,
  );
  const wish = vi.mocked(installVehicles).mock.lastCall?.[0].wantsChaseCamera;
  expect(wish?.(playerId)).toBe(false);
  const protectedAt = vi.mocked(installBuild).mock.lastCall?.[0].isProtected;
  const dimension = asDimensionId("minecraft:overworld");
  const cell = { x: 1, y: 2, z: 3 };
  for (const vehicle of [true, false])
    for (const camp of [true, false]) {
      isVehicleSpace.mockReturnValue(vehicle);
      isCampSpace.mockReturnValue(camp);
      expect(protectedAt?.(dimension, cell)).toBe(vehicle || camp);
      expect(isVehicleSpace).toHaveBeenLastCalledWith(dimension, cell);
      if (!vehicle)
        expect(isCampSpace).toHaveBeenLastCalledWith(dimension, cell);
    }
});
