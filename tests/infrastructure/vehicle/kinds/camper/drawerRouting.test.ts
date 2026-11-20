import type {
  ItemUseAfterEvent,
  PlayerInteractWithBlockBeforeEvent,
} from "@minecraft/server";
import { beforeEach, expect, it, vi } from "vitest";
import type { PlaceDecor } from "../../../../../src/application/vehicle/placeDecor";
import type { PressStorage } from "../../../../../src/application/vehicle/pressStorage";
import type { RemoveDecor } from "../../../../../src/application/vehicle/removeDecor";
import { asVehicleId } from "../../../../../src/domain/shared/ids";
import { CamperDrive } from "../../../../../src/domain/vehicle/kinds/camper/drive";
import {
  CAMPER_SAVED,
  type RoomStorageHost,
} from "../../../../../src/domain/vehicle/kinds/index";
import { registerDecor } from "../../../../../src/infrastructure/vehicle/kinds/camper/handlers/decor";
import { pairDecorBlockId } from "../../../../../src/infrastructure/vehicle/kinds/camper/identifiers";
import { camperRoom } from "../../../../support/camperRoom";

const game = vi.hoisted(() => ({
  block: vi.fn(),
  entity: vi.fn(),
  itemUse: vi.fn(),
  startup: vi.fn(),
  system: { currentTick: 100, run: vi.fn() },
}));
vi.mock("@minecraft/server", () => ({
  system: {
    ...game.system,
    beforeEvents: { startup: { subscribe: game.startup } },
    get currentTick() {
      return game.system.currentTick;
    },
  },
  world: {
    beforeEvents: {
      playerInteractWithBlock: { subscribe: game.block },
      playerInteractWithEntity: { subscribe: game.entity },
    },
    afterEvents: { itemUse: { subscribe: game.itemUse } },
  },
}));
const eye = { x: 180.784, y: -57.48, z: 89.822 };
const floor = { x: 180, y: -60, z: 89 };
const counter = { x: 179, y: -59, z: 89 };
const vehicleId = asVehicleId("camper");
beforeEach(() => {
  vi.clearAllMocks();
  game.system.currentTick = 100;
});
function fixture(
  full = false,
  top = false,
  bottom = true,
  geometry = {
    floor,
    eye,
    pose: { x: 180.5, y: -60, z: 90.5 },
  },
) {
  const drive = new CamperDrive(0, {
    docked: true,
    drawer_top: top ? 1 : 0,
    drawer_bottom: bottom ? 1 : 0,
    [CAMPER_SAVED.decor]: full
      ? '[{"slot":"drawer_bottom_0","item":"mug_pair"}]'
      : "[]",
  });
  drive.step(undefined, {
    tick: 10,
    location: geometry.pose,
    velocity: { x: 0, y: 0, z: 0 },
    deckSeatInputs: [],
    onGround: true,
    solidAt: () => false,
    waterAt: () => false,
    blockTypes: (cells) => cells.map(() => "minecraft:air"),
  });
  const place = { execute: vi.fn(() => true) };
  const remove = { execute: vi.fn() };
  const storage = {
    execute: vi.fn((_press: Parameters<PressStorage["execute"]>[0]) => true),
    drawerTarget: vi.fn(
      (_id, ...args: Parameters<RoomStorageHost["drawerTarget"]>) =>
        camperRoom(drive).storage.drawerTarget(...args),
    ),
  };
  const owner = vi.fn(() => vehicleId);
  registerDecor(
    place as unknown as PlaceDecor,
    remove as unknown as RemoveDecor,
    owner,
    storage as unknown as PressStorage,
  );
  const player = {
    id: "player",
    selectedSlotIndex: 2,
    inputInfo: { lastInputModeUsed: "Touch" },
    dimension: { id: "overworld" },
    location: { ...geometry.eye, y: geometry.eye.y - 1.52 },
    getHeadLocation: () => geometry.eye,
    getViewDirection: () => ({ x: -0.43, y: -0.903, z: 0.014 }),
  };
  const block = (
    cell = geometry.floor,
    item?: string,
    // Synthetic touch report retains the original intended world x after correction.
    face = { x: 1 - 0.146, y: 0, z: 0.125 },
    typeId = "yasu_ride:camper_floor",
    blockFace = "Up",
  ) => {
    const ev = {
      player,
      block: {
        typeId,
        location: cell,
        dimension: { id: "overworld" },
        permutation: { getAllStates: () => ({}) },
      },
      itemStack: item ? { typeId: item } : undefined,
      blockFace,
      faceLocation: face,
      isFirstEvent: true,
      cancel: false,
    };
    game.block.mock.calls[0]?.[0](
      ev as unknown as PlayerInteractWithBlockBeforeEvent,
    );
    return ev;
  };
  const use = () =>
    game.itemUse.mock.calls[0]?.[0]({
      source: player,
      itemStack: { typeId: "yasu_ride:mug_pair" },
    } as unknown as ItemUseAfterEvent);
  const flush = () => {
    for (const [callback] of game.system.run.mock.calls) callback();
    game.system.run.mockClear();
  };
  return { storage, place, remove, block, use, flush, player, drive };
}
it("cancels a confirmed empty-hand aisle-floor ray and defers storage with the counter cell and eye", () => {
  const f = fixture();
  expect(f.block().cancel).toBe(true);
  expect(f.storage.execute).not.toHaveBeenCalled();
  f.flush();
  expect(f.storage.execute).toHaveBeenCalledWith(
    expect.objectContaining({
      vehicleId,
      cell: counter,
      eye,
      point: { x: 180.146, y: -59, z: 89.125 },
    }),
  );
  expect(f.remove.execute).not.toHaveBeenCalled();
});
it("leaves other floor cells and missed rays alone", () => {
  const f = fixture();
  expect(f.block({ ...floor, z: floor.z + 1 }).cancel).toBe(false);
  expect(f.block(floor, undefined, { x: 0, y: 0, z: 0.8 }).cancel).toBe(false);
  expect(game.system.run).not.toHaveBeenCalled();
});
it("places once from itemUse and suppresses the same tap in this tick and the next", () => {
  const f = fixture();
  f.use();
  expect(f.place.execute).toHaveBeenCalledTimes(1);
  expect(f.place.execute).toHaveBeenCalledWith(
    expect.objectContaining({
      vehicleId,
      cell: counter,
      slot: "drawer_bottom_0",
      exact: true,
      item: "mug_pair",
    }),
  );
  f.use();
  expect(f.place.execute).toHaveBeenCalledTimes(1);
  game.system.currentTick++;
  f.use();
  expect(f.place.execute).toHaveBeenCalledTimes(1);
});
it("suppresses itemUse when the block path already handled the tap", () => {
  const f = fixture();
  expect(f.block(floor, "yasu_ride:mug_pair").cancel).toBe(true);
  f.use();
  expect(f.place.execute).not.toHaveBeenCalled();
  game.system.currentTick++;
  f.use();
  expect(f.place.execute).not.toHaveBeenCalled();
  f.flush();
  expect(f.storage.execute).toHaveBeenCalledTimes(1);
});
it("does not redirect an occupied drawer to another slot", () => {
  const f = fixture(true);
  f.use();
  expect(f.place.execute).not.toHaveBeenCalled();
  expect(f.storage.execute).not.toHaveBeenCalled();
});

