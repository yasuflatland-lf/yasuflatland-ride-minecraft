import fc from "fast-check";
import { expect, it } from "vitest";
import { PlaceDecor } from "../../../../../src/application/vehicle/placeDecor";
import { PressStorage } from "../../../../../src/application/vehicle/pressStorage";
import { RemoveDecor } from "../../../../../src/application/vehicle/removeDecor";
import { asPlayerId } from "../../../../../src/domain/shared/ids";
import { CAMPING_GEAR_IDS } from "../../../../../src/domain/vehicle/kinds/camper/campingGear";
import { DECOR_SLOTS } from "../../../../../src/domain/vehicle/kinds/camper/decor";
import { slotPoint } from "../../../../../src/domain/vehicle/kinds/camper/decorPlacing";
import { CamperDrive } from "../../../../../src/domain/vehicle/kinds/camper/drive";
import { KITCHEN_DRAWERS } from "../../../../../src/domain/vehicle/kinds/camper/furniture";
import {
  axes,
  localCellAt,
} from "../../../../../src/domain/vehicle/kinds/camper/parkPose";
import {
  DRAWER_GEAR_IDS,
  DRAWER_HIT_PROFILE as HIT,
} from "../../../../../src/domain/vehicle/kinds/camper/spec";
import {
  FakeClock,
  FakeWorld,
  parkedCamper,
} from "../../../../application/vehicle/fakes";
import { decorItemId, decorSlotId } from "../../../../support/decorIds";
import { defined } from "../../../../support/defined";

function fixture() {
  const f = parkedCamper();
  const world = new FakeWorld();
  world.creativePlayers.add("p");
  const clock = new FakeClock();
  clock.tick = 100;
  const press = new PressStorage(world, f.repo, clock);
  const place = new PlaceDecor(world, f.repo);
  const remove = new RemoveDecor(world, f.repo);
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
  const rayPoint = (left: number, height: number, ahead = HIT.contentAhead) => {
    const cell = command("counter").cell;
    const { f: forward, l } = axes(f.pose.yaw);
    return {
      x: cell.x + 0.5 + (left * l.x + ahead * forward.x) / HIT.pixelsPerBlock,
      y: cell.y + height / HIT.pixelsPerBlock,
      z: cell.z + 0.5 + (left * l.z + ahead * forward.z) / HIT.pixelsPerBlock,
    };
  };
  const rayCommand = (
    id: "drawer_top_0" | "drawer_bottom_0" | "counter",
    target: "front" | "contents" | "counter" = "front",
    item = "mug_pair",
  ) => {
    const base = command(id, item);
    if (target === "counter")
      return {
        ...base,
        eye: rayPoint(0, HIT.counterHeight + 10),
        point: rayPoint(0, 0),
      };
    if (target === "contents")
      return {
        ...base,
        eye: rayPoint(HIT.contentLeft, 20),
        point: rayPoint(HIT.contentLeft, 0),
      };
    const door = id === "drawer_top_0" ? "drawer_top" : "drawer_bottom";
    const height = HIT.frontBottom[door] + HIT.frontHeight / 2;
    return { ...base, eye: rayPoint(-28, height), point: rayPoint(0, height) };
  };
  return {
    ...f,
    world,
    clock,
    press,
    place,
    remove,
    room,
    slot,
    command,
    rayCommand,
  };
}

it("opens held-item front presses once and keeps populated front toggles separate from content returns through the application", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("drawer_top_0", "drawer_bottom_0"),
      fc.constantFrom(...DRAWER_GEAR_IDS),
      (id, item) => {
        const f = fixture();
        const front = f.rayCommand(id, "front", item);
        expect(f.press.execute({ ...front, openOnly: true })).toBe(true);
        expect(f.place.execute(front)).toBe(true);
        const saved = f.room.decor();
        f.clock.tick += 10;
        f.world.calls.length = 0;
        expect(f.press.execute({ ...front, openOnly: true })).toBe(false);
        expect(f.room.decor()).toEqual(saved);
        expect(f.world.calls).toEqual([]);
        expect(f.press.execute(front)).toBe(true);
        expect(f.room.decor()).toEqual(saved);
        expect(f.world.calls).toEqual([]);
        f.clock.tick += 10;
        expect(f.press.execute({ ...front, openOnly: true })).toBe(true);
        f.clock.tick += 10;
        expect(f.press.execute(f.rayCommand(id, "contents", item))).toBe(true);
        expect(f.room.decor()).toEqual([]);
        expect(f.world.calls).toEqual([
          "saveDecor:car:",
          `giveDecor:p:${item}`,
        ]);
      },
    ),
  );
});

