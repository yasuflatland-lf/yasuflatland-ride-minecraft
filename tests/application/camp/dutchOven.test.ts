import fc from "fast-check";
import { expect, it, vi } from "vitest";
import {
  DutchOvenActions,
  dutchOvenHostedKind,
} from "../../../src/application/camp/dutchOven";
import { decodeCampHost } from "../../../src/application/camp/hostedKind";
import type { DutchOvenWorld } from "../../../src/application/camp/ports/dutchOven";
import { HostedItemsGuard } from "../../../src/application/shared/hostedItemsGuard";
import { asDutchOvenId } from "../../../src/domain/camp/dutchOven";
import { asFirePitId } from "../../../src/domain/camp/firePit";
import {
  DUTCH_OVEN_FOOTPRINT_PX,
  DUTCH_OVEN_SPEC,
  FIRE_PIT_TOP_PX,
} from "../../../src/domain/camp/spec";
import { asTableId } from "../../../src/domain/camp/table";
import { LIGHT_SWITCH_COOLDOWN_TICKS } from "../../../src/domain/shared/debounce";
import { snapYaw } from "../../../src/domain/shared/facing";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import type { TopItem } from "../../../src/domain/shared/tableTop";
import { DUTCH_OVEN_ON_TOP } from "../../../src/infrastructure/camp/bedrock/topHosts";

const oven = asDutchOvenId("oven");
const player = asPlayerId("player");
const dimension = asDimensionId("overworld");
const block = { x: 4, y: 60, z: 5 };
const command = { player, dimension, block, yaw: 47, slot: 1 };

function fixture(
  overrides: Partial<Omit<DutchOvenWorld, "refund">> = {},
  failSpawn = false,
) {
  const setHost = overrides.setHost ?? vi.fn();
  const world = {
    topHost: () => ({ dimension, at: { x: 4.5, y: 61, z: 5.5 }, yaw: 90 }),
    itemsOnTop: (): readonly TopItem[] => [],
    spawnHosted: vi.fn(() => (failSpawn ? undefined : oven)),
    isAir: vi.fn(() => true),
    isOwnBlock: () => false,
    isVehicleSpace: () => false,
    hasDutchOvenNear: () => false,
    isCreative: () => false,
    consumeItem: vi.fn(() => true),
    refund: vi.fn(),
    spawnDutchOven: vi.fn<DutchOvenWorld["spawnDutchOven"]>(
      (_dimension, _at, _yaw, setup) => {
        if (failSpawn) return undefined;
        setup?.(oven);
        return oven;
      },
    ),
    firePit: () => ({ dimension, at: { x: 4.5, y: 61, z: 5.5 }, yaw: 90 }),
    isCovered: () => false,
    setCovered: vi.fn(),
    host: () => "",
    setHost,
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
  return { actions: new DutchOvenActions(world, DUTCH_OVEN_ON_TOP), world };
}

it("accepts only block tops outside add-on rooms", () => {
  const { actions } = fixture();
  expect(actions.canUseBlock(dimension, block, "up")).toBe(true);
  expect(actions.canUseBlock(dimension, block, "north")).toBe(false);
  expect(
    fixture({ isOwnBlock: () => true }).actions.canUseBlock(
      dimension,
      block,
      "up",
    ),
  ).toBe(false);
});

it("refuses ground placement for each obstruction or unpaid slot", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("blocked", "vehicle", "nearby", "unpaid"),
      fc.integer({ min: 1, max: DUTCH_OVEN_SPEC.clearance }),
      (reason, dy) => {
        const consumeItem = vi.fn(() => reason !== "unpaid");
        const { actions, world } = fixture({
          isAir: (_d, at) => reason !== "blocked" || at.y !== block.y + dy,
          isVehicleSpace: (_d, at) =>
            reason === "vehicle" && at.y === block.y + dy,
          hasDutchOvenNear: () => reason === "nearby",
          consumeItem,
        });
        expect(actions.place(command)).toBe(false);
        expect(consumeItem).toHaveBeenCalledTimes(reason === "unpaid" ? 1 : 0);
        expect(world.spawnDutchOven).not.toHaveBeenCalled();
      },
    ),
  );
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
          snapYaw(yaw),
        );
      },
    ),
  );
});

