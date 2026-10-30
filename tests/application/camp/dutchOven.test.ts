import fc from "fast-check";
import { expect, it, vi } from "vitest";
import {
  DutchOvenActions,
  dutchOvenHostedKind,
} from "../../../src/application/camp/dutchOven";
import { HostedItemsGuard } from "../../../src/application/camp/hostedItemsGuard";
import type { DutchOvenWorld } from "../../../src/application/camp/ports/dutchOven";
import { asDutchOvenId } from "../../../src/domain/camp/dutchOven";
import { asFirePitId } from "../../../src/domain/camp/firePit";
import { decodeHost } from "../../../src/domain/camp/hosted";
import {
  DUTCH_OVEN_FOOTPRINT_PX,
  DUTCH_OVEN_SPEC,
  FIRE_PIT_TOP_PX,
} from "../../../src/domain/camp/spec";
import type { TopItem } from "../../../src/domain/camp/tabletop";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";

import { LIGHT_SWITCH_COOLDOWN_TICKS } from "../../../src/domain/shared/switchCooldown";

const oven = asDutchOvenId("oven");
const player = asPlayerId("player");
const dimension = asDimensionId("overworld");
const block = { x: 4, y: 60, z: 5 };
const command = { player, dimension, block, yaw: 47, slot: 1 };

function fixture(overrides: Partial<DutchOvenWorld> = {}) {
  const world = {
    table: () => ({ dimension, at: { x: 4.5, y: 61, z: 5.5 }, yaw: 90 }),
    itemsOnTable: (): readonly TopItem[] => [],
    spawnHostedOnTable: vi.fn(),
    isAir: vi.fn(() => true),
    isOwnBlock: () => false,
    isVehicleSpace: () => false,
    hasDutchOvenNear: () => false,
    isCreative: () => false,
    consumeItem: vi.fn(() => true),
    spawnDutchOven: vi.fn(() => oven),
    firePit: () => ({ dimension, at: { x: 4.5, y: 61, z: 5.5 }, yaw: 90 }),
    isCovered: () => false,
    setCovered: vi.fn(),
    host: () => "",
    setHost: vi.fn(),
    simmering: () => false,
    setSimmering: vi.fn(),
    loadedOvens: () => [],
    loadedFirePits: () => [],
    hostExists: () => true,
    isHostAreaLoaded: () => true,
    dropItem: vi.fn(),
    removeDutchOven: vi.fn(),
    showHitsLeft: vi.fn(),
    ...overrides,
  } satisfies DutchOvenWorld;
  return { actions: new DutchOvenActions(world), world };
}

it("accepts only block tops outside add-on rooms", () => {
  const { actions } = fixture();
  expect(actions.canUseBlock(dimension, block, "up")).toBe(true);
  expect(actions.canUseBlock(dimension, block, "other")).toBe(false);
  expect(
    fixture({ isOwnBlock: () => true }).actions.canUseBlock(
      dimension,
      block,
      "up",
    ),
  ).toBe(false);
});

it("rejects either blocked clearance cell or vehicle space before consumption", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: DUTCH_OVEN_SPEC.clearance }),
      fc.boolean(),
      (dy, vehicle) => {
        const { actions, world } = fixture(
          vehicle
            ? { isVehicleSpace: (_d, at) => at.y === block.y + dy }
            : { isAir: (_d, at) => at.y !== block.y + dy },
        );
        expect(actions.place(command)).toBe(false);
        expect(world.consumeItem).not.toHaveBeenCalled();
        expect(world.spawnDutchOven).not.toHaveBeenCalled();
      },
    ),
  );
});

it("refuses a nearby oven or a changed inventory slot", () => {
  for (const overrides of [
    { hasDutchOvenNear: () => true },
    { consumeItem: () => false },
  ]) {
    const { actions, world } = fixture(overrides);
    expect(actions.place(command)).toBe(false);
    expect(world.spawnDutchOven).not.toHaveBeenCalled();
  }
});

