import { BlockPermutation, type Entity } from "@minecraft/server";
import {
  type DecorPlacement,
  isDecorItem,
  parseDecorSlotId,
} from "../../domain/vehicle/dock/decor";
import type {
  DriveStep,
  RestoredValues,
  TickContext,
} from "../../domain/vehicle/drive";
import type { RawInput } from "../../domain/vehicle/driveInput";
import { DECOR_SLOTS } from "../../domain/vehicle/kinds/camper/decor";
import { slotPoint } from "../../domain/vehicle/kinds/camper/decorPlacing";
import { CamperDrive } from "../../domain/vehicle/kinds/camper/drive";
import { KITCHEN_DRAWERS } from "../../domain/vehicle/kinds/camper/furniture";
import {
  axes,
  localCellAt,
  parkPose,
} from "../../domain/vehicle/kinds/camper/parkPose";
import {
  CAMPER_SPEC,
  DRAWER_GEAR_IDS,
  DRAWER_HIT_PROFILE,
} from "../../domain/vehicle/kinds/camper/spec";
import { compartmentCells } from "../../domain/vehicle/kinds/camper/storagePlates";
import { DOCK } from "../../domain/vehicle/motion/dock";
import { id, NAMESPACE } from "../../infrastructure/shared/identifiers";
import {
  drawerBlockStates,
  pairDecorBlockId,
} from "../../infrastructure/vehicle/kinds/camper/identifiers";
import { type Arena, setDecor, wait } from "../arena";
import type { Outcome } from "../outcome";
import { atParkSpot } from "./camper";

function requireCheck(ok: boolean, message: string): void {
  if (!ok) throw new Error(message);
}

function savedDecor(carrier: Entity): string {
  const value = carrier.getDynamicProperty(id("decor"));
  if (typeof value !== "string")
    throw new Error("Missing persisted drawer decor");
  return value;
}

// No simulated player is available. Drive real domain presses and placements against BDS
// block reads and resolved pack permutations; device checks cover physical input routing.
function fixture(
  a: Arena,
  carrier: Entity,
  restored: RestoredValues = { docked: true },
) {
  const pose = parkPose(a.at(108.5, a.gy, 78.5), 90);
  const drive = new CamperDrive(pose.yaw, restored);
  const top = KITCHEN_DRAWERS.doors[0]?.slots[0];
  const bottom = KITCHEN_DRAWERS.doors[1]?.slots[0];
  if (!top || !bottom) throw new Error("Missing drawer fixture slots");
  const cell = localCellAt(pose, top.cell);
  let tick = 100;
  const properties = new Map<string, number | boolean | string>();
  const ctx: TickContext = {
    tick,
    location: pose,
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
    deckSeatInputs: [],
    solidAt: () => false,
    waterAt: () => false,
    blockTypes: (cells) => cells.map((at) => a.dim.getBlock(at)?.typeId),
  };
  const step = (input?: RawInput): DriveStep => {
    const out = drive.step(input, { ...ctx, tick: tick++ });
    for (const cmd of out.commands)
      if (cmd.type === "setProperty") {
        properties.set(cmd.name, cmd.value);
        if (cmd.name.startsWith("drawer_"))
          carrier.setProperty(id(cmd.name), cmd.value);
      }
    carrier.setDynamicProperty(id("decor"), JSON.stringify(drive.decor()));
    const drawer = out.dock?.cells.find((c) => c.block.type === "drawers");
    if (drawer?.block.type === "drawers")
      a.dim
        .getBlock(cell)
        ?.setPermutation(
          BlockPermutation.resolve(
            pairDecorBlockId("drawers"),
            drawerBlockStates(drawer.block),
          ),
        );
    const blockStates = a.dim.getBlock(cell)?.permutation.getAllStates();
    requireCheck(
      blockStates?.[id("top_drawer")] === undefined &&
        blockStates?.[id("bottom_drawer")] === undefined,
      "Drawers block must not carry drawer item states",
    );
    return out;
  };
  const point = (which: "top" | "bottom") =>
    slotPoint(pose, which === "top" ? top : bottom);
  const rayPoint = (
    left: number,
    height: number,
    ahead: number = DRAWER_HIT_PROFILE.contentAhead,
  ) => {
    const { f, l } = axes(pose.yaw);
    return {
      x:
        cell.x +
        0.5 +
        (left * l.x + ahead * f.x) / DRAWER_HIT_PROFILE.pixelsPerBlock,
      y: cell.y + height / DRAWER_HIT_PROFILE.pixelsPerBlock,
      z:
        cell.z +
        0.5 +
        (left * l.z + ahead * f.z) / DRAWER_HIT_PROFILE.pixelsPerBlock,
    };
  };
  const press = (
    which: "top" | "bottom",
    contents = false,
    openOnly = false,
  ) => {
    const door = which === "top" ? "drawer_top" : "drawer_bottom";
    const height =
      DRAWER_HIT_PROFILE.frontBottom[door] + DRAWER_HIT_PROFILE.frontHeight / 2;
    const eye = contents
      ? rayPoint(DRAWER_HIT_PROFILE.contentLeft, 20)
      : rayPoint(28, height);
    const target = contents
      ? rayPoint(DRAWER_HIT_PROFILE.contentLeft, 0)
      : rayPoint(0, height);
    return drive.pressStorage(cell, target, tick, undefined, eye, openOnly);
  };
  const place = (which: "top" | "bottom", item: string) => {
    if (!isDecorItem(item)) throw new Error(`Invalid fixture item ${item}`);
    const slot = drive.decorSlotFor(item, point(which), cell, false);
    return slot !== undefined && drive.placeDecor(slot, item);
  };
  const itemCode = (which: "top" | "bottom") =>
    carrier.getProperty(id(`drawer_${which}_item`));
  const opened = (which: "top" | "bottom") =>
    properties.get(`drawer_${which}`) === 1;
  const holds = (which: "top" | "bottom") => Number(itemCode(which)) > 0;
  const advance = async (ticks: number) => {
    for (let n = 0; n < ticks; n++) {
      step();
      await wait(1);
      for (const name of [
        "drawer_top",
        "drawer_bottom",
        "drawer_top_item",
        "drawer_bottom_item",
      ]) {
        const actual = carrier.getProperty(id(name));
        const expected = properties.get(name);
        // Entity float properties may round the script's double to single precision.
        requireCheck(
          typeof actual === "number" &&
            typeof expected === "number" &&
            Math.fround(actual) === Math.fround(expected),
          `Engine property must match ${name}`,
        );
      }
    }
  };
  return {
    drive,
    carrier,
    pose,
    cell,
    step,
    point,
    press,
    floorPress: () =>
      drive.pressStorage(
        localCellAt(pose, { x: 0, z: -1, layer: 0 }),
        rayPoint(10.336, 0, -6),
        tick,
        undefined,
        rayPoint(20.544, 24.32, 5.152),
      ),
    place,
    opened,
    holds,
    properties,
    advance,
  };
}

