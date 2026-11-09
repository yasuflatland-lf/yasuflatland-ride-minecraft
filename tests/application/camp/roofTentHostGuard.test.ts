import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { RoofTentHostGuard } from "../../../src/application/camp/roofTentHostGuard";
import type { VehicleHostState } from "../../../src/application/shared/ports/vehicleHost";
import { asRoofTentId } from "../../../src/domain/camp/ids";
import { asTableId } from "../../../src/domain/camp/table";
import { asVehicleId } from "../../../src/domain/shared/ids";
import { FakeRoofTentWorld, PLAYER, PRESENT } from "./fakeRoofTentWorld";

describe("RoofTentHostGuard", () => {
  it("removes known departed hosts in lifecycle order and keeps unknown hosts", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("present", "unknown", "removed"),
        fc.boolean(),
        fc.boolean(),
        fc.boolean(),
        (status, driverPresent, moving, owned) => {
          const world = new FakeRoofTentWorld();
          world.hosts.set(asRoofTentId("tent"), {
            kind: "vehicle",
            id: asVehicleId("host"),
          });
          world.ownerOf.mockReturnValue(owned ? PLAYER : undefined);
          const state: VehicleHostState =
            status === "present"
              ? { ...PRESENT, driverPresent, moving }
              : { status };
          const lookup = vi.fn(() => state);
          const guard = new RoofTentHostGuard(
            world,
            lookup,
            { eject: (id) => world.calls.push(`eject:${id}`) },
            {
              removed: (id, owner) =>
                world.calls.push(`removed:${id}:${owner ?? "drop"}`),
            },
          );
          guard.check();
          expect(lookup).toHaveBeenCalledExactlyOnceWith("host");
          const remove =
            status === "removed" ||
            (status === "present" && (driverPresent || moving));
          const owner = owned ? PLAYER : "drop";
          expect(world.calls).toEqual(
            remove
              ? [
                  "eject:tent",
                  `return:tent:${owner}`,
                  "remove:tent",
                  `removed:tent:${owner}`,
                ]
              : [],
          );
        },
      ),
    );
  });

  it("checks every loaded vehicle tent and skips other host kinds", () => {
    const world = new FakeRoofTentWorld();
    world.hosts.set(asRoofTentId("ground"), { kind: "ground" });
    world.hosts.set(asRoofTentId("table"), {
      kind: "top",
      hostType: "camp_table",
      id: asTableId("table"),
      at: { x: 0, z: 0 },
    });
    world.hosts.set(asRoofTentId("first"), {
      kind: "vehicle",
      id: asVehicleId("a"),
    });
    world.hosts.set(asRoofTentId("second"), {
      kind: "vehicle",
      id: asVehicleId("b"),
    });
    const lookup = vi.fn(() => ({ status: "removed" as const }));
    new RoofTentHostGuard(
      world,
      lookup,
      { eject: vi.fn() },
      { removed: vi.fn() },
    ).check();
    expect(lookup.mock.calls).toEqual([["a"], ["b"]]);
    expect(world.loaded()).toEqual(["ground", "table"]);
  });
});