it("consumes only outside Creative and snaps any yaw to quarter turns", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: -720, max: 720 }),
      fc.boolean(),
      (yaw, creative) => {
        const { actions, world } = fixture({ isCreative: () => creative });
        expect(actions.place({ ...command, yaw })).toBe(true);
        expect(world.consumeItem).toHaveBeenCalledTimes(creative ? 0 : 1);
        if (!creative)
          expect(world.consumeItem).toHaveBeenCalledWith(player, 1);
        expect(world.spawnDutchOven).toHaveBeenCalledWith(
          dimension,
          { x: 4.5, y: 61, z: 5.5 },
          Math.round(yaw / 90) * 90,
        );
      },
    ),
  );
});

it("returns exactly one item on the third quick hit and resets after a long gap", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 10000 }),
      fc.integer({ min: 1, max: DUTCH_OVEN_SPEC.hitResetTicks }),
      (tick, gap) => {
        const { actions, world } = fixture();
        expect(actions.hit(oven, player, tick)).toBe(false);
        expect(world.showHitsLeft).toHaveBeenLastCalledWith(player, 2);
        const restart = tick + DUTCH_OVEN_SPEC.hitResetTicks + 1;
        expect(actions.hit(oven, player, restart)).toBe(false);
        expect(world.showHitsLeft).toHaveBeenLastCalledWith(player, 2);
        expect(actions.hit(oven, player, restart + gap)).toBe(false);
        expect(world.showHitsLeft).toHaveBeenLastCalledWith(player, 1);
        expect(world.dropItem).not.toHaveBeenCalled();
        expect(actions.hit(oven, player, restart + gap * 2)).toBe(true);
        expect(world.dropItem).toHaveBeenCalledExactlyOnceWith(oven);
        expect(world.removeDutchOven).toHaveBeenCalledExactlyOnceWith(oven);
      },
    ),
  );
});

const pit = asFirePitId("pit");
const onPit = { player, pit, slot: 1 };

it("places on the grill, consumes outside Creative, and covers the pit", () => {
  for (const creative of [true, false]) {
    const { actions, world } = fixture({ isCreative: () => creative });
    expect(actions.placeOnFirePit(onPit)).toBe(true);
    expect(world.spawnDutchOven).toHaveBeenCalledWith(
      dimension,
      { x: 4.5, y: 61 + FIRE_PIT_TOP_PX / 16, z: 5.5 },
      90,
    );
    expect(world.setHost).toHaveBeenCalledWith(oven, "fire_pit:pit:0", true);
    expect(world.setCovered).toHaveBeenCalledWith(pit, true);
    expect(world.consumeItem).toHaveBeenCalledTimes(creative ? 0 : 1);
  }
});

it("refuses missing or covered pits, blocked clearance, vehicle space, and a changed item", () => {
  for (const overrides of [
    { firePit: () => undefined },
    { isCovered: () => true },
    { isAir: () => false },
    { isVehicleSpace: () => true },
    { consumeItem: () => false },
  ]) {
    const { actions, world } = fixture(overrides);
    expect(actions.placeOnFirePit(onPit)).toBe(false);
    expect(world.spawnDutchOven).not.toHaveBeenCalled();
    expect(world.setCovered).not.toHaveBeenCalled();
  }
});

it("refuses a second oven after the first covers the pit", () => {
  let covered = false;
  const { actions, world } = fixture({
    isCovered: () => covered,
    setCovered: (_id, value) => {
      covered = value;
    },
  });
  expect(actions.placeOnFirePit(onPit)).toBe(true);
  expect(actions.placeOnFirePit(onPit)).toBe(false);
  expect(world.consumeItem).toHaveBeenCalledTimes(1);
});

it("uncovers an existing fire pit only on the oven's third hit", () => {
  const { actions, world } = fixture({ host: () => "fire_pit:pit:0" });
  actions.hit(oven, player, 1);
  actions.hit(oven, player, 2);
  expect(world.setCovered).not.toHaveBeenCalled();
  actions.hit(oven, player, 3);
  expect(world.setCovered).toHaveBeenCalledExactlyOnceWith(pit, false);
});

