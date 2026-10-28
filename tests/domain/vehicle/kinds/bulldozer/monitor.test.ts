import { readFileSync } from "node:fs";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { BulldozerDrive } from "../../../../../src/domain/vehicle/kinds/bulldozer/drive";
import {
  BLADE_SWITCH_ITEM,
  BULLDOZER_MONITOR,
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

function groupItems(name: string): string[] {
  const group = catalog["minecraft:crafting_items_catalog"].categories
    .flatMap((category) => category.groups)
    .find((g) => g.group_identifier?.name === `${NAMESPACE}:${name}`);
  if (!group) throw new Error(`Missing creative group ${name}`);
  return group.items.map((item) =>
    (typeof item === "string" ? item : item.name).replace(`${NAMESPACE}:`, ""),
  );
}

describe("bulldozer cab monitor rule (ADR 0139)", () => {
  it("shows exactly the items of its tool creative group", () => {
    expect(BULLDOZER_MONITOR.tools.map((t) => t.item)).toEqual(
      groupItems(BULLDOZER_MONITOR.group),
    );
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
