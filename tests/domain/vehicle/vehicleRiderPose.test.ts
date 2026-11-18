import { expect, it } from "vitest";
import { asVehicleId } from "../../../src/domain/shared/ids";
import {
  createVehicle,
  profileOf,
} from "../../../src/domain/vehicle/kinds/index";
import { SCOOTER_SPEC } from "../../../src/domain/vehicle/kinds/scooter/spec";
import { riderPoseOf } from "../../../src/domain/vehicle/riderPose";
import { engineStep } from "../../support/engineModel";
import { riderView } from "../../support/riders";

it("matches the scooter pose table to its lean levels", () => {
  const tables = profileOf("scooter").riderPose?.seats;
  expect(tables).toHaveLength(2);
  expect(tables?.[0]).toBe(tables?.[1]);
  for (const table of tables ?? []) {
    expect(table.lean.length).toBe(2 * SCOOTER_SPEC.leanLevels);
  }
});
it("drives both scooter riders through grip, stepped lean, departure and resync", () => {
  const vehicle = createVehicle("scooter", asVehicleId("scooter"), 0);
  const table = profileOf("scooter").riderPose;
  const seatTable = table?.seats[0];
  if (!table || !seatTable) throw new Error("scooter pose table required");
  let previous = "";
  let changes = 0;
  let angle = 0;
  let body = { pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 } };
  for (let tick = 1; tick < 100; tick++) {
    const raw = { moveX: tick > 50 ? 1 : 0, moveY: 1, jump: false };
    const riders = [
      riderView("driver", { raw }),
      riderView("passenger", { slot: 1 }),
    ];
    const out = vehicle.tick({
      tick,
      riders,
      deckSeatInputs: [],
      deckSeatRiders: [riderView("deck").id],
      location: { x: 0, y: 64, z: 0 },
      velocity: { ...body.vel, y: 0 },
      onGround: true,
      solidAt: () => false,
      waterAt: () => false,
      blockTypes: () => [],
      targets: () => [],
    });
    const lean = out.stepCommands.find(
      (c) => c.type === "setProperty" && c.name === "lean",
    );
    body = engineStep(body, out.impulse, { mu: 0.688 }).body;
    if (lean?.type === "setProperty" && typeof lean.value === "number")
      angle = lean.value;
    const pose = riderPoseOf(
      seatTable,
      Math.round((angle / SCOOTER_SPEC.maxLean) * SCOOTER_SPEC.leanLevels),
    );
    if (tick <= 50) expect(pose).toBe("scooter_grip");
    const expected = previous !== pose || tick % table.refreshTicks === 0;
    expect(out.riderPoses).toEqual(
      expected
        ? riders.map((r) => ({ type: "play", playerId: r.id, pose }))
        : [],
    );
    if (previous !== pose) changes++;
    previous = pose;
  }
  expect(changes).toBeGreaterThan(1);
  const input = {
    tick: 101,
    riders: [riderView("driver")],
    deckSeatInputs: [],
    location: { x: 0, y: 64, z: 0 },
    velocity: { x: 0, y: 0, z: 0 },
    onGround: true,
    solidAt: () => false,
    waterAt: () => false,
    blockTypes: () => [],
    targets: () => [],
  };
  expect(vehicle.tick(input).riderPoses).toContainEqual({
    type: "clear",
    playerId: riderView("passenger").id,
  });
  vehicle.resync();
  expect(vehicle.tick({ ...input, tick: 102 }).riderPoses).toContainEqual(
    expect.objectContaining({ type: "play", playerId: riderView("driver").id }),
  );
  expect(
    createVehicle("suv", asVehicleId("suv"), 0).tick(input).riderPoses,
  ).toEqual([]);
});
