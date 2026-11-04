import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { PlaceRoofTent } from "../../../src/application/camp/placeRoofTent";
import { asRoofTentId } from "../../../src/domain/camp/ids";
import { ROOF_TENT_SPEC } from "../../../src/domain/camp/spec";
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
          expect(world.giveItem).not.toHaveBeenCalled();
          expect(world.spawn).not.toHaveBeenCalled();
          expect(world.remove).not.toHaveBeenCalled();
          expect(world.showMessage).not.toHaveBeenCalled();
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
    expect(world.showMessage).not.toHaveBeenCalled();
    expect(world.consumeItem).not.toHaveBeenCalled();
    expect(world.spawn).not.toHaveBeenCalled();
  });

  it("uses the host's rotated left/forward anchor and consumes only in Survival", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -720, max: 720 }),
        fc.boolean(),
        (yaw, creative) => {
          const world = new FakeRoofTentWorld();
          world.isCreative.mockReturnValue(creative);
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
          expect(world.consumeItem).toHaveBeenCalledTimes(creative ? 0 : 1);
          if (!creative)
            expect(world.consumeItem).toHaveBeenCalledWith(PLAYER, cmd.slot);
        },
      ),
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
      expect(world.showMessage).toHaveBeenCalledWith(
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
          expect(world.showMessage).toHaveBeenCalledWith(PLAYER, "host_in_use");
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
        fc.boolean(),
        (x, y, z, clear) => {
          const world = new FakeRoofTentWorld();
          const lookup = vi.fn(() => PRESENT);
          world.groundFree.mockReturnValue(clear);
          expect(
            new PlaceRoofTent(world, lookup).execute({
              ...cmd,
              target: { clicked: { x, y, z } },
              yaw: 100,
            }),
          ).toBe(clear);
          expect(lookup).not.toHaveBeenCalled();
          expect(world.groundFree).toHaveBeenCalledWith(DIMENSION, { x, y, z });
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
            expect(world.consumeItem).not.toHaveBeenCalled();
            expect(world.showMessage).toHaveBeenCalledWith(PLAYER, "blocked");
          }
        },
      ),
    );
  });

  it("refunds only a taken item when spawning fails", () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), (creative, hasPlayer) => {
        const world = new FakeRoofTentWorld();
        world.isCreative.mockReturnValue(creative);
        world.spawn.mockReturnValue(undefined);
        const { playerId: _, ...withoutPlayer } = cmd;
        expect(
          new PlaceRoofTent(world, () => PRESENT).execute(
            hasPlayer ? cmd : withoutPlayer,
          ),
        ).toBe(false);
        expect(world.giveItem).toHaveBeenCalledTimes(
          hasPlayer && !creative ? 1 : 0,
        );
        expect(world.consumeItem).toHaveBeenCalledTimes(
          hasPlayer && !creative ? 1 : 0,
        );
      }),
    );
  });

  it("does not spawn if the selected item was moved and ignores unrelated hosts", () => {
    const world = new FakeRoofTentWorld();
    world.hosts.set(asRoofTentId("ground"), { kind: "ground" });
    world.hosts.set(asRoofTentId("other"), {
      kind: "vehicle",
      id: asVehicleId("another"),
    });
    world.consumeItem.mockReturnValue(false);
    const place = new PlaceRoofTent(world, () => PRESENT);
    expect(place.execute(cmd)).toBe(false);
    expect(world.spawn).not.toHaveBeenCalled();
    expect(world.giveItem).not.toHaveBeenCalled();
    world.consumeItem.mockReturnValue(true);
    expect(place.execute(cmd)).toBe(true);
  });
});
