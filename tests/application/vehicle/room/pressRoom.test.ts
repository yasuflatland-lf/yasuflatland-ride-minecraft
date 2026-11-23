import fc from "fast-check";
import { expect, it } from "vitest";
import { PlaceDecor } from "../../../../src/application/vehicle/room/placeDecor";
import { PressRoom } from "../../../../src/application/vehicle/room/pressRoom";
import { PressStorage } from "../../../../src/application/vehicle/room/pressStorage";
import { RemoveDecor } from "../../../../src/application/vehicle/room/removeDecor";
import { asPlayerId, asVehicleId } from "../../../../src/domain/shared/ids";
import { add3, sub3, type Vec3 } from "../../../../src/domain/shared/vec";
import {
  CAMPER_ROOM,
  CAMPER_SAVED,
  CAMPING_GEAR_IDS,
  DRAWER_GEAR_IDS,
  rebuildVehicle,
} from "../../../../src/domain/vehicle/kinds/index";
import { decorItemId } from "../../../support/decorIds";
import { defined } from "../../../support/defined";
import { FakeClock, FakeWorld, InMemoryRepo } from "../fakes";

const floor = { x: 180, y: -60, z: 89 };
const counter = { x: 179, y: -59, z: 89 };
const eye = { x: 180.784, y: -57.48, z: 89.822 };
const pose = { x: 180.5, y: -60, z: 90.5 };
const recordedFloor = { x: -1, y: -60, z: 4 };
const recordedEye = { x: -0.15, y: -58.48, z: 4.5 };
const recordedPose = { x: -0.5, y: -60, z: 5.5 };
const ids = {
  playerId: asPlayerId("player"),
  vehicleId: asVehicleId("camper"),
};
const gear = (item = "mug_pair") => ({
  item: decorItemId(item),
  hotbarSlot: 2,
});

function fixture(top = false, bottom = true, full = false, location = pose) {
  const camper = rebuildVehicle("camper", ids.vehicleId, 0, [], {
    docked: true,
    drawer_top: Number(top),
    drawer_bottom: Number(bottom),
    [CAMPER_SAVED.decor]: full
      ? '[{"slot":"drawer_bottom_0","item":"mug_pair"}]'
      : "[]",
  });
  const step = (tick: number) =>
    camper.tick({
      riders: [],
      targets: () => [],
      tick,
      location,
      velocity: { x: 0, y: 0, z: 0 },
      deckSeatInputs: [],
      onGround: true,
      solidAt: () => false,
      waterAt: () => false,
      blockTypes: (cells) => cells.map(() => "minecraft:air"),
    });
  step(10);
  const repo = new InMemoryRepo();
  repo.save(camper);
  const world = new FakeWorld();
  const clock = new FakeClock();
  clock.tick = 200;
  const place = new PlaceDecor(world, repo);
  const press = new PressRoom(
    new PressStorage(world, repo, clock),
    place,
    new RemoveDecor(world, repo),
  );
  const assertDrawer = (drawer: "top" | "bottom") => {
    camper.resync();
    const { stepCommands } = step(201);
    for (const [name, open] of [
      ["top", top],
      ["bottom", bottom],
    ] as const) {
      expect(
        stepCommands.find(
          (c) => c.type === "setProperty" && c.name === `drawer_${name}`,
        ),
      ).toMatchObject({
        value: name === drawer ? (open ? 0.9 : 0.1) : Number(open),
      });
    }
  };
  const room = defined(camper.capability(CAMPER_ROOM), "camper room");
  return {
    press,
    place,
    assertDrawer,
    decor: () => room.decor.decor(),
    world,
  };
}

function floorPress(
  cell: Vec3,
  head: Vec3,
  x: number,
  z: number,
  held?: ReturnType<typeof gear>,
) {
  const point = add3(cell, { x, y: 1, z });
  return {
    ...ids,
    source: "block" as const,
    surface: {
      kind: "floor" as const,
      drawerPoint: point,
      allowPlacementOnMiss: true,
    },
    cell,
    point,
    eye: head,
    held,
  };
}

const itemUse = {
  ...ids,
  source: "itemUse" as const,
  eye,
  direction: { x: -0.43, y: -0.903, z: 0.014 },
  feet: { ...eye, y: eye.y - 1.52 },
  held: gear(),
};

it("routes measured side heights independently of either drawer's opening", () => {
  for (const [px, drawer] of [
    [4.679, "top"],
    [10.467, "bottom"],
    [6.73, "top"],
    [5.43, "top"],
    [13.16, "bottom"],
  ] as const) {
    for (const top of [false, true])
      for (const bottom of [false, true]) {
        const f = fixture(top, bottom);
        expect(
          f.press.prepare({
            ...ids,
            source: "block",
            surface: { kind: "drawers", sideFace: true },
            cell: counter,
            eye,
            point: add3(counter, { x: 1, y: 1 - px / 16, z: 0.5 }),
            held: undefined,
          })?.(),
        ).toBe("storage");
        f.assertDrawer(drawer);
      }
  }
});

