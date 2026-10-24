import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { asVehicleId, type VehicleId } from "../../../../src/domain/shared/ids";
import { VehicleTestStore } from "../../../../src/infrastructure/vehicle/testInput/vehicleTestStore";

const vehicleId = fc.string().map(asVehicleId);

const value = fc.string();

describe("VehicleTestStore", () => {
  it("value for an unregistered vehicle is undefined", () => {
    fc.assert(
      fc.property(vehicleId, (id) => {
        expect(new VehicleTestStore<string>().get(id)).toBeUndefined();
      }),
    );
  });

  it("returns a registered value and updates the value for the same id", () => {
    fc.assert(
      fc.property(vehicleId, value, value, (id, first, next) => {
        const store = new VehicleTestStore<string>();
        store.set(id, first);
        expect(store.get(id)).toEqual(first);
        store.set(id, next);
        expect(store.get(id)).toEqual(next);
      }),
    );
  });

  it("clear removes only the value of the given vehicle", () => {
    fc.assert(
      fc.property(
        fc.tuple(vehicleId, vehicleId).filter(([a, b]) => a !== b),
        value,
        (ids, raw) => {
          const [removed, kept] = ids;
          const store = new VehicleTestStore<string>();
          store.set(removed, raw);
          store.set(kept, raw);
          store.clear(removed);
          expect(store.get(removed)).toBeUndefined();
          expect(store.get(kept)).toEqual(raw);
          store.clear(removed);
          expect(store.get(removed)).toBeUndefined();
        },
      ),
    );
  });

  it("retain keeps only the values of vehicles in the given set", () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(vehicleId, { minLength: 2 }),
        value,
        fc.nat(),
        (ids, raw, count) => {
          const store = new VehicleTestStore<string>();
          for (const id of ids) store.set(id, raw);
          const retained = new Set(ids.slice(0, count % (ids.length + 1)));
          store.retain(retained);
          for (const id of ids) {
            expect(store.get(id)).toEqual(retained.has(id) ? raw : undefined);
          }
          store.retain(new Set());
          for (const id of ids) expect(store.get(id)).toBeUndefined();
        },
      ),
    );
  });

  it("agrees with a Map after arbitrary set, clear, and retain sequences", () => {
    const ids = [asVehicleId("a"), asVehicleId("b"), asVehicleId("c")];
    const id = fc.constantFrom(...ids);
    const anyOperation = fc.oneof(
      fc.record({ kind: fc.constant("set"), id, value }),
      fc.record({ kind: fc.constant("clear"), id }),
      fc.record({ kind: fc.constant("retain"), ids: fc.subarray(ids) }),
    );
    fc.assert(
      fc.property(fc.array(anyOperation), (operations) => {
        const store = new VehicleTestStore<string>();
        const model = new Map<VehicleId, string>();
        for (const operation of operations) {
          switch (operation.kind) {
            case "set":
              store.set(operation.id, operation.value);
              model.set(operation.id, operation.value);
              break;
            case "clear":
              store.clear(operation.id);
              model.delete(operation.id);
              break;
            case "retain": {
              const retained = new Set(operation.ids);
              store.retain(retained);
              for (const key of model.keys()) {
                if (!retained.has(key)) model.delete(key);
              }
              break;
            }
          }
          for (const key of ids) expect(store.get(key)).toEqual(model.get(key));
        }
      }),
    );
  });
});
