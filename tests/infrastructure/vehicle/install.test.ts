import { world } from "@minecraft/server";
import { expect, it, vi } from "vitest";
import { PlaceDecor } from "../../../src/application/vehicle/placeDecor";
import { RemoveDecor } from "../../../src/application/vehicle/removeDecor";
import { SetDecor } from "../../../src/application/vehicle/setDecor";
import { SwitchTool } from "../../../src/application/vehicle/switchTool";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { registerDockGuard } from "../../../src/infrastructure/vehicle/bedrock/handlers/dockGuard";
import { registerSubscriptions } from "../../../src/infrastructure/vehicle/bedrock/subscriptions";
import { installVehicles } from "../../../src/infrastructure/vehicle/install";
import { installCamper } from "../../../src/infrastructure/vehicle/kinds/camper/install";
import { defined } from "../../support/defined";

vi.mock("@minecraft/server", () => ({
  world: {
    getEntity: vi.fn(),
    afterEvents: { entitySpawn: { subscribe: vi.fn() } },
  },
  EntityInitializationCause: { Loaded: "Loaded" },
  BlockVolume: class {},
  system: {},
  InputMode: { Touch: "Touch", KeyboardAndMouse: "KeyboardAndMouse" },
}));
vi.mock("../../../src/infrastructure/vehicle/bedrock/subscriptions", () => ({
  registerSubscriptions: vi.fn(),
}));

vi.mock("../../../src/infrastructure/vehicle/kinds/camper/install", () => ({
  installCamper: vi.fn(),
}));
vi.mock(
  "../../../src/infrastructure/vehicle/bedrock/handlers/dockGuard",
  () => ({ registerDockGuard: vi.fn() }),
);

it("wires the decor use cases and the dock owner lookups into the subscriptions (ADR 0093, 0096)", () => {
  installVehicles({
    isCampSpace: () => false,
    wantsChaseCamera: () => false,
    laterSwitchTargets: () => [],
  });
  const [useCases, , , dockCellOwner, installKind] = defined(
    vi.mocked(registerSubscriptions).mock.lastCall,
    "vehicle subscriptions",
  );
  expect(useCases.decor).toBeInstanceOf(SetDecor);
  installKind();
  const [camper, dockDoorOwner, camperCellOwner, installGuard] = defined(
    vi.mocked(installCamper).mock.lastCall,
    "camper installation",
  );
  expect(camper.placeDecor).toBeInstanceOf(PlaceDecor);
  expect(camper.removeDecor).toBeInstanceOf(RemoveDecor);
  installGuard();
  const [dockBlockOwner] = defined(
    vi.mocked(registerDockGuard).mock.lastCall,
    "dock guard",
  );
  const here = asDimensionId("overworld");
  const cell = { x: 0, y: 64, z: 0 };
  // Nothing is laid yet, so no lookup has an owner.
  expect(dockDoorOwner?.(here, cell)).toBeUndefined();
  expect(dockCellOwner?.(here, cell)).toBeUndefined();
  expect(camperCellOwner(here, cell)).toBeUndefined();
  expect(
    dockBlockOwner?.(here, cell, "yasu_ride:camper_floor"),
  ).toBeUndefined();
});

it("returns the vehicles' space check for other features (ADR 0122)", () => {
  const { isVehicleSpace, vehicleHost } = installVehicles({
    isCampSpace: () => false,
    wantsChaseCamera: () => false,
    laterSwitchTargets: () => [],
  });
  expect(vehicleHost("missing")).toEqual({ status: "unknown" });
  // No vehicle is loaded and no room block is laid, so no cell is vehicle space.
  expect(
    isVehicleSpace(asDimensionId("overworld"), { x: 0, y: 64, z: 0 }),
  ).toBe(false);
});

it("hands the camp's space check to vehicle placement (ADR 0129)", () => {
  const isCampSpace = vi.fn(() => true);
  installVehicles({
    isCampSpace,
    wantsChaseCamera: () => false,
    laterSwitchTargets: () => [],
  });
  const useCases = vi.mocked(registerSubscriptions).mock.lastCall?.[0];
  expect(
    useCases?.place.execute({
      kind: "suv",
      playerId: asPlayerId("p"),
      dimensionId: asDimensionId("overworld"),
      blockLocation: { x: 0, y: 64, z: 0 },
      yaw: 0,
      slot: 0,
    }),
  ).toBe(false);
  expect(isCampSpace).toHaveBeenCalledWith(
    asDimensionId("overworld"),
    expect.objectContaining({ y: 65 }),
  );
});

it("hands the later switch targets to the subscriptions (ADR 0134)", () => {
  const laterSwitchTargets = () => [];
  installVehicles({
    isCampSpace: () => false,
    wantsChaseCamera: () => false,
    laterSwitchTargets,
  });
  expect(vi.mocked(registerSubscriptions).mock.lastCall?.[5]).toBe(
    laterSwitchTargets,
  );
});

it("hands the monitor tool switch use case to the subscriptions (ADR 0138)", () => {
  installVehicles({
    isCampSpace: () => false,
    wantsChaseCamera: () => false,
    laterSwitchTargets: () => [],
  });
  expect(
    vi.mocked(registerSubscriptions).mock.lastCall?.[0].tool,
  ).toBeInstanceOf(SwitchTool);
});

it("subscribes the blade-cut drop sweep once (ADR 0137)", () => {
  vi.mocked(world.afterEvents.entitySpawn.subscribe).mockClear();
  installVehicles({
    isCampSpace: () => false,
    wantsChaseCamera: () => false,
    laterSwitchTargets: () => [],
  });
  expect(world.afterEvents.entitySpawn.subscribe).toHaveBeenCalledTimes(1);
});