it("removes an oven whose host vanished in loaded space with no drop, for either host kind", () => {
  for (const kind of ["fire_pit", "camp_table"]) {
    for (const loaded of [true, false]) {
      const { world } = fixture({
        loadedOvens: () => [oven],
        host: () => `${kind}:pit:0`,
        hostExists: () => false,
        isHostAreaLoaded: () => loaded,
      });
      new HostedItemsGuard([dutchOvenHostedKind(world)]).check();
      expect(world.removeDutchOven).toHaveBeenCalledTimes(loaded ? 1 : 0);
      if (loaded) expect(world.removeDutchOven).toHaveBeenCalledWith(oven);
      expect(world.dropItem).not.toHaveBeenCalled();
      expect(world.setHost).not.toHaveBeenCalled();
    }
  }
});

it("uncovers an orphaned covered pit and keeps one with a hosted oven covered", () => {
  for (const occupied of [true, false]) {
    const { actions, world } = fixture({
      loadedOvens: () => (occupied ? [oven] : []),
      loadedFirePits: () => [pit],
      isCovered: () => true,
      host: () => "fire_pit:pit:0",
    });
    actions.uncoverEmptyFirePits();
    expect(world.setCovered).toHaveBeenCalledTimes(occupied ? 0 : 1);
    expect(world.setHost).not.toHaveBeenCalled();
  }
});

it("checks both clearance cells above the pit's ground and rejects before consuming", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: DUTCH_OVEN_SPEC.clearance - 1 }),
      fc.boolean(),
      (dy, vehicle) => {
        const y = 61 + dy;
        const { actions, world } = fixture(
          vehicle
            ? { isVehicleSpace: (_d, at) => at.y === y }
            : { isAir: (_d, at) => at.y !== y },
        );
        expect(actions.placeOnFirePit(onPit)).toBe(false);
        expect(world.consumeItem).not.toHaveBeenCalled();
      },
    ),
  );
});

it("leaves ground ovens alone and takes back ovens even if their host is gone", () => {
  const { world } = fixture({
    loadedOvens: () => [oven],
    hostExists: () => false,
  });
  new HostedItemsGuard([dutchOvenHostedKind(world)]).check();
  expect(world.removeDutchOven).not.toHaveBeenCalled();
  const hosted = fixture({
    host: () => "fire_pit:pit:0",
    hostExists: () => false,
  });
  for (let tick = 0; tick < 3; tick++) hosted.actions.hit(oven, player, tick);
  expect(hosted.world.removeDutchOven).toHaveBeenCalledOnce();
  expect(hosted.world.setCovered).not.toHaveBeenCalled();
});

