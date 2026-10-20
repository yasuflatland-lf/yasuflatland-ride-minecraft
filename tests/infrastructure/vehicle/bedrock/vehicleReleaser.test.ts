import type { Entity } from "@minecraft/server";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
import type { HoldPose } from "../../../../src/domain/vehicle/floor";
import { VehicleReleaser } from "../../../../src/infrastructure/vehicle/bedrock/vehicleReleaser";

const STEPS = ["shine", "lay", "keep"] as const;
type Step = (typeof STEPS)[number];

function stubs(throwing: readonly Step[] = []) {
  const step = (name: Step) =>
    vi.fn(() => {
      if (throwing.includes(name)) throw new Error(name);
    });
  const shine = step("shine");
  const lay = step("lay");
  const keep = step("keep");
  const holds = new Map<string, HoldPose>([
    ["v", { x: 0, y: 64, z: 0, yaw: 0 }],
  ]);
  const releaser = new VehicleReleaser({ shine }, { lay }, { keep }, holds);
  return { shine, lay, keep, holds, releaser };
}

describe("VehicleReleaser", () => {
  it("runs every release step in order and rethrows the first failure", () => {
    fc.assert(
      fc.property(fc.subarray([...STEPS]), (throwing) => {
        const { shine, lay, keep, holds, releaser } = stubs(throwing);
        let thrown: unknown;
        try {
          releaser.release("v", undefined);
        } catch (e) {
          thrown = e;
        }
        expect(shine.mock.calls).toEqual([["v", undefined, []]]);
        expect(lay.mock.calls).toEqual([["v", undefined, []]]);
        expect(keep.mock.calls).toEqual([["v", undefined, [], 0]]);
        const order = [shine, lay, keep].map(
          (stub) => stub.mock.invocationCallOrder[0] ?? 0,
        );
        expect(order).toEqual([...order].sort((a, b) => a - b));
        expect(holds.has("v")).toBe(false);
        const first = STEPS.find((name) => throwing.includes(name));
        if (first === undefined) expect(thrown).toBeUndefined();
        else expect((thrown as Error).message).toBe(first);
      }),
    );
  });

  it("passes the entity to every step", () => {
    const { shine, lay, keep, releaser } = stubs();
    const vehicle = { id: "v" } as unknown as Entity;
    releaser.release("v", vehicle);
    expect(shine).toHaveBeenCalledWith("v", vehicle, []);
    expect(lay).toHaveBeenCalledWith("v", vehicle, []);
    expect(keep).toHaveBeenCalledWith("v", vehicle, [], 0);
  });
});
