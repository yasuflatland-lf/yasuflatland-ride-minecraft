import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { PlaceDecor } from "../../../../../src/application/vehicle/placeDecor";
import { PressStorage } from "../../../../../src/application/vehicle/pressStorage";
import { asPlayerId } from "../../../../../src/domain/shared/ids";
import { CAMPING_GEAR_IDS } from "../../../../../src/domain/vehicle/kinds/camper/campingGear";
import { DECOR_SLOTS } from "../../../../../src/domain/vehicle/kinds/camper/decor";
import { slotPoint } from "../../../../../src/domain/vehicle/kinds/camper/decorPlacing";
import { CamperDrive } from "../../../../../src/domain/vehicle/kinds/camper/drive";
import { KITCHEN_DRAWERS } from "../../../../../src/domain/vehicle/kinds/camper/furniture";
import { localCellAt } from "../../../../../src/domain/vehicle/kinds/camper/parkPose";
import { DRAWER_GEAR_IDS } from "../../../../../src/domain/vehicle/kinds/camper/spec";
import {
  FakeClock,
  FakeWorld,
  parkedCamper,
} from "../../../../application/vehicle/fakes";
import { decorItemId, decorSlotId } from "../../../../support/decorIds";
import { defined } from "../../../../support/defined";

// Activate only in this test module; #1684 supplies the pack block and restores the drawer properties.
vi.mock(
  "../../../../../src/domain/vehicle/kinds/camper/furniture",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../../../../src/domain/vehicle/kinds/camper/furniture")
      >();
    const slots = actual.KITCHEN_DRAWERS.doors.flatMap((d) => d.slots);
    return {
      ...actual,
      STORAGE_DOORS: [
        ...actual.STORAGE_DOORS,
        ...actual.KITCHEN_DRAWERS.doors.map((d) => ({
          ...d,
          unit: actual.KITCHEN_DRAWERS,
        })),
      ],
      CAMPER_FURNITURE: actual.CAMPER_FURNITURE.map((f) =>
        f.kind === "counter" ? { ...f, slots: [...f.slots, ...slots] } : f,
      ),
    };
  },
);
vi.mock(
  "../../../../../src/domain/vehicle/kinds/camper/entity",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../../../../src/domain/vehicle/kinds/camper/entity")
      >();
    return {
      ...actual,
      storageDoorProperty: (id: string) =>
        id.startsWith("drawer_")
          ? id
          : actual.storageDoorProperty(
              id as Parameters<typeof actual.storageDoorProperty>[0],
            ),
      storageDoorCommand: (id: string, open: number) =>
        id.startsWith("drawer_")
          ? { type: "setProperty", name: id, value: open }
          : actual.storageDoorCommand(
              id as Parameters<typeof actual.storageDoorCommand>[0],
              open,
            ),
    };
  },
);

function fixture() {
  const f = parkedCamper();
  const world = new FakeWorld();
  world.creativePlayers.add("p");
  const clock = new FakeClock();
  clock.tick = 100;
  const press = new PressStorage(world, f.repo, clock);
  const place = new PlaceDecor(world, f.repo);
  const room = defined(f.car.asRoom(), "room");
  const slot = (id: string) =>
    defined(
      DECOR_SLOTS.find((s) => s.id === id),
      "slot",
    );
  const command = (id: string, item = "mug_pair", exact = false) => {
    const s = slot(id);
    return {
      playerId: asPlayerId("p"),
      vehicleId: f.car.id,
      cell: localCellAt(f.pose, s.cell),
      point: slotPoint(f.pose, s),
      hotbarSlot: 0,
      exact,
      item: decorItemId(item),
    };
  };
  return { ...f, world, clock, press, place, room, slot, command };
}

it("uses the normal no-slot refusal for all nonallowlisted gear, never another drawer or the counter", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...CAMPING_GEAR_IDS, "unknown_item"),
      fc.constantFrom("drawer_top_0", "drawer_bottom_0"),
      (item, id) => {
        const f = fixture();
        expect(f.press.execute(f.command(id))).toBe(true);
        f.world.calls.length = 0;
        const allowed = DRAWER_GEAR_IDS.has(item);
        expect(f.place.execute(f.command(id, item))).toBe(allowed);
        expect(f.room.decor()).toEqual(allowed ? [{ slot: id, item }] : []);
        if (!allowed) expect(f.world.calls).toEqual(["showMessage"]);
        if (!allowed)
          expect(f.world.messages.at(-1)?.name).toBe("decor_no_slot");
      },
    ),
  );
});

it("holds one item per drawer, refuses a second item, and takes only the pressed drawer item", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...DRAWER_GEAR_IDS),
      fc.constantFrom(...DRAWER_GEAR_IDS),
      (top, bottom) => {
        const f = fixture();
        for (const [id, item] of [
          ["drawer_top_0", top],
          ["drawer_bottom_0", bottom],
        ] as const) {
          expect(f.press.execute(f.command(id))).toBe(true);
          expect(f.place.execute(f.command(id, item))).toBe(true);
          expect(f.place.execute(f.command(id, item))).toBe(false);
        }
        expect(f.room.decor()).toHaveLength(2);
        f.clock.tick += 10;
        expect(f.press.execute(f.command("drawer_bottom_0"))).toBe(true);
        expect(f.room.decor()).toEqual([{ slot: "drawer_top_0", item: top }]);
        expect(f.world.calls.at(-1)).toBe(`giveDecor:p:${bottom}`);
      },
    ),
  );
});

