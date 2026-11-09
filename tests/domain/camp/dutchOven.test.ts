import fc from "fast-check";
import { expect, it } from "vitest";
import { initialSimmering } from "../../../src/domain/camp/dutchOven";
import { asFirePitId } from "../../../src/domain/camp/firePit";
import { asTableId } from "../../../src/domain/camp/table";
import type { Host } from "../../../src/domain/shared/hosted";

it("initially simmers exactly on a fire pit", () => {
  fc.assert(
    fc.property(
      fc.oneof(
        fc.constant({ kind: "ground" } as const),
        fc.record({
          kind: fc.constant("spot" as const),
          hostType: fc.constant("fire_pit" as const),
          id: fc.string({ minLength: 1 }).map(asFirePitId),
          spot: fc.nat(),
        }),
        fc.record({
          kind: fc.constant("top" as const),
          hostType: fc.constant("camp_table" as const),
          id: fc.string({ minLength: 1 }).map(asTableId),
          at: fc.record({ x: fc.integer(), z: fc.integer() }),
        }),
      ),
      (host: Host) => {
        expect(initialSimmering(host)).toBe(
          host.kind === "spot" && host.hostType === "fire_pit",
        );
      },
    ),
  );
});
