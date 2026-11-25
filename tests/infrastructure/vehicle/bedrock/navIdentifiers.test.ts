import fc from "fast-check";
import { expect, it } from "vitest";
import type { NavDestination } from "../../../../src/domain/vehicle/navigation/destinations";
import {
  navDestinationLabelKey,
  navLootTableFile,
  navLootTableId,
} from "../../../../src/infrastructure/vehicle/bedrock/identifiers";

it("names the loot table, pack file, and menu label for each destination", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("village", "monument", "trial_chambers"),
      (name) => {
        const destination = name as NavDestination;
        const tableId = navLootTableId(destination);
        expect(tableId).toBe(`yasu_ride/nav_${name}`);
        expect(navLootTableFile(destination)).toBe(
          `loot_tables/${tableId}.json`,
        );
        expect(navDestinationLabelKey(destination)).toBe(
          `yasu_ride.nav.destination.${name}`,
        );
      },
    ),
  );
});
