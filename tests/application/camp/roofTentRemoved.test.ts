import { expect, it, vi } from "vitest";
import { RoofTentCleanup } from "../../../src/application/camp/roofTentRemoved";
import { asRoofTentId } from "../../../src/domain/camp/ids";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { FakeRoofTentOccupantWorld } from "./fakeRoofTentOccupantWorld";

it("ejects, clears the ceiling and spawn points, then forgets the removed tent", () => {
  const world = new FakeRoofTentOccupantWorld();
  const tent = asRoofTentId("tent");
  const owner = asPlayerId("owner");
  const ejector = { eject: vi.fn() };
  const spawn = { removed: vi.fn() };

  new RoofTentCleanup(world, ejector, spawn).removed(tent, owner);

  expect(ejector.eject).toHaveBeenCalledExactlyOnceWith(tent);
  expect(world.clearCeiling).toHaveBeenCalledExactlyOnceWith(tent);
  expect(spawn.removed).toHaveBeenCalledExactlyOnceWith(tent, owner);
  expect(world.forget).toHaveBeenCalledExactlyOnceWith(tent);
  expect(ejector.eject).toHaveBeenCalledBefore(world.clearCeiling);
});