it("toggles the bottommost open drawer at the recorded floor hits", () => {
  const shallowEye = { x: 180.85, y: -58.48, z: 89.5 };
  for (const [press, location] of [
    [floorPress(floor, shallowEye, 0.314, 0.491), pose],
    [floorPress(floor, shallowEye, 0.45, 0.491), pose],
    [floorPress(recordedFloor, recordedEye, 1 - 0.893, 0.433), recordedPose],
    [floorPress(recordedFloor, recordedEye, 1 - 0.811, 0.437), recordedPose],
  ] as const) {
    for (const top of [false, true])
      for (const bottom of [false, true]) {
        const f = fixture(top, bottom, true, location);
        const run = f.press.prepare(press);
        if (!top && !bottom) {
          expect(run).toBeUndefined();
          continue;
        }
        expect(run?.()).toBe("storage");
        f.assertDrawer(bottom ? "bottom" : "top");
        expect(f.world.calls).toEqual([]);
      }
  }
});

it("toggles an occupied footprint drawer with any drawer gear without placing or taking an item", () => {
  fc.assert(
    fc.property(
      fc.boolean(),
      fc.constantFrom(...DRAWER_GEAR_IDS),
      (top, item) => {
        const f = fixture(top, true, true);
        const press = floorPress(
          floor,
          { x: 180.85, y: -58.48, z: 89.5 },
          0.45,
          0.491,
          gear(item),
        );
        expect(f.press.prepare(press)?.()).toBe("storage");
        f.assertDrawer("bottom");
        expect(f.decor()).toEqual([
          { slot: "drawer_bottom_0", item: "mug_pair" },
        ]);
        expect(f.world.calls).toEqual([]);
      },
    ),
  );
});

it("routes an aisle-floor ray to storage and leaves missed empty-hand presses alone", () => {
  expect(
    fixture().press.prepare(floorPress(floor, eye, 0.146, 0.125))?.(),
  ).toBe("storage");
  for (const miss of [
    floorPress({ ...floor, z: floor.z + 1 }, eye, 0.146, 0.125),
    floorPress(floor, eye, 1, 0.8),
    floorPress(floor, eye, 1 - 0.146, 0.125),
    floorPress(floor, eye, 1 - 0.138, 0.12),
    floorPress(floor, { x: 180.85, y: -58.48, z: 89.5 }, 0.893, 0.433),
  ]) {
    const f = fixture();
    expect(f.press.prepare(miss)).toBeUndefined();
    const ordinary = fixture();
    const held = gear();
    const expected = ordinary.place.execute({
      ...ids,
      ...held,
      cell: miss.cell,
      point: miss.point,
      eye: miss.eye,
      exact: false,
    });
    expect(f.press.prepare({ ...miss, held })?.()).toBe(
      expected ? "placed" : "unchanged",
    );
    expect(f.world.calls).toEqual(ordinary.world.calls);
  }
  const f = fixture(true, false, false, recordedPose);
  expect(
    f.press.prepare(floorPress(recordedFloor, recordedEye, 0.95, 0.95)),
  ).toBeUndefined();
});

it("opens a closed itemUse target and places only in its exact free drawer", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...DRAWER_GEAR_IDS),
      fc.boolean(),
      (item, full) => {
        for (const [direction, fullResult] of [
          [itemUse.direction, "unchanged"],
          [{ x: 1, y: 0, z: 0 }, undefined],
        ] as const) {
          const f = fixture(false, true, full);
          const result = f.press.prepare({
            ...itemUse,
            direction,
            held: gear(item),
          })?.();
          if (full) {
            expect(result).toBe(fullResult);
            expect(f.decor()).toEqual([
              { slot: "drawer_bottom_0", item: "mug_pair" },
            ]);
            expect(f.world.calls).toEqual([]);
          } else {
            expect(result).toBe("placed");
            expect(f.decor()).toEqual([{ slot: "drawer_bottom_0", item }]);
          }
        }
        const f = fixture();
        expect(
          f.press.prepare({
            ...itemUse,
            held: gear(item),
            direction: sub3({ x: 179.959375, y: -58.4, z: 89.5 }, eye),
          })?.(),
        ).toBe("storage");
        f.assertDrawer("top");
        expect(f.world.calls).toEqual([]);
      },
    ),
  );
});

it("keeps gear outside the drawer allowlist on the ordinary floor placement path", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(
        ...CAMPING_GEAR_IDS.filter((item) => !DRAWER_GEAR_IDS.has(item)),
      ),
      (item) => {
        const f = fixture();
        const held = gear(item);
        expect(f.press.prepare({ ...itemUse, held })).toBeUndefined();
        const tap = floorPress(floor, eye, 0.146, 0.125, held);
        const expected = fixture().place.execute({
          ...ids,
          ...held,
          cell: floor,
          point: tap.point,
          eye,
          exact: false,
        });
        expect(f.press.prepare(tap)?.()).toBe(
          expected ? "placed" : "unchanged",
        );
      },
    ),
  );
});

it("places and takes counter decor when storage declines a drawers-block press", () => {
  const f = fixture(false, true, true);
  const block = {
    ...ids,
    source: "block" as const,
    surface: { kind: "drawers" as const, sideFace: false },
    cell: counter,
    point: add3(counter, { x: 0.5, y: 14 / 16, z: 0.5 }),
    eye: add3(counter, { x: 0.5, y: 2, z: 0.5 }),
  };
  expect(f.press.prepare({ ...block, held: gear("potted_plant") })?.()).toBe(
    "placed",
  );
  expect(f.press.prepare({ ...block, held: undefined })?.()).toBe("removed");
  expect(f.decor()).toEqual([{ slot: "drawer_bottom_0", item: "mug_pair" }]);
  expect(f.world.calls).toContain("giveDecor:player:potted_plant");
});