it("uses the narrow touch fallback when the view ray misses from the counter aisle", () => {
  const f = fixture();
  f.player.getViewDirection = () => ({ x: 1, y: 0, z: 0 });
  f.use();
  expect(f.place.execute).toHaveBeenCalledWith(
    expect.objectContaining({
      slot: "drawer_bottom_0",
      exact: true,
    }),
  );
});

it("opens a closed top front through itemUse without placing or taking contents", () => {
  const f = fixture();
  f.player.getViewDirection = () => ({
    x: 179.959375 - eye.x,
    y: -58.4 - eye.y,
    z: 89.5 - eye.z,
  });
  f.use();
  expect(f.storage.execute).toHaveBeenCalledWith(
    expect.objectContaining({
      vehicleId,
      cell: counter,
      eye,
      openOnly: true,
      takeContents: false,
    }),
  );
  expect(f.place.execute).not.toHaveBeenCalled();
});

it("keeps ordinary floor placement for held gear when the floor ray misses every drawer", () => {
  const f = fixture();
  const ev = f.block({ ...floor, z: floor.z + 1 }, "yasu_ride:mug_pair");
  expect(ev.cancel).toBe(true);
  f.flush();
  expect(f.storage.execute).not.toHaveBeenCalled();
  expect(f.place.execute).toHaveBeenCalledWith(
    expect.objectContaining({ item: "mug_pair", exact: false }),
  );
});

const drawerStates = [
  [false, false],
  [true, false],
  [false, true],
  [true, true],
] as const;

