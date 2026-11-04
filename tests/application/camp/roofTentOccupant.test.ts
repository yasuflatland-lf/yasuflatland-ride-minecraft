import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { EnterRoofTent } from "../../../src/application/camp/enterRoofTent";
import { LeaveRoofTent } from "../../../src/application/camp/leaveRoofTent";
import { RoofTentHostGuard } from "../../../src/application/camp/roofTentHostGuard";
import {
  ROOF_TENT_CHOICES,
  RoofTentMenu,
} from "../../../src/application/camp/roofTentMenu";
import { ClearRoofTentSpawn } from "../../../src/application/camp/roofTentRemoved";
import { SleepInRoofTent } from "../../../src/application/camp/sleepInRoofTent";
import type { BedWorld } from "../../../src/application/shared/ports/bed";
import { SleepInBed } from "../../../src/application/shared/sleepInBed";
import { asRoofTentId } from "../../../src/domain/camp/ids";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import { canSleep, SLEEP_MESSAGES } from "../../../src/domain/shared/sleep";
import { FakeRoofTentOccupantWorld } from "./fakeRoofTentOccupantWorld";
import { FakeRoofTentWorld } from "./fakeRoofTentWorld";

const playerId = asPlayerId("sleeper");
const other = asPlayerId("other");
const cmd = { playerId, tentId: asRoofTentId("tent") };

function setup(time = 13000) {
  const world = new FakeRoofTentOccupantWorld();
  const bed: BedWorld = {
    timeOfDay: () => time,
    setSpawnPoint: vi.fn(),
    clearSpawnPoint: vi.fn(),
    sleep: vi.fn(),
    showMessage: vi.fn(),
  };
  const sleep = new SleepInRoofTent(world, new SleepInBed(bed));
  const leave = new LeaveRoofTent(world);
  return {
    world,
    bed,
    sleep,
    leave,
    menu: new RoofTentMenu(world, sleep, leave),
  };
}