async function withFixture(
  a: Arena,
  run: (f: ReturnType<typeof fixture>) => Promise<Outcome>,
): Promise<Outcome> {
  const type = `${NAMESPACE}_test:drawer_probe`;
  const location = a.at(108.5, a.gy + 4, 78.5);
  a.dim.runCommand(`summon ${type} ${location.x} ${location.y} ${location.z}`);
  const carrier = a.dim.getEntities({ type, location, maxDistance: 1 })[0];
  if (!carrier) throw new Error("Drawer persistence probe was not summoned");
  const f = fixture(a, carrier);
  const original = a.dim.getBlock(f.cell)?.permutation;
  try {
    f.step();
    await wait(1);
    return await run(f);
  } finally {
    if (original) a.dim.getBlock(f.cell)?.setPermutation(original);
    if (carrier.isValid) carrier.remove();
  }
}

export function camperDrawersInteraction(a: Arena): Promise<Outcome> {
  return withFixture(a, async (f) => {
    requireCheck(
      !f.opened("top") && !f.opened("bottom"),
      "Drawers must start closed",
    );
    requireCheck(
      f.press("top", false, true)?.kind === "door",
      "Held-item front press must open",
    );
    requireCheck(f.place("top", "mug_pair"), "Allowed top item must place");
    requireCheck(
      f.press("top", false, true) === undefined,
      "Held-item open-only press must not close an open drawer",
    );
    requireCheck(
      !f.place("top", "book_stack"),
      "Full top drawer must refuse another item",
    );
    requireCheck(
      !f.place("bottom", "mug_pair"),
      "Closed bottom drawer must refuse placement",
    );
    for (let n = 1; n < CAMPER_SPEC.doorSwingTicks; n++) {
      await f.advance(1);
      requireCheck(
        f.properties.get("drawer_top") === n / CAMPER_SPEC.doorSwingTicks,
        `Opening property at tick ${n}`,
      );
      requireCheck(
        !f.opened("top") && !f.opened("bottom") && f.holds("top"),
        `Top item must be selected while opening (${n})`,
      );
    }
    await f.advance(1);
    requireCheck(
      f.properties.get("drawer_top") === 1 && f.opened("top"),
      "Top slide must finish at tick 10",
    );
    requireCheck(
      f.carrier.getProperty(id("drawer_top_item")) ===
        [...DRAWER_GEAR_IDS].indexOf("mug_pair") + 1 && !f.holds("bottom"),
      "Only top contains an item",
    );
    requireCheck(
      f.press("bottom")?.kind === "door",
      "Bottom must toggle independently",
    );
    requireCheck(
      !f.place("bottom", "potted_plant"),
      "Tall item must be refused",
    );
    requireCheck(
      f.place("bottom", "book_stack"),
      "Allowed bottom item must place",
    );
    const counter = DECOR_SLOTS.find((s) => s.id === "counter");
    const counterItem = "potted_plant";
    if (!counter || !isDecorItem(counterItem))
      throw new Error("Missing counter fixture");
    requireCheck(
      f.drive.placeDecor(counter.id, counterItem),
      "Counter remains usable",
    );
    await f.advance(CAMPER_SPEC.doorSwingTicks);
    requireCheck(
      f.opened("top") && f.opened("bottom"),
      "Both drawers must open",
    );
    requireCheck(
      f.carrier.getProperty(id("drawer_bottom_item")) ===
        [...DRAWER_GEAR_IDS].indexOf("book_stack") + 1,
      "Bottom entity item property must select the allowed item",
    );
    requireCheck(
      f.press("top")?.kind === "door",
      "View ray to populated front must close without returning item",
    );
    await f.advance(1);
    requireCheck(
      !f.opened("top") && f.opened("bottom") && f.holds("top"),
      "Only top must start closing",
    );
    requireCheck(
      f.drive.decor().length === 3,
      "Closing must preserve both items and counter decor",
    );
    requireCheck(
      f.press("bottom", true)?.kind === "item",
      "View ray to contents must return bottom item",
    );
    await f.advance(1);
    requireCheck(
      !f.holds("bottom") &&
        f.drive
          .decor()
          .some((d) => d.slot === "drawer_top_0" && d.item === "mug_pair"),
      "Removal must empty only bottom",
    );
    requireCheck(
      f.drive
        .decor()
        .some((d) => d.slot === "counter" && d.item === "potted_plant"),
      "Counter decor must survive",
    );
    await f.advance(CAMPER_SPEC.doorSwingTicks);
    requireCheck(
      f.floorPress()?.kind === "door",
      "Recorded aisle-floor ray must close the open empty bottom drawer",
    );
    await f.advance(1);
    requireCheck(!f.opened("bottom"), "Floor press must start bottom closing");
    return {
      pass: true,
      detail:
        "floor-routed close, independent toggle, allowed/occupied/tall placement, contents follow opening, close and removal",
    };
  });
}

