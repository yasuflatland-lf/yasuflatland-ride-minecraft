import { world } from "@minecraft/server";
import { expect, it, vi } from "vitest";
import { PlaceDecor } from "../../../src/application/vehicle/placeDecor";
import { RemoveDecor } from "../../../src/application/vehicle/removeDecor";
import { SetDecor } from "../../../src/application/vehicle/setDecor";
import { SwitchBlade } from "../../../src/application/vehicle/switchBlade";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { registerSubscriptions } from "../../../src/infrastructure/vehicle/bedrock/subscriptions";
import { installVehicles } from "../../../src/infrastructure/vehicle/install";

vi.mock("@minecraft/server", () => ({
  world: { afterEvents: { entitySpawn: { subscribe: vi.fn() } } },
  EntityInitializationCause: { Loaded: "Loaded" },
  BlockVolume: class {},
  system: {},
  InputMode: { Touch: "Touch", KeyboardAndMouse: "KeyboardAndMouse" },
}));
vi.mock("../../../src/infrastructure/vehicle/bedrock/subscriptions", () => ({
  registerSubscriptions: vi.fn(),
}));

it("wires the decor use cases and the dock owner lookups into the subscriptions (ADR 0093, 0096)", () => {
  installVehicles({ isCampSpace: () => false, laterSwitchTargets: () => [] });
  const [useCases, , , dockDoorOwner, dockCellOwner, dockBlockOwner] =
    vi.mocked(registerSubscriptions).mock.calls[0] ?? [
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
    ];
  expect(useCases?.decor).toBeInstanceOf(SetDecor);
  expect(useCases?.placeDecor).toBeInstanceOf(PlaceDecor);
  expect(useCases?.removeDecor).toBeInstanceOf(RemoveDecor);
  const here = asDimensionId("overworld");
  const cell = { x: 0, y: 64, z: 0 };
  // Nothing is laid yet, so no lookup has an owner.
  expect(dockDoorOwner?.(here, cell)).toBeUndefined();
  expect(dockCellOwner?.(here, cell)).toBeUndefined();
  expect(
    dockBlockOwner?.(here, cell, "yasu_ride:camper_floor"),
  ).toBeUndefined();
});

it("returns the vehicles' space check for other features (ADR 0122)", () => {
  const { isVehicleSpace } = installVehicles({
    isCampSpace: () => false,
    laterSwitchTargets: () => [],
  });
  // No vehicle is loaded and no room block is laid, so no cell is vehicle space.
  expect(
    isVehicleSpace(asDimensionId("overworld"), { x: 0, y: 64, z: 0 }),
  ).toBe(false);
});

it("hands the camp's space check to vehicle placement (ADR 0129)", () => {
  const isCampSpace = vi.fn(() => true);
  installVehicles({ isCampSpace, laterSwitchTargets: () => [] });
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
  installVehicles({ isCampSpace: () => false, laterSwitchTargets });
  expect(vi.mocked(registerSubscriptions).mock.lastCall?.[6]).toBe(
    laterSwitchTargets,
  );
});

it("hands the blade switch use case to the subscriptions (ADR 0138)", () => {
  installVehicles({ isCampSpace: () => false, laterSwitchTargets: () => [] });
  expect(
    vi.mocked(registerSubscriptions).mock.lastCall?.[0].blade,
  ).toBeInstanceOf(SwitchBlade);
});

it("subscribes the blade-cut drop sweep once (ADR 0137)", () => {
  vi.mocked(world.afterEvents.entitySpawn.subscribe).mockClear();
  installVehicles({ isCampSpace: () => false, laterSwitchTargets: () => [] });
  expect(world.afterEvents.entitySpawn.subscribe).toHaveBeenCalledTimes(1);
});
