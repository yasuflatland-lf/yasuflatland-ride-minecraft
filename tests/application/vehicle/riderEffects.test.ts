import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";
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
  it("reconciles each rider's camera with successful changes and warns once until success", () => {
    const players = ["a", "b", "c"].map(asPlayerId);
    const camera = fc.option(
      fc.constantFrom<ChaseCamera>("near", "mid", "far"),
      {
        nil: undefined,
      },
    );
    const tick = fc.record({
      wanted: fc.tuple(camera, camera, camera),
      failing: fc.option(fc.constantFrom(...players), { nil: undefined }),
    });

    fc.assert(
      fc.property(fc.array(tick, { minLength: 12, maxLength: 36 }), (ticks) => {
        const { world, log, riders } = setup();
        const setCamera = vi.spyOn(world, "setChaseCamera");
        const model = players.map((id) => ({
          id,
          applied: undefined as ChaseCamera | undefined,
          warned: false,
        }));

        for (const { wanted, failing } of ticks) {
          const desired = new Map<PlayerId, ChaseCamera>();
          const calls: [PlayerId, ChaseCamera | undefined][] = [];
          const warnings: string[] = [];
          for (const [index, state] of model.entries()) {
            const next = wanted[index];
            if (next !== undefined) desired.set(state.id, next);
            if (next === state.applied) continue;

            calls.push([state.id, next]);
            if (state.id === failing) {
              if (!state.warned)
                warnings.push(`camera ${state.id}: Error: camera`);
              state.warned = true;
            } else {
              state.applied = next;
              state.warned = false;
            }
          }

          setCamera.mockClear();
          log.lines.length = 0;
          world.failCameraOn = failing;
          riders.syncCameras(desired);

          expect([...setCamera.mock.calls].sort()).toEqual(calls.sort());
          expect(log.lines).toEqual(warnings);
          for (const { id, applied } of model)
            expect(riders.isThirdPerson(id)).toBe(applied !== undefined);
          expect(riders.isThirdPerson(asPlayerId("absent"))).toBe(false);
        }
      }),
    );
  });
});

describe("RiderEffects water breathing", () => {
  it("refreshes breathing only on interval ticks and isolates a failing rider", () => {
    const players = ["a", "b", "c"].map(asPlayerId);
    fc.assert(
      fc.property(
        fc.nat({ max: 10_000 }),
        fc.integer({ min: 0, max: SPEC.waterBreathingInterval - 1 }),
        fc.option(fc.constantFrom(...players), { nil: undefined }),
        (interval, offset, failing) => {
          const { world, log, riders } = setup();
          world.failBreathingOn = failing;
          riders.refreshWaterBreathing(
            new Set(players),
            interval * SPEC.waterBreathingInterval + offset,
          );
          expect(world.calls).toEqual(
            offset === 0
              ? players
                  .filter((id) => id !== failing)
                  .map((id) => `breathing:${id}:${SPEC.waterBreathingTicks}`)
              : [],
          );
          expect(log.lines).toEqual(
            offset === 0 && failing !== undefined
              ? [`breathing ${failing}: Error: breathing`]
              : [],
          );
        },
      ),
    );
  });
});

describe("RiderEffects fire protection", () => {
  it("protects every rider and isolates a failing one", () => {
    const { world, log, riders } = setup();
    world.failFireProtectionOn = "bad";
    riders.protectFromFire(new Set([asPlayerId("bad"), asPlayerId("good")]));
    expect(world.calls).toEqual(["fire:good"]);
    expect(log.lines).toEqual(["fire protection bad: Error: fire"]);
  });
});
