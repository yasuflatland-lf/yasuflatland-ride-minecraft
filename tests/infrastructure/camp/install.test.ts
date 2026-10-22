import { expect, it, vi } from "vitest";
import { HitChair } from "../../../src/application/camp/hitChair";
import { PlaceChair } from "../../../src/application/camp/placeChair";
import { asDimensionId } from "../../../src/domain/shared/ids";
import { registerChairHits } from "../../../src/infrastructure/camp/bedrock/handlers/hits";
import { registerChairPlacement } from "../../../src/infrastructure/camp/bedrock/handlers/placement";
import { registerTestChairHit } from "../../../src/infrastructure/camp/bedrock/handlers/testHit";
import { installCamp } from "../../../src/infrastructure/camp/install";

vi.mock("@minecraft/server", () => ({ world: {}, system: {} }));
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
