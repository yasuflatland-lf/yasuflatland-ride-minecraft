import type { Block, Player } from "@minecraft/server";
import { expect, it, vi } from "vitest";
import { SwitchCeilingLights } from "../../../../src/application/vehicle/switchCeilingLights";
import { SwitchHeadlights } from "../../../../src/application/vehicle/switchHeadlights";
import { asDimensionId } from "../../../../src/domain/shared/ids";
import { vehicleSwitchTarget } from "../../../../src/infrastructure/vehicle/bedrock/handlers/headlights";
import {
  DECK_SEAT_OF_PROPERTY,
  DECK_SEAT_TYPE,
  DECK_SEATS_PROPERTY,
} from "../../../../src/infrastructure/vehicle/bedrock/identifiers";
import {
  FakeClock,
  FakeWorld,
  parkedCamper,
  stillTick,
} from "../../../application/vehicle/fakes";

const game = vi.hoisted(() => ({ getEntity: vi.fn() }));
vi.mock("@minecraft/server", () => ({ world: game }));

it("routes the parked camper's wheel deck seat to headlights and other places to room lights", () => {
  const { car, repo } = parkedCamper();
  stillTick(car, 21, "driver");
  const world = new FakeWorld();
  world.headlights.set("car", false);
  const clock = new FakeClock();
  const target = vehicleSwitchTarget(
    new SwitchHeadlights(world, repo, clock),
    new SwitchCeilingLights(repo, clock),
    () => car.id,
  );
  const vehicle = {
    id: "car",
    typeId: "yasu_ride:camper",
    isValid: true,
    getDynamicProperty: (key: string) =>
      key === DECK_SEATS_PROPERTY
        ? JSON.stringify(["wheel", "passenger-seat"])
        : undefined,
  };
  game.getEntity.mockReturnValue(vehicle);
  const wheel = {
    id: "wheel",
    typeId: DECK_SEAT_TYPE,
    isValid: true,
    getDynamicProperty: (key: string) =>
      key === DECK_SEAT_OF_PROPERTY ? "car" : undefined,
  };
  const player = {
    id: "driver",
    location: { x: 0.5, y: 65, z: 0.5 },
    dimension: { id: asDimensionId("overworld") },
    getComponent: () => ({ entityRidingOn: wheel }),
  } as unknown as Player;
  expect(target.claimsItemUse(player)).toBe(true);
  expect(target.claimsBlockPress(player, {} as Block)).toBe(true);
  target.switchFor(player);
  expect(world.headlights.get("car")).toBe(true);

  const passengerSeat = { ...wheel, id: "passenger-seat" };
  const passenger = {
    ...player,
    id: "passenger",
    getComponent: () => ({ entityRidingOn: passengerSeat }),
  } as unknown as Player;
  target.switchFor(passenger);
  expect(world.headlights.get("car")).toBe(true);
  expect(stillTick(car, 22, "driver").stepCommands).toContainEqual({
    type: "setProperty",
    name: "ceiling_lights",
    value: true,
  });
});
