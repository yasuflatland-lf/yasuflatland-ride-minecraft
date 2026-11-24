import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { PlaceRoofTent } from "../../../src/application/camp/placeRoofTent";
import { asRoofTentId } from "../../../src/domain/camp/ids";
import { ROOF_TENT_SPEC } from "../../../src/domain/camp/spec";
import { sameCell } from "../../../src/domain/shared/cells";
import { asVehicleId } from "../../../src/domain/shared/ids";
import {
  DIMENSION,
  FakeRoofTentWorld,
  PLAYER,
  PRESENT,
} from "./fakeRoofTentWorld";

const cmd = {
  playerId: PLAYER,
  dimensionId: DIMENSION,
  target: { entityId: asVehicleId("host") },
  yaw: 42,
  slot: 3,
};

describe("PlaceRoofTent", () => {
  it("reads placement refusals without changing the world or showing messages", () => {
    fc.assert(
      fc.property(
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (roofTaken, driverPresent, moving) => {
          const world = new FakeRoofTentWorld();
          world.hosts.set(asRoofTentId("ground"), { kind: "ground" });
          world.hosts.set(asRoofTentId("other"), {
            kind: "vehicle",
            id: asVehicleId("another"),
          });
          if (roofTaken)
            world.hosts.set(asRoofTentId("existing"), {
              kind: "vehicle",
              id: asVehicleId("host"),
            });
          const hosts = [...world.hosts];
          const place = new PlaceRoofTent(world, () => ({
            ...PRESENT,
            driverPresent,
            moving,
          }));
          expect(place.refusalFor(asVehicleId("host"))).toBe(
            driverPresent || moving
              ? "host_in_use"
              : roofTaken
                ? "roof_taken"
                : undefined,
          );
          expect(world.consumeItem).not.toHaveBeenCalled();
          expect(world.refund).not.toHaveBeenCalled();
          expect(world.spawn).not.toHaveBeenCalled();
          expect(world.remove).not.toHaveBeenCalled();
          expect(world.showRefusal).not.toHaveBeenCalled();
          expect([...world.hosts]).toEqual(hosts);
        },
      ),
    );
  });

  it("reports unsupported hosts and leaves absent hosts without a refusal", () => {
    const world = new FakeRoofTentWorld();
    expect(
      new PlaceRoofTent(world, () => ({
        ...PRESENT,
        mount: undefined,
      })).refusalFor(asVehicleId("host")),
    ).toBe("unsupported_vehicle");
    for (const status of ["unknown", "removed"] as const) {
      expect(
        new PlaceRoofTent(world, () => ({ status })).refusalFor(
          asVehicleId("host"),
        ),
      ).toBeUndefined();
    }
    expect(world.showRefusal).not.toHaveBeenCalled();
    expect(world.consumeItem).not.toHaveBeenCalled();
    expect(world.spawn).not.toHaveBeenCalled();
  });

  it("uses the host's rotated left/forward anchor", () => {
    fc.assert(
      fc.property(fc.integer({ min: -720, max: 720 }), (yaw) => {
        const world = new FakeRoofTentWorld();
        expect(
          new PlaceRoofTent(world, () => ({ ...PRESENT, yaw })).execute(cmd),
        ).toBe(true);
        const spawn = world.spawn.mock.calls[0];
        expect(spawn).toBeDefined();
        if (!spawn) return;
        const rad = (yaw * Math.PI) / 180;
        expect(spawn[1].location.x).toBeCloseTo(
          10 + Math.cos(rad) - 3 * Math.sin(rad),
        );
        expect(spawn[1].location.z).toBeCloseTo(
          30 + Math.sin(rad) + 3 * Math.cos(rad),
        );
        expect(spawn[1].location.y).toBe(22);
        expect(spawn[1].yaw).toBe(yaw);
        expect(spawn[0].host).toEqual({
          kind: "vehicle",
          id: asVehicleId("host"),
        });
        expect(spawn[0].ladder).toBe(true);
        expect(spawn.slice(2)).toEqual([PLAYER, ROOF_TENT_SPEC.defaultPaint]);
      }),
    );
  });

  it("keeps items for unavailable, unsupported, or occupied hosts", () => {
    for (const status of ["unknown", "removed"] as const) {
      const world = new FakeRoofTentWorld();
      expect(new PlaceRoofTent(world, () => ({ status })).execute(cmd)).toBe(
        false,
      );
      expect(world.consumeItem).not.toHaveBeenCalled();
      expect(world.spawn).not.toHaveBeenCalled();
    }
    for (const taken of [false, true]) {
      const world = new FakeRoofTentWorld();
      if (taken)
        world.hosts.set(asRoofTentId("existing"), {
          kind: "vehicle",
          id: asVehicleId("host"),
        });
      const lookup = () => ({
        ...PRESENT,
        mount: taken ? PRESENT.mount : undefined,
      });
      expect(new PlaceRoofTent(world, lookup).execute(cmd)).toBe(false);
      expect(world.showRefusal).toHaveBeenCalledWith(
        PLAYER,
        taken ? "roof_taken" : "unsupported_vehicle",
      );
      expect(world.consumeItem).not.toHaveBeenCalled();
      expect(world.spawn).not.toHaveBeenCalled();
    }
  });

  it("refuses a driven or moving host and keeps the item", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (driverPresent, moving) => {
        const world = new FakeRoofTentWorld();
        const placed = new PlaceRoofTent(world, () => ({
          ...PRESENT,
          driverPresent,
          moving,
        })).execute(cmd);
        expect(placed).toBe(!driverPresent && !moving);
        if (driverPresent || moving) {
          expect(world.showRefusal).toHaveBeenCalledWith(PLAYER, "host_in_use");
          expect(world.consumeItem).not.toHaveBeenCalled();
          expect(world.spawn).not.toHaveBeenCalled();
        }
      }),
    );
  });

  it("surveys ground and places at its cell top with snapped facing", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -100, max: 100 }),
        fc.integer({ min: -100, max: 100 }),
        fc.integer({ min: -100, max: 100 }),
        fc.constantFrom("none", "support", "block", "vehicle", "camp", "near"),
        fc.record({
          x: fc.integer({ min: -1, max: 1 }),
          y: fc.integer({ min: 1, max: 2 }),
          z: fc.integer({ min: -1, max: 1 }),
        }),
        (x, y, z, obstacle, offset) => {
          const world = new FakeRoofTentWorld();
          const lookup = vi.fn(() => PRESENT);
          const blocked = { x: x + offset.x, y: y + offset.y, z: z + offset.z };
          world.blockAt.mockImplementation((_dimension, cell) => {
            if (sameCell(cell, { x, y, z }))
              return {
                typeId:
                  obstacle === "support" ? "minecraft:fern" : "minecraft:stone",
                isAir: false,
                isLiquid: false,
              };
            const isAir = !(obstacle === "block" && sameCell(cell, blocked));
            return {
              typeId: isAir ? "minecraft:air" : "minecraft:stone",
              isAir,
              isLiquid: false,
            };
          });
          world.isVehicleSpace.mockImplementation(
            (_dimension, cell) =>
              obstacle === "vehicle" && sameCell(cell, blocked),
          );
          world.isCampSpace.mockImplementation(
            (_dimension, cell) =>
              obstacle === "camp" && sameCell(cell, blocked),
          );
          world.hasRoofTentNear.mockReturnValue(obstacle === "near");
          const clear = obstacle === "none";
          expect(
            new PlaceRoofTent(world, lookup).execute({
              ...cmd,
              target: { clicked: { x, y, z } },
              yaw: 100,
            }),
          ).toBe(clear);
          expect(lookup).not.toHaveBeenCalled();
          expect(world.blockAt).toHaveBeenCalledWith(DIMENSION, { x, y, z });
          if (clear || obstacle === "near")
            expect(world.hasRoofTentNear).toHaveBeenCalledWith(DIMENSION, {
              x: x + 0.5,
              y: y + 1,
              z: z + 0.5,
            });
          if (clear)
            expect(world.spawn).toHaveBeenCalledWith(
              { host: { kind: "ground" }, facing: 90, ladder: false },
              {
                dimensionId: DIMENSION,
                location: { x: x + 0.5, y: y + 1, z: z + 0.5 },
                yaw: 90,
              },
              PLAYER,
              ROOF_TENT_SPEC.defaultPaint,
            );
          else {
            expect(world.spawn).not.toHaveBeenCalled();
            expect(world.consumeItem).not.toHaveBeenCalled();
            expect(world.showRefusal).toHaveBeenCalledWith(PLAYER, "blocked");
          }
        },
      ),
    );
  });

  it("returns the roof tent item to the placing player when spawning fails", () => {
    const world = new FakeRoofTentWorld();
    world.spawn.mockReturnValue(undefined);
    expect(new PlaceRoofTent(world, () => PRESENT).execute(cmd)).toBe(false);
    expect(world.consumeItem).toHaveBeenCalledExactlyOnceWith(PLAYER, cmd.slot);
    expect(world.refund).toHaveBeenCalledExactlyOnceWith(PLAYER, cmd.slot);
  });

  it("ignores unrelated hosts when placing a roof tent", () => {
    const world = new FakeRoofTentWorld();
    world.hosts.set(asRoofTentId("ground"), { kind: "ground" });
    world.hosts.set(asRoofTentId("other"), {
      kind: "vehicle",
      id: asVehicleId("another"),
    });
    expect(new PlaceRoofTent(world, () => PRESENT).execute(cmd)).toBe(true);
  });
});