it("returns one oven on the third hit and hints after earlier hits", () => {
  const { actions, world } = fixture();
  expect(actions.hit(oven, player, 1)).toBe(false);
  expect(actions.hit(oven, player, 2)).toBe(false);
  expect(world.dropItem).not.toHaveBeenCalled();
  expect(actions.hit(oven, player, 3)).toBe(true);
  expect(vi.mocked(world.showHitsLeft).mock.calls).toEqual([
    [player, 2],
    [player, 1],
  ]);
  expect(world.dropItem).toHaveBeenCalledExactlyOnceWith(oven, player);
  expect(world.removeDutchOven).toHaveBeenCalledExactlyOnceWith(oven);
  expect(world.dropItem).toHaveBeenCalledBefore(
    vi.mocked(world.removeDutchOven),
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
      expect.any(Function),
    );
    expect(world.setHost).toHaveBeenCalledWith(oven, "fire_pit:pit:0", true);
    expect(world.setCovered).toHaveBeenCalledWith(pit, true);
    expect(world.consumeItem).toHaveBeenCalledTimes(creative ? 0 : 1);
  }
});

it("refuses fire pit placement for each obstruction, unavailable pit, or unpaid slot", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("blocked", "vehicle", "missing", "covered", "unpaid"),
      fc.integer({ min: 0, max: DUTCH_OVEN_SPEC.clearance - 1 }),
      (reason, dy) => {
        const consumeItem = vi.fn(() => reason !== "unpaid");
        const { actions, world } = fixture({
          firePit: () =>
            reason === "missing"
              ? undefined
              : { dimension, at: { x: 4.5, y: 61, z: 5.5 }, yaw: 90 },
          isCovered: () => reason === "covered",
          isAir: (_d, at) => reason !== "blocked" || at.y !== 61 + dy,
          isVehicleSpace: (_d, at) => reason === "vehicle" && at.y === 61 + dy,
          consumeItem,
        });
        expect(actions.placeOnFirePit(onPit)).toBe(false);
        expect(consumeItem).toHaveBeenCalledTimes(reason === "unpaid" ? 1 : 0);
        expect(world.spawnDutchOven).not.toHaveBeenCalled();
        expect(world.setCovered).not.toHaveBeenCalled();
      },
    ),
  );
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
  expect(world.setCovered).toHaveBeenCalledBefore(vi.mocked(world.dropItem));
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

const onTable = { player, table: asTableId("table"), slot: 1 };
it("stands a lidded oven at the aimed point with the table's yaw and consumes outside Creative", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(0, 90, 180, 270),
      fc.boolean(),
      fc.integer({ min: -9, max: 9 }),
      fc.integer({ min: -1, max: 1 }),
      (yaw, creative, x, z) => {
        const { actions, world } = fixture({
          topHost: () => ({ dimension, at: { x: 4, y: 61, z: 5 }, yaw }),
          isCreative: () => creative,
        });
        expect(actions.placeOnTable({ ...onTable, aim: { x, z } })).toBe(
          "placed",
        );
        const angle = (yaw * Math.PI) / 180;
        expect(world.spawnHosted).toHaveBeenCalledExactlyOnceWith(
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
    [{ itemsOnTop: () => [legacy] }, "overlap"],
    [{ topHost: () => undefined }, "refused"],
    [{ consumeItem: () => false }, "refused"],
  ] as const) {
    const { actions, world } = fixture(overrides);
    expect(actions.placeOnTable({ ...onTable, aim: { x: -5, z: 0 } })).toBe(
      outcome,
    );
    expect(world.spawnHosted).not.toHaveBeenCalled();
  }
});
it("taking back an oven frees its place for a replacement", () => {
  const hosts = new Map<string, string>();
  let serial = 0;
  const { actions, world } = fixture({
    spawnHosted: (_kind, _dimension, _at, _yaw, host) => {
      const id = asDutchOvenId(`oven${serial++}`);
      hosts.set(id, host);
      return id;
    },
    host: (id) => hosts.get(id) ?? "",
    itemsOnTop: () =>
      [...hosts.values()].flatMap((text) => {
        const host = decodeCampHost(text);
        return host.kind === "top" && host.hostType === "camp_table"
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
  expect(world.dropItem).toHaveBeenCalledExactlyOnceWith("oven0", player);
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
