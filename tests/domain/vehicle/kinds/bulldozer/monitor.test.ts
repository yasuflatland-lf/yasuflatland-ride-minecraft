import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { BulldozerDrive } from "../../../../../src/domain/vehicle/kinds/bulldozer/drive";
import {
  BLADE_SWITCH_ITEM,
  BULLDOZER_MONITOR,
  ROAD_PAVER_SWITCH_ITEM,
} from "../../../../../src/domain/vehicle/kinds/bulldozer/monitor";
import { NAMESPACE } from "../../../../../src/infrastructure/shared/identifiers";

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

describe("bulldozer cab monitor rule (ADR 0139)", () => {
  it("shows only items of its creative group", () => {
    const items = groupItems(BULLDOZER_MONITOR.group);
    expect(BULLDOZER_MONITOR.tools).toContainEqual({
      item: ROAD_PAVER_SWITCH_ITEM,
      states: ["off", "on"],
    });
    for (const { item } of BULLDOZER_MONITOR.tools)
      expect(items).toContain(`${NAMESPACE}:${item}`);
  });

  it("reports the blade switch as up exactly when the blade target is raised", () => {
    fc.assert(
      fc.property(fc.array(fc.boolean(), { maxLength: 20 }), (switches) => {
        const drive = new BulldozerDrive(0, {});
        for (const raised of switches)
          drive.setToolState(BLADE_SWITCH_ITEM, raised ? "up" : "down");
        expect(drive.toolState(BLADE_SWITCH_ITEM)).toBe(
          switches.at(-1) === false ? "down" : "up",
        );
      }),
    );
  });

  it("binds every monitor tool and accepts every declared state", () => {
    for (const { item, states } of BULLDOZER_MONITOR.tools)
      fc.assert(
        fc.property(fc.array(fc.constantFrom(...states)), (changes) => {
          const drive = new BulldozerDrive(0, {});
          expect(drive.toolState(item)).toBeDefined();
          for (const state of [...states, ...changes]) {
            expect(drive.setToolState(item, state)).toBe(true);
            expect(drive.toolState(item)).toBe(state);
          }
        }),
      );
  });

  it("leaves every tool unchanged after an invalid state or unknown item", () => {
    const tools = BULLDOZER_MONITOR.tools;
    const statesOf = (drive: BulldozerDrive) =>
      tools.map(({ item }) => drive.toolState(item));
    fc.assert(
      fc.property(
        fc.tuple(...tools.map((tool) => fc.constantFrom(...tool.states))),
        fc
          .oneof(fc.string(), fc.constantFrom("", "toString"))
          .filter(
            (state) => !tools.some((tool) => tool.states.includes(state)),
          ),
        fc.string().filter((item) => !tools.some((tool) => tool.item === item)),
        (initial, invalidState, unknownItem) => {
          const drive = new BulldozerDrive(0, {});
          tools.forEach(({ item }, i) => {
            const state = initial[i];
            if (state !== undefined) drive.setToolState(item, state);
          });
          const before = statesOf(drive);
          for (const { item } of tools) {
            expect(drive.setToolState(item, invalidState)).toBe(false);
            expect(statesOf(drive)).toEqual(before);
          }
          for (const state of [
            invalidState,
            ...tools.flatMap((tool) => tool.states),
          ]) {
            expect(drive.setToolState(unknownItem, state)).toBe(false);
            expect(statesOf(drive)).toEqual(before);
          }
        },
      ),
    );
  });

  it("reports no state for an item that is not one of its tools", () => {
    const drive = new BulldozerDrive(0, {});
    for (const item of ["stone", "toString", "constructor", ""])
      expect(drive.toolState(item)).toBeUndefined();
  });
});

it("rejects unknown tools or states without changing the blade target", () => {
  fc.assert(
    fc.property(
      fc.string(),
      fc.string(),
      fc.boolean(),
      (item, state, raised) => {
        const drive = new BulldozerDrive(0, { blade: raised ? 1 : 0 });
        const valid =
          item === BLADE_SWITCH_ITEM && (state === "up" || state === "down");
        expect(drive.setToolState(item, state)).toBe(valid);
        expect(drive.toolState(BLADE_SWITCH_ITEM)).toBe(
          valid ? state : raised ? "up" : "down",
        );
      },
    ),
  );
});