it("never lets a debounced drawer press remove counter decor through the application fallback", () => {
  fc.assert(
    fc.property(fc.constantFrom("drawer_top_0", "drawer_bottom_0"), (id) => {
      const f = fixture();
      expect(
        f.place.execute(f.rayCommand("counter", "counter", "potted_plant")),
      ).toBe(true);
      const front = f.rayCommand(id);
      expect(f.press.execute(front)).toBe(true);
      expect(f.place.execute(front)).toBe(true);
      const saved = f.room.decor();
      f.world.calls.length = 0;
      for (const target of ["front", "contents"] as const) {
        const cmd = f.rayCommand(id, target);
        expect(f.press.execute(cmd)).toBe(false);
        expect(f.remove.execute(cmd)).toBe(false);
        expect(f.room.decor()).toEqual(saved);
      }
      expect(f.world.calls).toEqual([]);
    }),
  );
});

it("places and removes counter decor by view ray independently of populated drawers", () => {
  fc.assert(
    fc.property(fc.constantFrom("drawer_top_0", "drawer_bottom_0"), (id) => {
      const f = fixture();
      const front = f.rayCommand(id);
      expect(f.press.execute(front)).toBe(true);
      expect(f.place.execute(front)).toBe(true);
      const drawerDecor = f.room.decor();
      const counter = f.rayCommand("counter", "counter", "potted_plant");
      expect(f.place.execute(counter)).toBe(true);
      expect(f.room.decor()).toHaveLength(2);
      expect(f.press.execute(counter)).toBe(false);
      f.world.calls.length = 0;
      expect(f.remove.execute(counter)).toBe(true);
      expect(f.room.decor()).toEqual(drawerDecor);
      expect(f.world.calls).toEqual([
        `saveDecor:car:${id}=mug_pair`,
        "giveDecor:p:potted_plant",
      ]);
    }),
  );
});

it("loads an old save without drawer properties or placements as closed and empty", () => {
  const restored = new CamperDrive(0, { docked: true });
  expect(restored.decor()).toEqual([]);
  const out = restored.step(undefined, {
    tick: 0,
    location: { x: 0.5, y: 64, z: 0.5 },
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
    deckSeatInputs: [],
    solidAt: () => false,
    waterAt: () => false,
    blockTypes: (cells) => cells.map(() => "minecraft:air"),
  });
  for (const name of ["drawer_top", "drawer_bottom"])
    expect(out.commands).toContainEqual({
      type: "setProperty",
      name,
      value: 0,
    });
  const block = defined(
    out.dock?.cells.find((cell) => cell.block.type === "drawers")?.block,
    "drawer block",
  );
  expect(block.type).toBe("drawers");
  expect(block).not.toHaveProperty("end0");
  expect(block).not.toHaveProperty("end1");
});

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
  for (const slot of ["drawer_top_0", "drawer_bottom_0"])
    expect(f.room.decor()).toContainEqual({ slot, item: "mug_pair" });
  const block = f
    .tick(50)
    .dock?.cells.filter((c) => c.block.type === "drawers");
  expect(block).toHaveLength(1);
  expect(block?.[0]?.block).toMatchObject({
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
        const itemCommands = [top, bottom].map((item, i) => ({
          type: "setProperty",
          name: i === 0 ? "drawer_top_item" : "drawer_bottom_item",
          value: [...DRAWER_GEAR_IDS].indexOf(item) + 1,
        }));
        for (const command of itemCommands)
          expect(initial.commands).toContainEqual(command);
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
        for (const name of ["drawer_top_item", "drawer_bottom_item"])
          expect(out.commands).not.toContainEqual({
            type: "setProperty",
            name,
            value: 0,
          });
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
        for (const command of itemCommands)
          expect(reload.commands).toContainEqual(command);
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
        });
        f.clock.tick += 10;
        expect(f.press.execute(cmd)).toBe(true);
        expect(f.room.decor()).toEqual(saved);
        expect(f.world.calls).toEqual([]);
      },
    ),
  );
});