export function camperDrawersRestore(a: Arena): Promise<Outcome> {
  return withFixture(a, async (f) => {
    for (const which of ["top", "bottom"] as const) {
      requireCheck(f.press(which)?.kind === "door", `${which} must open`);
      requireCheck(f.place(which, "mug_pair"), `${which} must store`);
    }
    await f.advance(CAMPER_SPEC.doorSwingTicks);
    const saved = f.carrier.getDynamicProperty(id("decor"));
    if (typeof saved !== "string")
      throw new Error("Missing persisted drawer decor");
    requireCheck(
      saved === JSON.stringify(f.drive.decor()),
      "Engine dynamic property must persist all decor",
    );
    const reloaded = fixture(a, f.carrier, {
      docked: true,
      dockDecor: saved,
      drawer_top: f.carrier.getProperty(id("drawer_top")),
      drawer_bottom: f.carrier.getProperty(id("drawer_bottom")),
    });
    reloaded.step();
    await wait(1);
    requireCheck(
      reloaded.opened("top") && reloaded.opened("bottom"),
      "Parked reload must restore open states",
    );
    requireCheck(
      JSON.stringify(reloaded.drive.decor()) === saved,
      "Reload must restore contents",
    );
    requireCheck(
      f.carrier.getProperty(id("drawer_top_item")) ===
        [...DRAWER_GEAR_IDS].indexOf("mug_pair") + 1 &&
        f.carrier.getProperty(id("drawer_bottom_item")) ===
          [...DRAWER_GEAR_IDS].indexOf("mug_pair") + 1,
      "Entity must retain both drawer item properties",
    );
    const departure = reloaded.step({ moveX: 0, moveY: 1, jump: false });
    await wait(1);
    requireCheck(
      departure.depart !== undefined,
      "Game-backed departure checks must allow leaving",
    );
    requireCheck(
      f.carrier.getProperty(id("drawer_top")) === 0 &&
        f.carrier.getProperty(id("drawer_bottom")) === 0,
      "Departure must close both properties",
    );
    requireCheck(
      JSON.stringify(reloaded.drive.decor()) === saved,
      "Departure must keep contents",
    );
    requireCheck(
      f.carrier.getProperty(id("drawer_top_item")) ===
        [...DRAWER_GEAR_IDS].indexOf("mug_pair") + 1 &&
        f.carrier.getProperty(id("drawer_bottom_item")) ===
          [...DRAWER_GEAR_IDS].indexOf("mug_pair") + 1,
      "Entity must retain both drawer item properties",
    );
    requireCheck(
      reloaded.press("top") === undefined &&
        reloaded.press("bottom") === undefined,
      "Moving camper must refuse both presses",
    );
    requireCheck(
      !reloaded.place("top", "book_stack"),
      "Moving camper must refuse placement",
    );
    for (const name of ["drawer_top", "drawer_bottom"])
      f.carrier.setProperty(id(name), 1);
    await wait(1);
    const undocked = fixture(a, f.carrier, {
      docked: false,
      dockDecor: savedDecor(f.carrier),
      drawer_top: f.carrier.getProperty(id("drawer_top")),
      drawer_bottom: f.carrier.getProperty(id("drawer_bottom")),
    });
    undocked.step();
    await wait(1);
    requireCheck(
      f.carrier.getProperty(id("drawer_top")) === 0 &&
        f.carrier.getProperty(id("drawer_bottom")) === 0,
      "Undocked reload must close both",
    );
    requireCheck(
      JSON.stringify(undocked.drive.decor()) === saved,
      "Undocked reload must retain contents",
    );
    requireCheck(
      f.carrier.getProperty(id("drawer_top_item")) ===
        [...DRAWER_GEAR_IDS].indexOf("mug_pair") + 1 &&
        f.carrier.getProperty(id("drawer_bottom_item")) ===
          [...DRAWER_GEAR_IDS].indexOf("mug_pair") + 1,
      "Entity must retain both drawer item properties",
    );
    const parkedAgain = fixture(a, f.carrier, {
      docked: true,
      dockDecor: savedDecor(f.carrier),
      drawer_top: f.carrier.getProperty(id("drawer_top")),
      drawer_bottom: f.carrier.getProperty(id("drawer_bottom")),
    });
    parkedAgain.step();
    await wait(1);
    requireCheck(
      !parkedAgain.opened("top") && !parkedAgain.opened("bottom"),
      "Next park must hide stored contents",
    );
    requireCheck(
      JSON.stringify(parkedAgain.drive.decor()) === saved,
      "Next park must retain both contents in saved decor",
    );
    requireCheck(
      f.carrier.getProperty(id("drawer_top_item")) ===
        [...DRAWER_GEAR_IDS].indexOf("mug_pair") + 1 &&
        f.carrier.getProperty(id("drawer_bottom_item")) ===
          [...DRAWER_GEAR_IDS].indexOf("mug_pair") + 1,
      "Entity must retain both drawer item properties",
    );
    return {
      pass: true,
      detail:
        "parked/undocked reload, departure closes and preserves, moving refusal, next park retains",
    };
  });
}

