import type { Entity } from "@minecraft/server";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import { asVehicleId, type VehicleId } from "../../../../src/domain/shared/ids";
import type { HoldPose } from "../../../../src/domain/vehicle/dock/floor";
import { VehicleReleaser } from "../../../../src/infrastructure/vehicle/bedrock/vehicleReleaser";

const STEPS = ["shine", "lay", "keep", "stand", "fill"] as const;
type Step = (typeof STEPS)[number];

function stubs(throwing: readonly Step[] = []) {
  const step = (name: Step) =>
    vi.fn(() => {
      if (throwing.includes(name)) throw new Error(name);
    });
  const shine = step("shine");
  const lay = step("lay");
  const keep = step("keep");
  const stand = step("stand");
  const fill = step("fill");
  const holds = new Map<VehicleId, HoldPose>([
    [asVehicleId("v"), { x: 0, y: 64, z: 0, yaw: 0 }],
  ]);
  const releaser = new VehicleReleaser(
    { shine },
    { lay },
    { keep },
    { keep: stand },
    holds,
    { release: fill },
  );
  return { shine, lay, keep, stand, fill, holds, releaser };
}

describe("VehicleReleaser", () => {
  it("runs every release step in order and rethrows the first failure", () => {
    fc.assert(
      fc.property(fc.subarray([...STEPS]), (throwing) => {
        const { shine, lay, keep, stand, fill, holds, releaser } =
          stubs(throwing);
        let thrown: unknown;
        try {
          releaser.release(asVehicleId("v"), undefined);
        } catch (e) {
          thrown = e;
        }
        expect(shine.mock.calls).toEqual([["v", undefined, []]]);
        expect(lay.mock.calls).toEqual([["v", undefined, []]]);
        expect(keep.mock.calls).toEqual([["v", undefined, [], 0]]);
        expect(stand.mock.calls).toEqual([["v", undefined, undefined]]);
        expect(fill.mock.calls).toEqual([["v"]]);
        const order = [shine, lay, keep, stand, fill].map(
          (stub) => stub.mock.invocationCallOrder[0] ?? 0,
        );
        expect(order).toEqual([...order].sort((a, b) => a - b));
        expect(holds.has(asVehicleId("v"))).toBe(false);
        const first = STEPS.find((name) => throwing.includes(name));
        if (first === undefined) expect(thrown).toBeUndefined();
        else expect((thrown as Error).message).toBe(first);
      }),
    );
  });

  it("passes the entity to every step", () => {
    const { shine, lay, keep, stand, releaser } = stubs();
    const vehicle = { id: "v" } as unknown as Entity;
    releaser.release(asVehicleId("v"), vehicle);
    expect(shine).toHaveBeenCalledWith("v", vehicle, []);
    expect(lay).toHaveBeenCalledWith("v", vehicle, []);
    expect(keep).toHaveBeenCalledWith("v", vehicle, [], 0);
    expect(stand).toHaveBeenCalledWith("v", vehicle, undefined);
  });
});
