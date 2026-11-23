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
const setCalls = fc.array(
  fc.tuple(
    fc.constantFrom(...DECOR_SLOTS.map(({ id }) => id)),
    fc.option(gear.map(decorItemId), { nil: undefined }),
  ),
);

it("keeps set sequences within the save budget and uses each place at most once", () => {
  fc.assert(
    fc.property(setCalls, (calls) => {
      const decor = CamperRoomDecor.restore(undefined);
      expect(decorFits(decor.all())).toBe(true);
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
