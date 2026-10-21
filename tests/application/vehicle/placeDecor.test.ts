import { describe, expect, it, vi } from "vitest";
import {
  PlaceDecor,
  type PlaceDecorCommand,
} from "../../../src/application/vehicle/placeDecor";
import { asPlayerId, asVehicleId } from "../../../src/domain/shared/ids";
import { decorSlot } from "../../../src/domain/vehicle/kinds/camper/decor";
import { slotPoint } from "../../../src/domain/vehicle/kinds/camper/decorPlacing";
import { decorSlotCell } from "../../../src/domain/vehicle/kinds/camper/room";
import { cellKey } from "../../../src/domain/vehicle/lighting/headlights";
import { FakeWorld, parkedCamper } from "./fakes";

function slot(id: string) {
  const s = decorSlot(id);
  if (!s) throw new Error(`no ${id} slot`);
  return s;
}

function setup() {
  const { car, pose, repo, tick } = parkedCamper();
  const world = new FakeWorld();
  const place = new PlaceDecor(world, repo);
  const stove = slot("stove");
  const cmd: PlaceDecorCommand = {
    playerId: asPlayerId("p"),
    vehicleId: car.id,
    item: "percolator",
    point: slotPoint(pose, stove),
    cell: decorSlotCell(pose, stove),
    hotbarSlot: 4,
    exact: false,
  };
  return { car, pose, tick, world, place, stove, cmd };
}

describe("PlaceDecor (ADR 0093, 0097)", () => {
  it("places on the nearest free slot, takes the held item in Survival, saves the decor, and lays it next tick (ADR 0093)", () => {
    const { car, pose, tick, world, place, stove, cmd } = setup();
    world.itemInSlot = true;
    expect(place.execute(cmd)).toBe(true);
    expect(world.calls).toEqual([
      "blockTypes",
      "consumeDecor:p:4:percolator",
      "saveDecor:car:stove=percolator",
    ]);
    expect(car.decor()).toEqual([{ slot: "stove", item: "percolator" }]);
    const at = decorSlotCell(pose, stove);
    expect(
      tick(21).dock?.cells.some(
        (c) =>
          c.block.type === "decor" &&
          c.x === at.x &&
          c.y === at.y &&
          c.z === at.z,
      ),
    ).toBe(true);
  });

  it("places without taking the item in Creative", () => {
    const { world, place, cmd } = setup();
    world.creativePlayers.add("p");
    expect(place.execute(cmd)).toBe(true);
    expect(world.calls).toEqual([
      "blockTypes",
      "saveDecor:car:stove=percolator",
    ]);
  });

  it("shows the no-slot message, keeps the item, and saves nothing when every accepting slot is taken", () => {
    const { pose, world, place, cmd } = setup();
    const hook = slot("ceiling_hook");
    const planter = {
      ...cmd,
      item: "macrame_planter",
      point: slotPoint(pose, hook),
      cell: decorSlotCell(pose, hook),
    };
    place.execute(planter);
    expect(place.execute(planter)).toBe(false);
    expect(world.messages.at(-1)).toEqual({
      playerId: "p",
      name: "decor_no_slot",
    });
    expect(world.calls).toEqual([
      "blockTypes",
      "consumeDecor:p:4:macrame_planter",
      "saveDecor:car:ceiling_hook=macrame_planter",
      "blockTypes",
      "showMessage",
    ]);
  });

  it("places in the pressed slot when it accepts the item and is free (ADR 0097)", () => {
    const { pose, world, place, cmd } = setup();
    world.creativePlayers.add("p");
    expect(
      place.execute({
        ...cmd,
        item: "potted_plant",
        point: slotPoint(pose, slot("shelf_low")),
        cell: decorSlotCell(pose, slot("shelf_high")),
      }),
    ).toBe(true);
    expect(world.calls).toEqual([
      "blockTypes",
      "saveDecor:car:shelf_high=potted_plant",
    ]);
  });

  it("picks the slot along the line of sight from the player's eye (ADR 0110)", () => {
    const { pose, world, place, cmd } = setup();
    world.creativePlayers.add("p");
    const wall = slot("stove_wall");
    const aim = slotPoint(pose, wall);
    const eye = { x: aim.x + 0.6, y: aim.y + 1.2, z: aim.z + 0.4 };
    expect(
      place.execute({
        ...cmd,
        item: "saucepan",
        point: {
          x: 2 * aim.x - eye.x,
          y: 2 * aim.y - eye.y,
          z: 2 * aim.z - eye.z,
        },
        cell: decorSlotCell(pose, wall),
        eye,
      }),
    ).toBe(true);
    expect(world.calls).toEqual([
      "blockTypes",
      "saveDecor:car:stove_wall=saucepan",
    ]);
  });

  it("refuses an exact press on a taken slot with the no-slot message, consuming and saving nothing (ADR 0104)", () => {
    const { car, world, place, cmd } = setup();
    world.itemInSlot = true;
    expect(place.execute(cmd)).toBe(true);
    world.calls.length = 0;
    expect(place.execute({ ...cmd, item: "toaster", exact: true })).toBe(false);
    expect(world.messages.at(-1)).toEqual({
      playerId: "p",
      name: "decor_no_slot",
    });
    expect(world.calls).toEqual(["blockTypes", "showMessage"]);
    expect(car.decor()).toEqual([{ slot: "stove", item: "percolator" }]);
  });

  it("places and saves nothing when the hotbar slot no longer holds the item", () => {
    const { car, world, place, cmd } = setup();
    world.itemInSlot = false;
    expect(place.execute(cmd)).toBe(false);
    expect(world.calls).toEqual(["blockTypes"]);
    expect(car.decor()).toEqual([]);
  });

  it("saves nothing when the vehicle refuses the slot it offered", () => {
    const { car, world, place, cmd } = setup();
    world.creativePlayers.add("p");
    vi.spyOn(car, "placeDecor").mockReturnValue(false);
    expect(place.execute(cmd)).toBe(false);
    expect(world.calls).toEqual(["blockTypes"]);
  });

  it("skips a slot whose host cell holds a player's block and sends the item to the nearest free slot instead (ADR 0108)", () => {
    const { pose, world, place, cmd } = setup();
    world.creativePlayers.add("p");
    const aisle = slot("table_aisle");
    world.typesAt.set(cellKey(decorSlotCell(pose, aisle)), "minecraft:chest");
    const press = {
      ...cmd,
      item: "mug_pair",
      point: slotPoint(pose, aisle),
      cell: decorSlotCell(pose, slot("table")),
    };
    expect(place.execute(press)).toBe(true);
    expect(world.calls).toEqual(["blockTypes", "saveDecor:car:table=mug_pair"]);
    world.typesAt.clear();
    expect(place.execute(press)).toBe(true);
    expect(world.calls.at(-1)).toBe(
      "saveDecor:car:table=mug_pair,table_aisle=mug_pair",
    );
  });

  it("ignores an unknown vehicle", () => {
    const { world, place, cmd } = setup();
    expect(place.execute({ ...cmd, vehicleId: asVehicleId("unknown") })).toBe(
      false,
    );
    expect(world.calls).toEqual([]);
  });
});
