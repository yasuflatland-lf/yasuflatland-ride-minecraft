import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { BulldozerDrive } from "../../../../../src/domain/vehicle/kinds/bulldozer/drive";
import {
  BLADE_SWITCH_ITEM,
  BULLDOZER_EQUIPMENT,
  ROAD_PAVER_SWITCH_ITEM,
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
        item: ROAD_PAVER_SWITCH_ITEM,
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
          drive.setEquipmentState(BLADE_SWITCH_ITEM, raised ? "up" : "down");
        expect(drive.equipmentState(BLADE_SWITCH_ITEM)).toBe(
          switches.at(-1) === false ? "down" : "up",
        );
      }),
    );
  });

  it("binds every equipment switch and accepts every declared state", () => {
    for (const { item, states } of BULLDOZER_EQUIPMENT.switches)
      fc.assert(
        fc.property(fc.array(fc.constantFrom(...states)), (changes) => {
          const drive = new BulldozerDrive(0, {});
          expect(drive.equipmentState(item)).toBeDefined();
          for (const state of [...states, ...changes]) {
            expect(drive.setEquipmentState(item, state)).toBe(true);
            expect(drive.equipmentState(item)).toBe(state);
          }
        }),
      );
  });

  it("leaves every switch unchanged after an invalid state or unknown item", () => {
    const switches = BULLDOZER_EQUIPMENT.switches;
    const statesOf = (drive: BulldozerDrive) =>
      switches.map(({ item }) => drive.equipmentState(item));
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
          switches.forEach(({ item }, i) => {
            const state = initial[i];
            if (state !== undefined) drive.setEquipmentState(item, state);
          });
          const before = statesOf(drive);
          for (const { item } of switches) {
            expect(drive.setEquipmentState(item, invalidState)).toBe(false);
            expect(statesOf(drive)).toEqual(before);
          }
          for (const state of [
            invalidState,
            ...switches.flatMap((equipmentSwitch) => equipmentSwitch.states),
          ]) {
            expect(drive.setEquipmentState(unknownItem, state)).toBe(false);
            expect(statesOf(drive)).toEqual(before);
          }
        },
      ),
    );
  });

  it("reports no state for an item that is not one of its switches", () => {
    const drive = new BulldozerDrive(0, {});
    for (const item of ["stone", "toString", "constructor", ""])
      expect(drive.equipmentState(item)).toBeUndefined();
  });
});

it("rejects unknown switches or states without changing the blade target", () => {
  fc.assert(
    fc.property(
      fc.string(),
      fc.string(),
      fc.boolean(),
      (item, state, raised) => {
        const drive = new BulldozerDrive(0, { blade: raised ? 1 : 0 });
        const valid =
          item === BLADE_SWITCH_ITEM && (state === "up" || state === "down");
        expect(drive.setEquipmentState(item, state)).toBe(valid);
        expect(drive.equipmentState(BLADE_SWITCH_ITEM)).toBe(
          valid ? state : raised ? "up" : "down",
        );
      },
    ),
  );
});