describe("roof tent occupant", () => {
  it("enters an empty tent, permits the same player, and refuses a second player", () => {
    const { world } = setup();
    const enter = new EnterRoofTent(world);
    expect(enter.execute(cmd)).toBe(true);
    expect(enter.execute(cmd)).toBe(true);
    expect(enter.execute({ ...cmd, playerId: other })).toBe(false);
    expect(world.occupantOf(cmd.tentId)).toBe(playerId);
    expect(world.moveInside.mock.calls).toEqual([
      [playerId, cmd.tentId],
      [playerId, cmd.tentId],
    ]);
    expect(world.conceal.mock.calls).toEqual([[playerId], [playerId]]);
    expect(world.moveInside.mock.invocationCallOrder[0]).toBeLessThan(
      world.conceal.mock.invocationCallOrder[0] ?? 0,
    );
    expect(world.showMessage).toHaveBeenCalledExactlyOnceWith(
      other,
      "tent_occupied",
    );
  });

  it("places the occupant outside before clearing occupancy, and ignores other players or an empty tent", () => {
    const { world, leave } = setup();
    world.occupants.set(cmd.tentId, playerId);
    leave.execute({ ...cmd, playerId: other });
    expect(world.calls).toEqual([]);
    leave.execute(cmd);
    leave.eject(cmd.tentId);
    expect(world.calls).toEqual([
      ["placeOutside", playerId, cmd.tentId],
      ["reveal", playerId],
      ["setOccupant", cmd.tentId, undefined],
    ]);
    expect(world.occupantOf(cmd.tentId)).toBeUndefined();
  });

  it("sets spawn before sleeping or the daytime message and records it while keeping the player inside", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 23999 }), (time) => {
        const { world, bed, menu, leave } = setup(time);
        vi.spyOn(leave, "execute");
        world.occupants.set(cmd.tentId, playerId);
        menu.choose(cmd, "sleep");
        expect(bed.setSpawnPoint).toHaveBeenCalledExactlyOnceWith(
          playerId,
          world.dimensionOf(cmd.tentId),
          world.spawnCellOf(cmd.tentId),
        );
        expect(world.spawnSetBy(cmd.tentId)).toBe(playerId);
        expect(world.occupantOf(cmd.tentId)).toBe(playerId);
        expect(world.placeOutside).not.toHaveBeenCalled();
        expect(leave.execute).not.toHaveBeenCalled();
        if (canSleep(time)) {
          expect(bed.sleep).toHaveBeenCalledExactlyOnceWith(playerId);
          expect(bed.showMessage).not.toHaveBeenCalled();
        } else {
          expect(bed.sleep).not.toHaveBeenCalled();
          expect(bed.showMessage).toHaveBeenCalledExactlyOnceWith(
            playerId,
            SLEEP_MESSAGES.nightOnly,
          );
        }
        expect(
          vi.mocked(bed.setSpawnPoint).mock.invocationCallOrder[0],
        ).toBeLessThan(world.setSpawnSetBy.mock.invocationCallOrder[0] ?? 0);
      }),
    );
  });

  it("keeps the night-only message and records a daytime spawn", () => {
    const { world, bed, menu, leave } = setup(0);
    vi.spyOn(leave, "execute");
    world.occupants.set(cmd.tentId, playerId);
    menu.choose(cmd, "sleep");
    expect(bed.setSpawnPoint).toHaveBeenCalledExactlyOnceWith(
      playerId,
      world.dimensionOf(cmd.tentId),
      world.spawnCellOf(cmd.tentId),
    );
    expect(bed.sleep).not.toHaveBeenCalled();
    expect(world.occupantOf(cmd.tentId)).toBe(playerId);
    expect(world.placeOutside).not.toHaveBeenCalled();
    expect(leave.execute).not.toHaveBeenCalled();
    expect(bed.showMessage).toHaveBeenCalledExactlyOnceWith(
      playerId,
      SLEEP_MESSAGES.nightOnly,
    );
    expect(world.spawnSetBy(cmd.tentId)).toBe(playerId);
  });

  it("sleeps after the occupant leaves while the form is open", () => {
    const { world, bed, menu, leave } = setup();
    world.occupants.set(cmd.tentId, playerId);
    leave.execute(cmd);
    world.placeOutside.mockClear();
    const leaveSpy = vi.spyOn(leave, "execute");
    menu.choose(cmd, "sleep");
    expect(bed.setSpawnPoint).toHaveBeenCalledExactlyOnceWith(
      playerId,
      world.dimensionOf(cmd.tentId),
      world.spawnCellOf(cmd.tentId),
    );
    expect(bed.sleep).toHaveBeenCalledExactlyOnceWith(playerId);
    expect(world.spawnSetBy(cmd.tentId)).toBe(playerId);
    expect(world.occupantOf(cmd.tentId)).toBeUndefined();
    expect(world.placeOutside).not.toHaveBeenCalled();
    expect(leaveSpy).not.toHaveBeenCalled();
  });

  it("records nothing outside the overworld", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("minecraft:nether", "minecraft:the_end"),
        (dimension) => {
          const { world, bed, sleep } = setup();
          world.dimensionOf.mockReturnValue(asDimensionId(dimension));
          expect(sleep.execute(cmd)).toBe(false);
          expect(bed.setSpawnPoint).not.toHaveBeenCalled();
          expect(bed.sleep).not.toHaveBeenCalled();
          expect(world.setSpawnSetBy).not.toHaveBeenCalled();
        },
      ),
    );
  });

  it("requests clearing only the recorded player's matching spawn and forgets the record", () => {
    const { world, bed } = setup();
    world.spawns.set(cmd.tentId, playerId);
    world.spawns.set(asRoofTentId("another-tent"), other);
    const removed = new ClearRoofTentSpawn(world, bed);
    removed.removed(cmd.tentId, other);
    removed.removed(cmd.tentId, other);
    removed.removed(asRoofTentId("unused"), undefined);
    expect(bed.clearSpawnPoint).toHaveBeenCalledExactlyOnceWith(
      playerId,
      world.dimensionOf(cmd.tentId),
      world.spawnCellOf(cmd.tentId),
    );
    expect(world.spawnSetBy(cmd.tentId)).toBeUndefined();
    expect(world.spawnSetBy(asRoofTentId("another-tent"))).toBe(other);
    expect(world.setSpawnSetBy).toHaveBeenCalledExactlyOnceWith(
      cmd.tentId,
      undefined,
    );
  });

  it("preserves a later spawn elsewhere when removing the tent", () => {
    const { world, bed, sleep } = setup();
    const laterCell = { x: 100, y: 70, z: 200 };
    let spawn = world.spawnCellOf(cmd.tentId);
    vi.mocked(bed.setSpawnPoint).mockImplementation(
      (_player, _dimension, cell) => {
        spawn = cell;
      },
    );
    vi.mocked(bed.clearSpawnPoint).mockImplementation(
      (player, dimension, cell) => {
        if (
          player === playerId &&
          dimension === world.dimensionOf(cmd.tentId) &&
          spawn.x === cell.x &&
          spawn.y === cell.y &&
          spawn.z === cell.z
        ) {
          spawn = { x: 0, y: 0, z: 0 };
        }
      },
    );
    sleep.execute(cmd);
    spawn = laterCell;
    new ClearRoofTentSpawn(world, bed).removed(cmd.tentId, undefined);
    expect(spawn).toEqual(laterCell);
    expect(world.spawnSetBy(cmd.tentId)).toBeUndefined();
  });

  it("dispatches the occupant's menu choices and ignores other players", () => {
    const { world, bed, menu } = setup();
    expect(menu.entries()).toEqual(ROOF_TENT_CHOICES);
    expect(menu.entries()).toEqual(["sleep", "exit"]);
    menu.choose(cmd, "exit");
    world.occupants.set(cmd.tentId, other);
    for (const choice of menu.entries()) menu.choose(cmd, choice);
    expect(bed.sleep).not.toHaveBeenCalled();
    expect(bed.setSpawnPoint).not.toHaveBeenCalled();
    expect(world.setSpawnSetBy).not.toHaveBeenCalled();
    expect(world.placeOutside).not.toHaveBeenCalled();
    world.occupants.set(cmd.tentId, playerId);
    menu.choose(cmd, "sleep");
    expect(bed.sleep).toHaveBeenCalledExactlyOnceWith(playerId);
    menu.choose(cmd, "exit");
    expect(world.occupantOf(cmd.tentId)).toBeUndefined();
    expect(world.placeOutside).toHaveBeenCalledExactlyOnceWith(
      playerId,
      cmd.tentId,
    );
  });

  it("ejects through the host guard and clears the recorded spawn on removal", () => {
    const { world, bed, leave, sleep } = setup();
    const tents = new FakeRoofTentWorld();
    tents.hosts.set(cmd.tentId, { kind: "vehicle", id: "host" });
    world.occupants.set(cmd.tentId, playerId);
    sleep.execute(cmd);
    new RoofTentHostGuard(
      tents,
      () => ({ status: "removed" }),
      leave,
      new ClearRoofTentSpawn(world, bed),
    ).check();
    expect(world.calls).toEqual([
      ["placeOutside", playerId, cmd.tentId],
      ["reveal", playerId],
      ["setOccupant", cmd.tentId, undefined],
    ]);
    expect(world.occupantOf(cmd.tentId)).toBeUndefined();
    expect(bed.clearSpawnPoint).toHaveBeenCalledExactlyOnceWith(
      playerId,
      world.dimensionOf(cmd.tentId),
      world.spawnCellOf(cmd.tentId),
    );
    expect(tents.remove).toHaveBeenCalledExactlyOnceWith(cmd.tentId);
  });
});
