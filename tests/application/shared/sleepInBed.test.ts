import fc from "fast-check";
import { expect, it } from "vitest";
import type { BedWorld } from "../../../src/application/shared/ports/bed";
import { SleepInBed } from "../../../src/application/shared/sleepInBed";
import {
  asDimensionId,
  asPlayerId,
  type DimensionId,
  type PlayerId,
} from "../../../src/domain/shared/ids";
import { canSleep } from "../../../src/domain/shared/sleep";
import type { Vec3 } from "../../../src/domain/shared/vec";

class FakeBedWorld implements BedWorld {
  readonly calls: unknown[][] = [];
  constructor(private readonly time: number) {}

  timeOfDay(): number {
    return this.time;
  }
  setSpawnPoint(playerId: PlayerId, dimensionId: DimensionId, cell: Vec3) {
    this.calls.push(["setSpawnPoint", playerId, dimensionId, cell]);
  }
  sleep(playerId: PlayerId): void {
    this.calls.push(["sleep", playerId]);
  }
  showMessage(playerId: PlayerId, name: string): void {
    this.calls.push(["showMessage", playerId, name]);
  }
}

const cellArb = fc.record({
  x: fc.integer(),
  y: fc.integer(),
  z: fc.integer(),
});

it("sets the spawn point, then sleeps at night or explains why not in the overworld (ADR 0092)", () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 23999 }), cellArb, (time, cell) => {
      const world = new FakeBedWorld(time);
      const playerId = asPlayerId("player");
      const dimensionId = asDimensionId("minecraft:overworld");
      const slept = new SleepInBed(world).execute({
        playerId,
        dimensionId,
        cell,
      });
      expect(slept).toBe(canSleep(time));
      expect(world.calls).toEqual([
        ["setSpawnPoint", playerId, dimensionId, cell],
        canSleep(time)
          ? ["sleep", playerId]
          : ["showMessage", playerId, "sleep_at_night"],
      ]);
    }),
  );
});

it("does nothing outside the overworld", () => {
  const world = new FakeBedWorld(13000);
  expect(
    new SleepInBed(world).execute({
      playerId: asPlayerId("player"),
      dimensionId: asDimensionId("minecraft:nether"),
      cell: { x: 1, y: 65, z: 2 },
    }),
  ).toBe(false);
  expect(world.calls).toEqual([]);
});
