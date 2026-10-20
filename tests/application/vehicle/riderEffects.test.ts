import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { RiderEffects } from "../../../src/application/vehicle/riderEffects";
import { asPlayerId, type PlayerId } from "../../../src/domain/shared/ids";
import type { ChaseCamera } from "../../../src/domain/vehicle/profile";
import { SPEC } from "../../../src/domain/vehicle/spec";
import { FakeWorld } from "./fakes";

const logger = () => {
  const lines: string[] = [];
  return { lines, warn: (m: string) => lines.push(m) };
};

const setup = () => {
  const world = new FakeWorld();
  const log = logger();
  return { world, log, riders: new RiderEffects(world, log) };
};

describe("RiderEffects cameras", () => {
  it("switches to third person once and back to the own view", () => {
    const { world, riders } = setup();
    const near = new Map<PlayerId, ChaseCamera>([[asPlayerId("p"), "near"]]);
    riders.syncCameras(near);
    expect(world.calls).toEqual(["camera:p:third"]);
    riders.syncCameras(near);
    expect(world.calls).toEqual(["camera:p:third"]);
    riders.syncCameras(new Map<PlayerId, ChaseCamera>());
    expect(world.calls).toEqual(["camera:p:third", "camera:p:own"]);
  });

  it("switches from near to far", () => {
    const { world, riders } = setup();
    riders.syncCameras(
      new Map<PlayerId, ChaseCamera>([[asPlayerId("p"), "near"]]),
    );
    riders.syncCameras(
      new Map<PlayerId, ChaseCamera>([[asPlayerId("p"), "far"]]),
    );
    expect(world.calls).toEqual(["camera:p:third", "camera:p:far"]);
  });

  it("logs a failing camera switch once until it succeeds", () => {
    const { world, log, riders } = setup();
    const near = new Map<PlayerId, ChaseCamera>([[asPlayerId("p"), "near"]]);
    const cameraLines = () => log.lines.filter((l) => l.includes("camera p"));
    world.failCameraOn = "p";
    riders.syncCameras(near);
    riders.syncCameras(near);
    riders.syncCameras(near);
    expect(cameraLines()).toHaveLength(1);
    expect(world.calls).toEqual([]);
    world.failCameraOn = undefined;
    riders.syncCameras(near);
    expect(world.calls).toEqual(["camera:p:third"]);
    world.failCameraOn = "p";
    riders.syncCameras(new Map<PlayerId, ChaseCamera>());
    expect(cameraLines()).toHaveLength(2);
  });
});

describe("RiderEffects water breathing", () => {
  it("refreshes breathing only on interval ticks", () => {
    fc.assert(
      fc.property(fc.nat({ max: 10_000 }), (tick) => {
        const { world, log, riders } = setup();
        riders.refreshWaterBreathing(
          new Set([asPlayerId("a"), asPlayerId("b")]),
          tick,
        );
        expect(world.calls).toEqual(
          tick % SPEC.waterBreathingInterval === 0
            ? [
                `breathing:a:${SPEC.waterBreathingTicks}`,
                `breathing:b:${SPEC.waterBreathingTicks}`,
              ]
            : [],
        );
        expect(log.lines).toEqual([]);
      }),
    );
  });

  it("one failing rider does not stop the others", () => {
    const { world, log, riders } = setup();
    world.failBreathingOn = "bad";
    riders.refreshWaterBreathing(
      new Set([asPlayerId("bad"), asPlayerId("good")]),
      0,
    );
    expect(world.calls).toEqual([`breathing:good:${SPEC.waterBreathingTicks}`]);
    expect(log.lines).toEqual(["breathing bad: Error: breathing"]);
  });
});