for (const [top, bottom] of drawerStates) {
  it.each([
    [4.679, "drawer_top"],
    [10.467, "drawer_bottom"],
    [6.73, "drawer_top"],
    [5.43, "drawer_top"],
    [13.16, "drawer_bottom"],
  ] as const)(
    `routes East-face touch report %s px to %s with top=${top}, bottom=${bottom}`,
    (reportedPx, drawer) => {
      const f = fixture(false, top, bottom);
      const ev = f.block(
        counter,
        undefined,
        { x: 0, y: reportedPx / 16, z: 0.5 },
        pairDecorBlockId("drawers"),
        "East",
      );
      expect(ev.cancel).toBe(true);
      expect(f.storage.execute).not.toHaveBeenCalled();
      f.flush();
      expect(f.storage.execute).toHaveBeenCalledTimes(1);
      const press = f.storage.execute.mock.calls[0]?.[0];
      expect(press).toMatchObject({ cell: counter, drawersSideFace: true });
      if (!press?.point) throw new Error("Expected a storage press point");
      expect(press.point.y - counter.y).toBeCloseTo(1 - reportedPx / 16, 12);
      expect(
        camperRoom(f.drive).storage.pressStorage({
          cell: press.cell,
          point: press.point,
          tick: 200,
          takeContents: press.takeContents,
          eye: press.eye,
          openOnly: press.openOnly,
          drawersSideFace: press.drawersSideFace,
        }),
      ).toMatchObject({ kind: "door" });
      f.drive.resync();
      const out = f.drive.step(undefined, {
        tick: 201,
        location: { x: 180.5, y: -60, z: 90.5 },
        velocity: { x: 0, y: 0, z: 0 },
        deckSeatInputs: [],
        onGround: true,
        solidAt: () => false,
        waterAt: () => false,
        blockTypes: (cells) => cells.map(() => "minecraft:air"),
      });
      for (const [name, wasOpen] of [
        ["drawer_top", top],
        ["drawer_bottom", bottom],
      ] as const) {
        const command = out.commands.find(
          (c) => c.type === "setProperty" && c.name === name,
        );
        expect(command).toMatchObject({
          value: name === drawer ? (wasOpen ? 0.9 : 0.1) : wasOpen ? 1 : 0,
        });
      }
    },
  );
}

it("preserves a keyboard and mouse side-face report", () => {
  const f = fixture();
  f.player.inputInfo.lastInputModeUsed = "KeyboardAndMouse";
  f.block(
    counter,
    undefined,
    { x: 0, y: 4.679 / 16, z: 0.5 },
    pairDecorBlockId("drawers"),
    "West",
  );
  f.flush();
  expect(f.storage.execute).toHaveBeenCalledWith(
    expect.objectContaining({
      point: { x: counter.x, y: counter.y + 4.679 / 16, z: counter.z + 0.5 },
      drawersSideFace: true,
    }),
  );
});

// These synthetic world points need mirrored touch reports to retain their footprint.
it.each([
  [0.314, true, true, "drawer_bottom"],
  [0.45, true, true, "drawer_bottom"],
  [0.314, false, true, "drawer_bottom"],
  [0.45, false, true, "drawer_bottom"],
  [0.314, true, false, "drawer_top"],
  [0.45, true, false, "drawer_top"],
] as const)(
  "routes a shallow floor press at corrected x=%s with top=%s and bottom=%s to %s",
  (x, top, bottom, drawer) => {
    const f = fixture(true, top, bottom);
    f.player.getHeadLocation = () => ({ x: 180.85, y: -58.48, z: 89.5 });
    expect(f.block(floor, undefined, { x: 1 - x, y: 0, z: 0.491 }).cancel).toBe(
      true,
    );
    f.flush();
    const press = f.storage.execute.mock.calls[0]?.[0];
    expect(press).toMatchObject({ cell: counter });
    if (!press) throw new Error("Expected storage press");
    expect(
      camperRoom(f.drive).storage.pressStorage({
        cell: press.cell,
        point: press.point,
        tick: 200,
        takeContents: press.takeContents,
        eye: press.eye,
        openOnly: press.openOnly,
        drawersSideFace: press.drawersSideFace,
      }),
    ).toMatchObject({ kind: "door" });
    f.drive.resync();
    const out = f.drive.step(undefined, {
      tick: 201,
      location: { x: 180.5, y: -60, z: 90.5 },
      velocity: { x: 0, y: 0, z: 0 },
      deckSeatInputs: [],
      onGround: true,
      solidAt: () => false,
      waterAt: () => false,
      blockTypes: (cells) => cells.map(() => "minecraft:air"),
    });
    for (const [name, wasOpen] of [
      ["drawer_top", top],
      ["drawer_bottom", bottom],
    ] as const) {
      expect(
        out.commands.find((c) => c.type === "setProperty" && c.name === name),
      ).toMatchObject({
        value: name === drawer ? 0.9 : wasOpen ? 1 : 0,
      });
    }
    expect(camperRoom(f.drive).decor.decor()).toEqual([
      { slot: "drawer_bottom_0", item: "mug_pair" },
    ]);
  },
);
it("leaves a distant floor tap available for ordinary placement", () => {
  const f = fixture();
  f.player.getHeadLocation = () => ({ x: 180.85, y: -58.48, z: 89.5 });
  expect(
    f.block(floor, undefined, { x: 1 - 0.893, y: 0, z: 0.433 }).cancel,
  ).toBe(false);
  expect(f.storage.execute).not.toHaveBeenCalled();
  f.block(floor, "yasu_ride:mug_pair", { x: 1 - 0.893, y: 0, z: 0.433 });
  f.flush();
  expect(f.place.execute).toHaveBeenCalledWith(
    expect.objectContaining({ exact: false }),
  );
  expect(f.storage.execute).not.toHaveBeenCalled();
});