export function camperDrawersLaid(a: Arena): Promise<Outcome> {
  return atParkSpot(a, async (car) => {
    const decor: DecorPlacement[] = (
      [
        ["drawer_top_0", "mug_pair"],
        ["drawer_bottom_0", "book_stack"],
        ["counter", "potted_plant"],
      ] as const
    ).map(([rawSlot, item]) => {
      const slot = parseDecorSlotId(rawSlot);
      if (slot === undefined || !isDecorItem(item))
        throw new Error(`Invalid drawer fixture: ${rawSlot},${item}`);
      return { slot, item };
    });
    try {
      await wait(DOCK.ticks + 10);
      for (const d of decor) setDecor(car, d.slot, d.item);
      await wait(3);
      const pose = parkPose(car.location, car.getRotation().y);
      const compartments = compartmentCells(pose, decor, new Set());
      const cell = compartments.find((c) => c.block.type === "drawers");
      if (cell?.block.type !== "drawers")
        throw new Error("Missing domain drawers compartment");
      requireCheck(
        cell.block.counter === "potted_plant",
        "Expected counter decor on the shared drawer block",
      );
      const block = a.dim.getBlock(cell);
      const states = block?.permutation.getAllStates();
      const laid =
        block?.typeId === pairDecorBlockId("drawers") &&
        Object.entries(drawerBlockStates(cell.block)).every(
          ([name, value]) => states?.[name] === value,
        );
      const shut =
        car.getProperty(id("drawer_top")) === 0 &&
        car.getProperty(id("drawer_bottom")) === 0;
      const contents =
        car.getProperty(id("drawer_top_item")) ===
          [...DRAWER_GEAR_IDS].indexOf("mug_pair") + 1 &&
        car.getProperty(id("drawer_bottom_item")) ===
          [...DRAWER_GEAR_IDS].indexOf("book_stack") + 1;
      const counterOnly =
        states?.[id("top_drawer")] === undefined &&
        states?.[id("bottom_drawer")] === undefined;
      return {
        pass: laid && shut && contents && counterOnly,
        detail: `laid=${laid} shut=${shut} contents=${contents} counterOnly=${counterOnly}`,
      };
    } finally {
      for (const d of decor) setDecor(car, d.slot, undefined);
      await wait(3);
    }
  });
}
