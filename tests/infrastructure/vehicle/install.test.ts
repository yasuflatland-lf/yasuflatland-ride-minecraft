import { expect, it, vi } from "vitest";
import { PlaceDecor } from "../../../src/application/vehicle/placeDecor";
import { RemoveDecor } from "../../../src/application/vehicle/removeDecor";
import { SetDecor } from "../../../src/application/vehicle/setDecor";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { registerSubscriptions } from "../../../src/infrastructure/vehicle/bedrock/subscriptions";
import { installVehicles } from "../../../src/infrastructure/vehicle/install";

vi.mock("@minecraft/server", () => ({
  world: {},
  system: {},
  InputMode: { Touch: "Touch", KeyboardAndMouse: "KeyboardAndMouse" },
}));
vi.mock("../../../src/infrastructure/vehicle/bedrock/subscriptions", () => ({
  registerSubscriptions: vi.fn(),
}));

it("wires the decor use cases and the dock owner lookups into the subscriptions (ADR 0093, 0096)", () => {
  installVehicles({ isCampSpace: () => false });
  const [useCases, , dockDoorOwner, dockCellOwner, dockBlockOwner] = vi.mocked(
    registerSubscriptions,
  ).mock.calls[0] ?? [undefined, undefined, undefined, undefined, undefined];
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
  const { isVehicleSpace } = installVehicles({ isCampSpace: () => false });
  // No vehicle is loaded and no room block is laid, so no cell is vehicle space.
  expect(
    isVehicleSpace(asDimensionId("overworld"), { x: 0, y: 64, z: 0 }),
  ).toBe(false);
});

it("hands the camp's space check to vehicle placement (ADR 0129)", () => {
  const isCampSpace = vi.fn(() => true);
  installVehicles({ isCampSpace });
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
