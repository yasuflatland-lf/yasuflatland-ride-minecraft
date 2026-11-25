import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { defineEquipmentSwitch } from "../../../../../src/domain/vehicle/equipment/equipment";
import { BulldozerDrive } from "../../../../../src/domain/vehicle/kinds/bulldozer/drive";
import {
  BLADE_SWITCH,
  BULLDOZER_EQUIPMENT,
  ROAD_PAVER_SWITCH,
} from "../../../../../src/domain/vehicle/kinds/bulldozer/equipment";
import { NAMESPACE } from "../../../../../src/infrastructure/shared/identifiers";
import { BULLDOZER_PACK_CONTRACT } from "../../../../support/packContract";

interface CatalogGroup {
  group_identifier?: { name: string };
  items: (string | { name: string })[];
}

const catalog: {
  "minecraft:crafting_items_catalog": {
    categories: { groups: CatalogGroup[] }[];
  };
} = JSON.parse(
  readFileSync(
    "packs/yasu_ride_bp/item_catalog/crafting_item_catalog.json",
    "utf8",
  ),
);

function groupItems(qualifiedName: string): string[] {
  const group = catalog["minecraft:crafting_items_catalog"].categories
    .flatMap((category) => category.groups)
    .find((g) => g.group_identifier?.name === qualifiedName);
  if (!group) throw new Error(`Missing creative group ${qualifiedName}`);
  return group.items.map((item) =>
    typeof item === "string" ? item : item.name,
  );
}

describe("bulldozer equipment rule (ADR 0139)", () => {
  it("shows only items of its creative group", () => {
    const items = groupItems(BULLDOZER_PACK_CONTRACT.monitorGroup);
    expect(BULLDOZER_EQUIPMENT.switches).toContainEqual(
      expect.objectContaining({
        item: ROAD_PAVER_SWITCH.item,
        states: ["off", "on"],
      }),
    );
    for (const { item } of BULLDOZER_EQUIPMENT.switches)
      expect(items).toContain(`${NAMESPACE}:${item}`);
  });

  it("reports the blade switch as up exactly when the blade target is raised", () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { maxLength: 20 }), (switches) => {
        const drive = new BulldozerDrive(0, {});
        for (const raised of switches)
          drive.forceEquipment(BLADE_SWITCH, raised ? "up" : "down");
        expect(drive.equipmentState(BLADE_SWITCH)).toBe(
          switches.at(-1) === false ? "down" : "up",
        );
      }),
    );
  });

  it("binds every equipment switch and accepts every declared state", () => {
    for (const equipmentSwitch of BULLDOZER_EQUIPMENT.switches) {
      const { states } = equipmentSwitch;
      fc.assert(
        fc.property(fc.array(fc.constantFrom(...states)), (changes) => {
          const drive = new BulldozerDrive(0, {});
          expect(drive.equipmentState(equipmentSwitch)).toBeDefined();
          for (const state of [...states, ...changes]) {
            expect(drive.forceEquipment(equipmentSwitch, state)).toBe(true);
            expect(drive.equipmentState(equipmentSwitch)).toBe(state);
          }
        }),
      );
    }
  });

  it("leaves every switch unchanged after an invalid state or unknown item", () => {
    const switches = BULLDOZER_EQUIPMENT.switches;
    const statesOf = (drive: BulldozerDrive) =>
      switches.map((equipmentSwitch) => drive.equipmentState(equipmentSwitch));
    fc.assert(
      fc.property(
        fc.tuple(
          ...switches.map((equipmentSwitch) =>
            fc.constantFrom(...equipmentSwitch.states),
          ),
        ),
        fc
          .oneof(fc.string(), fc.constantFrom("", "toString"))
          .filter(
            (state) =>
              !switches.some((equipmentSwitch) =>
                equipmentSwitch.states.includes(state),
              ),
          ),
        fc
          .string()
          .filter(
            (item) =>
              !switches.some(
                (equipmentSwitch) => equipmentSwitch.item === item,
              ),
          ),
        (initial, invalidState, unknownItem) => {
          const drive = new BulldozerDrive(0, {});
          switches.forEach((equipmentSwitch, i) => {
            const state = initial[i];
            if (state !== undefined)
              drive.forceEquipment(equipmentSwitch, state);
          });
          const before = statesOf(drive);
          for (const equipmentSwitch of switches) {
            expect(drive.forceEquipment(equipmentSwitch, invalidState)).toBe(
              false,
            );
            expect(statesOf(drive)).toEqual(before);
          }
          for (const state of [
            invalidState,
            ...switches.flatMap((equipmentSwitch) => equipmentSwitch.states),
          ]) {
            expect(
              drive.forceEquipment(
                defineEquipmentSwitch(unknownItem, [state]),
                state,
              ),
            ).toBe(false);
            expect(statesOf(drive)).toEqual(before);
          }
        },
      ),
    );
  });

  it("reports no state for an item that is not one of its switches", () => {
    const drive = new BulldozerDrive(0, {});
    for (const item of ["stone", "toString", "constructor", ""])
      expect(
        drive.equipmentState(defineEquipmentSwitch(item, ["up"])),
      ).toBeUndefined();
  });
});

it("rejects unknown switches or states without changing the blade target", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(BLADE_SWITCH, ROAD_PAVER_SWITCH),
      fc.oneof(fc.string(), fc.constantFrom("up", "down")),
      fc.boolean(),
      (equipmentSwitch, state, raised) => {
        const drive = new BulldozerDrive(0, { blade: raised ? 1 : 0 });
        const valid = equipmentSwitch.states.some((name) => name === state);
        expect(drive.forceEquipment(equipmentSwitch, state)).toBe(valid);
        expect(drive.equipmentState(BLADE_SWITCH)).toBe(
          valid && equipmentSwitch === BLADE_SWITCH
            ? state
            : raised
              ? "up"
              : "down",
        );
      },
    ),
  );
});
