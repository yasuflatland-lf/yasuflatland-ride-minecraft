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
import { registerDecor } from "../../../../../src/infrastructure/vehicle/kinds/camper/handlers/decor";

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
function fixture(full = false) {
  const drive = new CamperDrive(0, {
    docked: true,
    drawer_bottom: 1,
    dockDecor: full ? '[{"slot":"drawer_bottom_0","item":"mug_pair"}]' : "[]",
  });
  drive.step(undefined, {
    tick: 10,
    location: { x: 180.5, y: -60, z: 90.5 },
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
    execute: vi.fn(() => true),
    drawerTarget: vi.fn(
      (_id, ...args: Parameters<CamperDrive["drawerTarget"]>) =>
        drive.drawerTarget(...args),
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
    dimension: { id: "overworld" },
    location: { x: 180.784, y: -59, z: 89.822 },
    getHeadLocation: () => eye,
    getViewDirection: () => ({ x: -0.43, y: -0.903, z: 0.014 }),
  };
  const block = (
    cell = floor,
    item?: string,
    face = { x: 0.146, y: 0, z: 0.125 },
  ) => {
    const ev = {
      player,
      block: {
        typeId: "yasu_ride:camper_floor",
        location: cell,
        dimension: { id: "overworld" },
        permutation: { getAllStates: () => ({}) },
      },
      itemStack: item ? { typeId: item } : undefined,
      blockFace: "Up",
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
  return { storage, place, remove, block, use, flush, player };
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
  expect(f.block(floor, undefined, { x: 1, y: 0, z: 0.8 }).cancel).toBe(false);
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
