import { expect, it, vi } from "vitest";
import { PlaceDecor } from "../../../src/application/vehicle/placeDecor";
import { RemoveDecor } from "../../../src/application/vehicle/removeDecor";
import { SetDecor } from "../../../src/application/vehicle/setDecor";
import { asDimensionId } from "../../../src/domain/shared/ids";
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

it("wires the decor use cases and both dock owner lookups into the subscriptions (ADR 0093)", () => {
  installVehicles();
  const [useCases, , dockDoorOwner, dockCellOwner] = vi.mocked(
    registerSubscriptions,
  ).mock.calls[0] ?? [undefined, undefined, undefined, undefined];
  expect(useCases?.decor).toBeInstanceOf(SetDecor);
  expect(useCases?.placeDecor).toBeInstanceOf(PlaceDecor);
  expect(useCases?.removeDecor).toBeInstanceOf(RemoveDecor);
  const here = asDimensionId("overworld");
  const cell = { x: 0, y: 64, z: 0 };
  // Nothing is laid yet, so neither lookup has an owner.
  expect(dockDoorOwner?.(here, cell)).toBeUndefined();
  expect(dockCellOwner?.(here, cell)).toBeUndefined();
});
