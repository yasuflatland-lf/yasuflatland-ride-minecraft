import { createHash } from "node:crypto";
import fc from "fast-check";
import { expect, it } from "vitest";
import { CAMPING_GEAR_IDS } from "../../../../../src/domain/vehicle/kinds/camper/campingGear";
import {
  DECOR_SLOTS,
  decorFits,
  sharingSlots,
} from "../../../../../src/domain/vehicle/kinds/camper/decor";
import { CamperRoomDecor } from "../../../../../src/domain/vehicle/kinds/camper/roomDecor";
import { decorItemId } from "../../../../support/decorIds";

const gear = fc.constantFrom(...CAMPING_GEAR_IDS);
const savedEntry = fc.record({
  slot: fc.oneof(
    fc.constantFrom(...DECOR_SLOTS.map(({ id }) => id)),
    fc.constantFrom("stove_rear", "shelf_low", "shelf_high_front", "old_slot"),
    fc.string(),
  ),
  item: fc.oneof(
    gear,
    gear,
    fc.constantFrom("lava_lamp", "oil_lamp", "lantern", "unknown_gear"),
  ),
});
const setCalls = fc.array(
  fc.tuple(
    fc.constantFrom(...DECOR_SLOTS.map(({ id }) => id)),
    fc.option(gear.map(decorItemId), { nil: undefined }),
  ),
);

it("restores saved decor in the pre-extraction order", () => {
  const hook = { slot: "ceiling_hook", item: "macrame_planter" };
  const savedArrays = fc.sample(fc.array(savedEntry, { maxLength: 40 }), {
    seed: 2093,
    numRuns: 200,
  });
  savedArrays.push([
    { slot: "old_slot", item: "potted_plant" },
    { slot: "stove_rear", item: "enamel_kettle" },
    { slot: "stove", item: "mug_pair" },
    { slot: "shelf_low", item: "cactus_pot" },
    { slot: "counter", item: "lantern" },
    hook,
    hook,
    hook,
  ]);
  const restored = savedArrays.map((entries) => {
    const json = JSON.stringify(entries);
    return CamperRoomDecor.restore(json).all();
  });
  const digest = createHash("sha256")
    .update(JSON.stringify(restored))
    .digest("hex");
  // Captured from CamperDrive before extracting the restore logic.
  expect(digest).toBe(
    "25d7e6141b2aafff0a3dd6f210d018be590c119e16a8abd10ce02069b5e16c97",
  );
});

it("keeps set sequences within the save budget and uses each place at most once", () => {
  fc.assert(
    fc.property(setCalls, (calls) => {
      const decor = CamperRoomDecor.restore(undefined);
      let allAccepted = true;
      for (const [slot, item] of calls) {
        allAccepted = decor.set(slot, item) && allAccepted;
        const entries = decor.all();
        const occupied = new Set(entries.map((entry) => entry.slot));
        expect(occupied.size).toBe(entries.length);
        for (const target of DECOR_SLOTS) {
          if (!occupied.has(target.id)) continue;
          expect(
            sharingSlots(target).filter(({ id }) => occupied.has(id)),
          ).toEqual([target]);
        }
        if (allAccepted) expect(decorFits(entries)).toBe(true);
      }
    }),
  );
});

it("clearing a newly filled place restores the previous decor", () => {
  fc.assert(
    fc.property(
      setCalls,
      fc.constantFrom(...DECOR_SLOTS),
      gear,
      (calls, target, item) => {
        const decor = CamperRoomDecor.restore(undefined);
        for (const [slot, gearId] of calls) decor.set(slot, gearId);
        const before = decor.all();
        const shared = new Set(sharingSlots(target).map(({ id }) => id));
        fc.pre(before.every(({ slot }) => !shared.has(slot)));

        if (decor.set(target.id, decorItemId(item))) {
          expect(decor.set(target.id, undefined)).toBe(true);
          expect(decor.all()).toEqual(before);
        }
      },
    ),
  );
});
