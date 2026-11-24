import fc from "fast-check";
import { expect, it } from "vitest";
import type { TentRemovalWorld } from "../../../src/application/camp/ports/tentRemoval";
import { removeTent } from "../../../src/application/camp/removeTent";
import { legacyTentClearCells } from "../../../src/domain/camp/legacyTent";
import { asTentId } from "../../../src/domain/camp/tent";
import type { TentEntry } from "../../../src/domain/camp/tentRegistry";
import { snapYaw } from "../../../src/domain/shared/facing";
import { asDimensionId } from "../../../src/domain/shared/ids";

const ENTRY: TentEntry = {
  id: asTentId("tent"),
  layout: 1,
  dimensionId: asDimensionId("minecraft:overworld"),
  pose: { x: 12, y: 64, z: -4, yaw: snapYaw(-90) },
};

it("unlays before clearing and uses the entity state from before unlaying", () => {
  fc.assert(
    fc.property(
      fc.record({
        legacy: fc.option(fc.constant(ENTRY), { nil: undefined }),
        entityLoaded: fc.boolean(),
        hasEntry: fc.boolean(),
      }),
      ({ legacy, entityLoaded, hasEntry }) => {
        const calls: unknown[][] = [];
        let loaded = entityLoaded;
        let clearedByPose = false;
        const world: TentRemovalWorld = {
          entityLoaded(id) {
            calls.push(["entityLoaded", id]);
            return loaded;
          },
          unlayBlocks(id) {
            calls.push(["unlayBlocks", id]);
            loaded = false;
          },
          clearBlocksByPose(id) {
            calls.push(["clearBlocksByPose", id]);
            clearedByPose = hasEntry;
          },
          clearTentBlocks(dimensionId, cells) {
            calls.push(["clearTentBlocks", dimensionId, cells]);
          },
          removeTent(id) {
            calls.push(["removeTent", id]);
          },
        };

        removeTent(world, ENTRY.id, legacy);

        const expected: unknown[][] = [
          ["entityLoaded", ENTRY.id],
          ["unlayBlocks", ENTRY.id],
        ];
        if (legacy)
          expected.push([
            "clearTentBlocks",
            legacy.dimensionId,
            legacyTentClearCells(legacy.pose),
          ]);
        else if (!entityLoaded) expected.push(["clearBlocksByPose", ENTRY.id]);
        expected.push(["removeTent", ENTRY.id]);

        expect(calls).toEqual(expected);
        expect(clearedByPose).toBe(!legacy && !entityLoaded && hasEntry);
      },
    ),
  );
});