it("closes an occupied footprint drawer with allowlisted gear without placing or taking contents", () => {
  const f = fixture(true);
  f.player.getHeadLocation = () => ({ x: 180.85, y: -58.48, z: 89.5 });
  expect(
    f.block(floor, "yasu_ride:mug_pair", { x: 1 - 0.45, y: 0, z: 0.491 })
      .cancel,
  ).toBe(true);
  f.flush();
  const press = f.storage.execute.mock.calls[0]?.[0];
  if (!press) throw new Error("Expected storage press");
  expect(
    camperRoom(f.drive).storage.pressStorage({
      cell: press.cell,
      point: press.point,
      tick: 200,
      takeContents: press.takeContents,
      eye: press.eye,
      openOnly: press.openOnly,
      drawersSideFace: press.drawersSideFace,
    }),
  ).toMatchObject({ kind: "door" });
  expect(f.place.execute).not.toHaveBeenCalled();
  expect(camperRoom(f.drive).decor.decor()).toEqual([
    { slot: "drawer_bottom_0", item: "mug_pair" },
  ]);
});

const recordedGeometry = {
  floor: { x: -1, y: -60, z: 4 },
  eye: { x: -0.15, y: -58.48, z: 4.5 },
  pose: { x: -0.5, y: -60, z: 5.5 },
};

for (const [top, bottom] of drawerStates) {
  it.each([
    [0.893, 0.433],
    [0.811, 0.437],
  ])(
    `replays recorded floor report (%s,0,%s) with top=${top}, bottom=${bottom}`,
    (x, z) => {
      const f = fixture(false, top, bottom, recordedGeometry);
      const ev = f.block(recordedGeometry.floor, undefined, { x, y: 0, z });
      expect(ev.cancel).toBe(top || bottom);
      f.flush();
      if (!top && !bottom) {
        expect(f.storage.execute).not.toHaveBeenCalled();
        return;
      }
      const press = f.storage.execute.mock.calls[0]?.[0];
      if (!press) throw new Error("Expected recorded floor storage press");
      expect(press.cell).toEqual({ x: -2, y: -59, z: 4 });
      expect(
        camperRoom(f.drive).storage.pressStorage({
          cell: press.cell,
          point: press.point,
          tick: 200,
          takeContents: press.takeContents,
          eye: press.eye,
          openOnly: press.openOnly,
          drawersSideFace: press.drawersSideFace,
        }),
      ).toMatchObject({ kind: "door" });
      f.drive.resync();
      const out = f.drive.step(undefined, {
        tick: 201,
        location: recordedGeometry.pose,
        velocity: { x: 0, y: 0, z: 0 },
        deckSeatInputs: [],
        onGround: true,
        solidAt: () => false,
        waterAt: () => false,
        blockTypes: (cells) => cells.map(() => "minecraft:air"),
      });
      for (const [name, open] of [
        ["drawer_top", top],
        ["drawer_bottom", bottom],
      ] as const) {
        expect(
          out.commands.find((c) => c.type === "setProperty" && c.name === name),
        ).toMatchObject({
          value:
            name === (bottom ? "drawer_bottom" : "drawer_top")
              ? 0.9
              : open
                ? 1
                : 0,
        });
      }
    },
  );
}

it.each([
  [0.146, 0.125],
  [0.138, 0.12],
])(
  "replays older raw floor report (%s,0,%s) as a miss in its documented pose",
  (x, z) => {
    const f = fixture();
    expect(f.block(floor, undefined, { x, y: 0, z }).cancel).toBe(false);
    expect(game.system.run).not.toHaveBeenCalled();
  },
);

it("does not close the sole open top drawer outside its footprint and ray", () => {
  const f = fixture(false, true, false, recordedGeometry);
  expect(
    f.block(recordedGeometry.floor, undefined, { x: 0.05, y: 0, z: 0.95 })
      .cancel,
  ).toBe(false);
  f.flush();
  expect(f.storage.execute).not.toHaveBeenCalled();
});