it("keeps the counter block unchanged while entity contents slide through opening and closing", () => {
  const f = fixture();
  const cmd = { ...f.command("drawer_top_0"), takeContents: false };
  expect(f.press.execute(cmd)).toBe(true);
  expect(f.place.execute(cmd)).toBe(true);
  let previousBlock: unknown;
  for (let i = 1; i <= 10; i++) {
    const out = f.tick(100 + i);
    if (i === 1)
      expect(out.stepCommands).toContainEqual({
        type: "setProperty",
        name: "drawer_top_item",
        value: [...DRAWER_GEAR_IDS].indexOf("mug_pair") + 1,
      });
    const block = out.dock?.cells.find(
      (c) => c.block.type === "drawers",
    )?.block;
    expect(block?.type).toBe("drawers");
    if (previousBlock !== undefined) expect(block).toEqual(previousBlock);
    previousBlock = block;
    expect(out.stepCommands).toContainEqual({
      type: "setProperty",
      name: "drawer_top",
      value: i / 10,
    });
  }
  f.clock.tick += 10;
  expect(f.press.execute(cmd)).toBe(true);
  expect(
    f.tick(111).dock?.cells.find((c) => c.block.type === "drawers")?.block,
  ).toEqual(previousBlock);
});

it("refuses a decor placement before consuming its item when preserved save entries exhaust the string limit", () => {
  const known = DECOR_SLOTS.map((s) => ({
    slot: s.id,
    item: s.hanging ? "macrame_planter" : "mug_pair",
  }));
  const unknown = { slot: `future_${"x".repeat(32700)}`, item: "mug_pair" };
  const restored = new CamperDrive(0, {
    dockDecor: JSON.stringify([...known, unknown]),
  });
  // Keep the unknown entry stowed while freeing one known slot for the attempted placement.
  expect(restored.setDecor(decorSlotId("counter"), undefined)).toBe(true);
  expect(
    restored.setDecor(decorSlotId("counter"), decorItemId("mug_pair")),
  ).toBe(false);
  expect(restored.decor()).toContainEqual(unknown);
  expect(restored.decor().some((d) => d.slot === "counter")).toBe(false);
});

it("syncs independent drawer item codes on changes and resync, including while opening", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...DRAWER_GEAR_IDS),
      fc.constantFrom(...DRAWER_GEAR_IDS),
      (top, bottom) => {
        const f = fixture();
        for (const [slot, item] of [
          ["drawer_top_0", top],
          ["drawer_bottom_0", bottom],
        ] as const) {
          expect(f.press.execute(f.command(slot))).toBe(true);
          expect(f.place.execute(f.command(slot, item))).toBe(true);
        }
        const expected = [top, bottom].map((item, i) => ({
          type: "setProperty",
          name: i === 0 ? "drawer_top_item" : "drawer_bottom_item",
          value: [...DRAWER_GEAR_IDS].indexOf(item) + 1,
        }));
        const first = f.tick(101);
        for (const command of expected)
          expect(first.stepCommands).toContainEqual(command);
        const unchanged = f.tick(102);
        for (const command of expected)
          expect(unchanged.stepCommands).not.toContainEqual(command);
        f.car.resync();
        const resend = f.tick(103);
        for (const command of expected)
          expect(resend.stepCommands).toContainEqual(command);
        f.room.setDecor(decorSlotId("drawer_bottom_0"), undefined);
        expect(f.tick(104).stepCommands).toContainEqual({
          type: "setProperty",
          name: "drawer_bottom_item",
          value: 0,
        });
      },
    ),
  );
});
