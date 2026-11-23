import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { asVehicleId, type VehicleId } from "../../../../src/domain/shared/ids";
import { VehicleTestStore } from "../../../../src/infrastructure/vehicle/testInput/vehicleTestStore";

const value = fc.string();

describe("VehicleTestStore", () => {
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
