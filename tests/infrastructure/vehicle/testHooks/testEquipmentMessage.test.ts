import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { VEHICLE_KINDS } from "../../../../src/domain/vehicle/kind";
import { profileOf } from "../../../../src/domain/vehicle/kinds/index";
import { parseTestEquipmentMessage } from "../../../../src/infrastructure/vehicle/testHooks/testEquipmentMessage";

const switches = VEHICLE_KINDS.flatMap(
  (kind) => profileOf(kind).equipment?.switches ?? [],
);
const part = fc.string({ minLength: 1 }).filter((s) => !s.includes(","));

describe("parseTestEquipmentMessage (ADR 0138)", () => {
  it("resolves a valid wire command to its declared switch", () => {
    fc.assert(
      fc.property(part, fc.constantFrom(...switches), (id, equipmentSwitch) => {
        for (const state of equipmentSwitch.states)
          expect(
            parseTestEquipmentMessage(`${id},${equipmentSwitch.item},${state}`),
          ).toEqual({
            vehicleId: id,
            switch: equipmentSwitch,
            state,
          });
      }),
    );
  });

  it("rejects unknown switch items and states", () => {
    fc.assert(
      fc.property(
        part,
        fc.constantFrom(...switches),
        part,
        (id, equipmentSwitch, name) => {
          if (switches.every(({ item }) => item !== name))
            expect(
              parseTestEquipmentMessage(
                `${id},${name},${equipmentSwitch.states[0]}`,
              ),
            ).toBeUndefined();
          if (!equipmentSwitch.states.includes(name))
            expect(
              parseTestEquipmentMessage(
                `${id},${equipmentSwitch.item},${name}`,
              ),
            ).toBeUndefined();
        },
      ),
    );
  });

  it.each([
    "",
    "car",
    "car,",
    ",raised",
    "car,up",
    "car,Raised",
    "car,,up",
    "car,blade_switch,",
    "car,blade_switch,up,extra",
  ])("ignores a malformed message: %j", (message) => {
    expect(parseTestEquipmentMessage(message)).toBeUndefined();
  });
});