const onTable = { player, table: "table", slot: 1 };
it("stands a lidded oven at the aimed point with the table's yaw and consumes outside Creative", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(0, 90, 180, 270),
      fc.boolean(),
      fc.integer({ min: -9, max: 9 }),
      fc.integer({ min: -1, max: 1 }),
      (yaw, creative, x, z) => {
        const { actions, world } = fixture({
          table: () => ({ dimension, at: { x: 4, y: 61, z: 5 }, yaw }),
          isCreative: () => creative,
        });
        expect(actions.placeOnTable({ ...onTable, aim: { x, z } })).toBe(
          "placed",
        );
        const angle = (yaw * Math.PI) / 180;
        expect(world.spawnHostedOnTable).toHaveBeenCalledExactlyOnceWith(
          "dutch_oven",
          dimension,
          {
            x: 4 + (x * Math.cos(angle) - z * Math.sin(angle)) / 16,
            y: 61 + 12.25 / 16,
            z: 5 + (x * Math.sin(angle) + z * Math.cos(angle)) / 16,
          },
          yaw,
          `camp_table:table:@${x},${z}`,
        );
        expect(world.consumeItem).toHaveBeenCalledTimes(creative ? 0 : 1);
      },
    ),
  );
});
it("refuses next to an oven already there, on a missing table, and for a changed inventory slot", () => {
  const legacy = { at: { x: -7.5, z: 0 }, footprint: DUTCH_OVEN_FOOTPRINT_PX };
  for (const [overrides, outcome] of [
    [{ itemsOnTable: () => [legacy] }, "overlap"],
    [{ table: () => undefined }, "refused"],
    [{ consumeItem: () => false }, "refused"],
  ] as const) {
    const { actions, world } = fixture(overrides);
    expect(actions.placeOnTable({ ...onTable, aim: { x: -5, z: 0 } })).toBe(
      outcome,
    );
    expect(world.spawnHostedOnTable).not.toHaveBeenCalled();
  }
});
it("taking back an oven frees its place for a replacement", () => {
  const hosts = new Map<string, string>();
  let serial = 0;
  const { actions, world } = fixture({
    spawnHostedOnTable: (_kind, _dimension, _at, _yaw, host) => {
      hosts.set(`oven${serial++}`, host);
    },
    host: (id) => hosts.get(id) ?? "",
    itemsOnTable: () =>
      [...hosts.values()].flatMap((text) => {
        const host = decodeHost(text);
        return host.kind === "camp_table"
          ? [{ at: host.at, footprint: DUTCH_OVEN_FOOTPRINT_PX }]
          : [];
      }),
    removeDutchOven: (id) => {
      hosts.delete(id);
    },
  });
  const left = { ...onTable, aim: { x: -7.5, z: 0 } };
  expect(actions.placeOnTable(left)).toBe("placed");
  expect(actions.placeOnTable({ ...onTable, aim: { x: 7.5, z: 0 } })).toBe(
    "placed",
  );
  expect(actions.placeOnTable(left)).toBe("overlap");
  for (let tick = 0; tick < 3; tick++)
    actions.hit(asDutchOvenId("oven0"), player, tick);
  expect(world.dropItem).toHaveBeenCalledExactlyOnceWith("oven0");
  expect(actions.placeOnTable(left)).toBe("placed");
  expect(hosts.get("oven2")).toBe("camp_table:table:@-7.5,0");
});

it("toggles each oven only after an idle cooldown across arbitrary presses", () => {
  fc.assert(
    fc.property(
      fc.boolean(),
      fc.array(
        fc.record({
          id: fc.constantFrom("a", "b"),
          gap: fc.integer({ min: 0, max: LIGHT_SWITCH_COOLDOWN_TICKS * 2 }),
        }),
        { minLength: 1, maxLength: 100 },
      ),
      (initial, presses) => {
        const states = new Map([
          ["a", initial],
          ["b", initial],
        ]);
        const expected = new Map(states);
        const last = new Map<string, number>();
        const write = vi.fn((id: string, value: boolean) => {
          states.set(id, value);
        });
        const { actions } = fixture({
          simmering: (id) => states.get(id),
          setSimmering: write,
        });
        let tick = 0;
        let flips = 0;
        for (const { id, gap } of presses) {
          tick += gap;
          const accepted =
            tick - (last.get(id) ?? Number.NEGATIVE_INFINITY) >=
            LIGHT_SWITCH_COOLDOWN_TICKS;
          last.set(id, tick);
          if (accepted) {
            expected.set(id, !expected.get(id));
            flips++;
          }
          expect(actions.toggleLid(asDutchOvenId(id), tick)).toBe(accepted);
          expect(states).toEqual(expected);
          expect(write).toHaveBeenCalledTimes(flips);
        }
      },
    ),
  );
});

it("ignores missing ovens without starting their cooldown", () => {
  let state: boolean | undefined;
  const { actions, world } = fixture({ simmering: () => state });
  expect(actions.toggleLid(oven, 0)).toBe(false);
  expect(world.setSimmering).not.toHaveBeenCalled();
  state = false;
  expect(actions.toggleLid(oven, 1)).toBe(true);
  expect(world.setSimmering).toHaveBeenCalledExactlyOnceWith(oven, true);
});
