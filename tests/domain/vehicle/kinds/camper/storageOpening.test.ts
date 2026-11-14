import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  type DooredStorage,
  openPlateAt,
  StorageDoors,
  storageDoors,
} from "../../../../../src/domain/vehicle/kinds/camper/dooredStorage";
import { DOOR_STEPS } from "../../../../../src/domain/vehicle/kinds/camper/doorSwing";
import { FRIDGE } from "../../../../../src/domain/vehicle/kinds/camper/furniture";
import { localCellAt } from "../../../../../src/domain/vehicle/kinds/camper/parkPose";
import {
  storagePlateCells,
  storagePlateChecks,
  storagePressTarget,
} from "../../../../../src/domain/vehicle/kinds/camper/storagePlates";

const unit: DooredStorage = {
  ...FRIDGE,
  doors: [
    {
      id: "hinged",
      compartment: { x: -1, z: 1, layer: 1 },
      opening: {
        kind: "hinged",
        hinge: 1,
        plate: { x: 0, z: 1, layer: 1 },
      },
      slots: [],
    },
    {
      id: "sliding",
      compartment: { x: -1, z: -1, layer: 1 },
      opening: { kind: "sliding" },
      slots: [],
    },
  ],
};
const doors = storageDoors([unit]);
const ids = doors.map(({ id }) => id);
const id = fc.constantFrom(...ids);
const pose = fc.record({
  x: fc.integer({ min: -1000, max: 1000 }),
  y: fc.integer({ min: -60, max: 300 }),
  z: fc.integer({ min: -1000, max: 1000 }),
  yaw: fc.constantFrom(0, 90, 180, -90),
});

describe("storage opening kinds", () => {
  it("keeps opening progress within bounds through arbitrary presses and ticks", () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(fc.constant("tick"), id), { maxLength: 200 }),
        (actions) => {
          const state = new StorageDoors(doors, () => 0, true);
          let tick = 0;
          for (const action of actions) {
            if (action !== "tick") {
              state.press(action, false, tick, () => undefined);
              continue;
            }
            state.resync();
            const progress = new Map<string, number>();
            state.swingCommands((name, value) => {
              progress.set(name, value * DOOR_STEPS);
              return { type: "setProperty", name, value };
            });
            expect(progress.size).toBe(doors.length);
            for (const step of progress.values()) {
              expect(step).toBeGreaterThanOrEqual(0);
              expect(step).toBeLessThanOrEqual(DOOR_STEPS);
              expect(Number.isInteger(step)).toBe(true);
            }
            tick++;
          }
        },
      ),
    );
  });

  it("toggles either kind on every tap outside its debounce window", () => {
    fc.assert(
      fc.property(
        fc.array(fc.tuple(id, fc.integer({ min: DOOR_STEPS, max: 100 }))),
        (taps) => {
          const state = new StorageDoors(doors, () => 0, true);
          const open = new Set<string>();
          let tick = 0;
          for (const [target, elapsed] of taps) {
            tick += elapsed;
            expect(state.press(target, false, tick, () => undefined)).toEqual({
              kind: "door",
            });
            if (open.has(target)) open.delete(target);
            else open.add(target);
            expect(state.open()).toEqual(open);
          }
        },
      ),
    );
  });

  it("closes every kind at departure from any restored opening progress", () => {
    fc.assert(
      fc.property(
        fc.tuple(
          fc.integer({ min: 0, max: DOOR_STEPS }),
          fc.integer({ min: 0, max: DOOR_STEPS }),
        ),
        (saved) => {
          const state = new StorageDoors(
            doors,
            (name) => (saved[ids.indexOf(name)] ?? 0) / DOOR_STEPS,
            true,
          );
          state.shutAll();
          expect(state.open().size).toBe(0);
          expect(state.shown().size).toBe(0);
          const progress: number[] = [];
          state.swingCommands((name, value) => {
            progress.push(value);
            return { type: "setProperty", name, value };
          });
          expect(progress).toEqual(doors.map(() => 0));
        },
      ),
    );
  });

  it("never lays, checks, finds or routes a plate for a sliding opening", () => {
    fc.assert(
      fc.property(pose, fc.subarray(ids), fc.boolean(), (p, opened, lights) => {
        const open = new Set(opened);
        const sliding = doors.filter((d) => d.opening.kind === "sliding");
        expect(storagePlateCells(p, open, lights, sliding)).toEqual([]);
        expect(storagePlateChecks(p, sliding)).toEqual([]);
        expect(storagePlateChecks(p, doors).map(({ door }) => door.id)).toEqual(
          ["hinged"],
        );
        for (const door of doors) {
          expect(
            storagePressTarget(p, localCellAt(p, door.compartment), doors),
          ).toEqual({ door, onCompartment: true });
        }
        for (const door of sliding) {
          const aisle = { ...door.compartment, x: 0 };
          expect(openPlateAt(aisle, open, doors)).toBeUndefined();
          expect(
            storagePressTarget(p, localCellAt(p, aisle), doors),
          ).toBeUndefined();
        }
        const hinged = doors.find((d) => d.opening.kind === "hinged");
        if (hinged?.opening.kind !== "hinged")
          throw new Error("Missing hinged fixture");
        expect(openPlateAt(hinged.opening.plate, open, doors)?.id).toBe(
          open.has(hinged.id) ? hinged.id : undefined,
        );
        expect(storagePlateCells(p, open, lights, doors)).toHaveLength(
          open.has(hinged.id) ? 1 : 0,
        );
      }),
    );
  });
});