it("keeps counter top decor independent from both drawer contents", () => {
  const f = fixture();
  for (const id of ["drawer_top_0", "drawer_bottom_0"]) {
    f.press.execute(f.command(id));
    expect(f.place.execute(f.command(id))).toBe(true);
  }
  expect(f.press.execute(f.command("counter"))).toBe(false);
  expect(f.place.execute(f.command("counter", "potted_plant"))).toBe(true);
  expect(f.room.decor()).toHaveLength(3);
  const block = f
    .tick(50)
    .dock?.cells.filter((c) => c.block.type === "drawers");
  expect(block).toHaveLength(1);
  expect(block?.[0]?.block).toMatchObject({
    end0: "mug_pair",
    end1: "mug_pair",
    counter: "potted_plant",
  });
});

it("closes both drawers on departure and after an undocked reload, keeping saved contents", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...DRAWER_GEAR_IDS),
      fc.constantFrom(...DRAWER_GEAR_IDS),
      (top, bottom) => {
        const f = fixture();
        for (const [id, item] of [
          ["drawer_top_0", top],
          ["drawer_bottom_0", bottom],
        ] as const) {
          f.press.execute(f.command(id));
          expect(f.place.execute(f.command(id, item))).toBe(true);
        }
        const saved = f.room.decor();
        const ctx = {
          tick: 0,
          location: { x: 0, y: 64, z: 0 },
          velocity: { x: 0, y: 0, z: 0 },
          onGround: true,
          deckSeatInputs: [],
          solidAt: () => false,
          waterAt: () => false,
          blockTypes: (cells: readonly unknown[]) =>
            cells.map(() => "minecraft:air"),
        };
        const parked = new CamperDrive(0, {
          docked: true,
          dockDecor: JSON.stringify(saved),
          ...{ drawer_top: 1, drawer_bottom: 1 },
        });
        const initial = parked.step(undefined, ctx);
        for (const name of ["drawer_top", "drawer_bottom"])
          expect(initial.commands).toContainEqual({
            type: "setProperty",
            name,
            value: 1,
          });
        const out = parked.step(
          { moveX: 0, moveY: 1, jump: false },
          { ...ctx, tick: 1 },
        );
        expect(out.depart).toBeDefined();
        for (const name of ["drawer_top", "drawer_bottom"])
          expect(out.commands).toContainEqual({
            type: "setProperty",
            name,
            value: 0,
          });
        expect(parked.decor()).toEqual(saved);
        const restored = new CamperDrive(0, {
          docked: false,
          dockDecor: JSON.stringify(saved),
          ...{ drawer_top: 1, drawer_bottom: 1 },
        });
        expect(restored.decor()).toEqual(saved);
        const reload = restored.step(undefined, ctx);
        for (const name of ["drawer_top", "drawer_bottom"])
          expect(reload.commands).toContainEqual({
            type: "setProperty",
            name,
            value: 0,
          });
      },
    ),
  );
});

it("preserves unknown saved slot ids when all known slots are occupied", () => {
  fc.assert(
    fc.property(fc.stringMatching(/^future_[a-z]{1,15}$/), (unknown) => {
      const saved = DECOR_SLOTS.map((s) => ({
        slot: s.id,
        item: s.hanging ? "macrame_planter" : "mug_pair",
      }));
      saved.push({ slot: decorSlotId(unknown), item: decorItemId("mug_pair") });
      const restored = new CamperDrive(0, { dockDecor: JSON.stringify(saved) });
      expect(restored.decor()).toContainEqual({
        slot: unknown,
        item: "mug_pair",
      });
      for (const door of KITCHEN_DRAWERS.doors)
        expect(restored.decor().some((d) => d.slot === door.slots[0]?.id)).toBe(
          true,
        );
    }),
  );
});

it("does not fall back from an occupied counter surface into either open drawer", () => {
  const f = fixture();
  for (const id of ["drawer_top_0", "drawer_bottom_0"])
    expect(f.press.execute(f.command(id))).toBe(true);
  for (const slot of DECOR_SLOTS.filter((s) => s.door === undefined))
    f.room.setDecor(
      slot.id,
      decorItemId(slot.hanging ? "macrame_planter" : "mug_pair"),
    );
  const before = f.room.decor();
  expect(f.place.execute(f.command("counter"))).toBe(false);
  expect(f.room.decor()).toEqual(before);
  expect(f.world.messages.at(-1)?.name).toBe("decor_no_slot");
});

it("closes and reopens populated drawers through the existing storage use case without returning contents", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...DRAWER_GEAR_IDS),
      fc.constantFrom("drawer_top_0", "drawer_bottom_0"),
      (item, id) => {
        const f = fixture();
        const cmd = { ...f.command(id, item), takeContents: false };
        expect(f.press.execute(cmd)).toBe(true);
        expect(f.place.execute(cmd)).toBe(true);
        const saved = f.room.decor();
        f.world.calls.length = 0;
        f.clock.tick += 10;
        expect(f.press.execute(cmd)).toBe(true);
        expect(f.room.decor()).toEqual(saved);
        const closed = f
          .tick(50)
          .dock?.cells.find((c) => c.block.type === "drawers")?.block;
        expect(closed).toMatchObject({
          type: "drawers",
          topOpen: false,
          bottomOpen: false,
        });
        f.clock.tick += 10;
        expect(f.press.execute(cmd)).toBe(true);
        expect(f.room.decor()).toEqual(saved);
        expect(f.world.calls).toEqual([]);
      },
    ),
  );
});
