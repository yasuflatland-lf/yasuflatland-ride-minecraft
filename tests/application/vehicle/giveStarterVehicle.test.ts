import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { GiveStarterVehicle } from "../../../src/application/vehicle/giveStarterVehicle";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { STARTER_KINDS } from "../../../src/domain/vehicle/placement/starter";
import { FakeWorld } from "./fakes";

function joinWithoutStarters(world: FakeWorld, id: string) {
  for (const k of STARTER_KINDS) world.starters.set(`${id}:${k}`, false);
}

describe("GiveStarterVehicle (ADR 0023)", () => {
  it("gives each player one item of each starter kind, however many times they join", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("a", "b", "c"), { maxLength: 20 }),
        (joins) => {
          const world = new FakeWorld();
          for (const id of joins) joinWithoutStarters(world, id);
          const give = new GiveStarterVehicle(world);
          for (const id of joins) give.execute(asPlayerId(id));
          const players = [...new Set(joins)];
          expect(world.calls.filter((c) => c.startsWith("give:"))).toEqual(
            players.flatMap((id) =>
              STARTER_KINDS.map((k) => `give:${id}:${k}`),
            ),
          );
          for (const id of players) {
            for (const k of STARTER_KINDS)
              expect(world.starters.get(`${id}:${k}`)).toBe(true);
          }
        },
      ),
    );
  });

  it("gives exactly the starter kinds the player has not received yet", () => {
    fc.assert(
      fc.property(fc.subarray([...STARTER_KINDS]), (received) => {
        const world = new FakeWorld();
        joinWithoutStarters(world, "p");
        for (const k of received) world.starters.set(`p:${k}`, true);
        expect(new GiveStarterVehicle(world).execute(asPlayerId("p"))).toBe(
          received.length < STARTER_KINDS.length,
        );
        expect(world.calls.filter((c) => c.startsWith("give:"))).toEqual(
          STARTER_KINDS.filter((k) => !received.includes(k)).map(
            (k) => `give:p:${k}`,
          ),
        );
      }),
    );
  });

  it("marks each kind only after giving its item", () => {
    const world = new FakeWorld();
    joinWithoutStarters(world, "p");
    expect(new GiveStarterVehicle(world).execute(asPlayerId("p"))).toBe(true);
    expect(world.calls).toEqual(
      STARTER_KINDS.flatMap((k) => [`give:p:${k}`, `mark:p:${k}`]),
    );
  });

  it("does nothing for a player who already received every kind, or who left", () => {
    const world = new FakeWorld();
    for (const k of STARTER_KINDS) world.starters.set(`p:${k}`, true);
    const give = new GiveStarterVehicle(world);
    expect(give.execute(asPlayerId("p"))).toBe(false);
    expect(give.execute(asPlayerId("gone"))).toBe(false);
    expect(world.calls).toEqual([]);
  });
});

it("gives a player who already got their SUV only the bulldozer", () => {
  const world = new FakeWorld();
  world.starters.set("p:suv", true);
  world.starters.set("p:bulldozer", false);
  new GiveStarterVehicle(world).execute(asPlayerId("p"));
  expect(world.calls).toEqual(["give:p:bulldozer", "mark:p:bulldozer"]);
});
