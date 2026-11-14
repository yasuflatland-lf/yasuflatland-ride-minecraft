import fc from "fast-check";
import { expect, it } from "vitest";
import { PlaceDecor } from "../../../../../src/application/vehicle/placeDecor";
import { asPlayerId, asVehicleId } from "../../../../../src/domain/shared/ids";
import { serializeDecor } from "../../../../../src/domain/vehicle/dock/decor";
import {
  DECOR_SLOTS,
  decorFits,
} from "../../../../../src/domain/vehicle/kinds/camper/decor";
import { slotPoint } from "../../../../../src/domain/vehicle/kinds/camper/decorPlacing";
import {
  localCellAt,
  parkPose,
} from "../../../../../src/domain/vehicle/kinds/camper/parkPose";
import { CAMPER_SPEC } from "../../../../../src/domain/vehicle/kinds/camper/spec";
import { rebuildVehicle } from "../../../../../src/domain/vehicle/kinds/index";
import {
  FakeWorld,
  InMemoryRepo,
  stillTick,
} from "../../../../application/vehicle/fakes";
import { decorItemId, decorSlotId } from "../../../../support/decorIds";
import { defined } from "../../../../support/defined";

it("counts the serialized UTF-8 bytes including Unicode and escaped unknown slot ids at the engine limit", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("x", "é", "\u754c", "😀", '"', "\\"),
      fc.integer({ min: 32000, max: 33000 }),
      (char, budget) => {
        const entries = [
          {
            slot: decorSlotId(
              char.repeat(Math.floor(budget / Buffer.byteLength(char))),
            ),
            item: decorItemId("mug_pair"),
          },
        ];
        const saved = defined(serializeDecor(entries), "serialized");
        expect(decorFits(entries)).toBe(
          Buffer.byteLength(saved) <= CAMPER_SPEC.decorMaxBytes,
        );
      },
    ),
  );
  const base = [{ slot: decorSlotId(""), item: decorItemId("mug_pair") }];
  const overhead = Buffer.byteLength(defined(serializeDecor(base), "base"));
  const atLimit = [
    {
      ...defined(base[0], "entry"),
      slot: decorSlotId("x".repeat(CAMPER_SPEC.decorMaxBytes - overhead)),
    },
  ];
  expect(decorFits(atLimit)).toBe(true);
  expect(
    decorFits([
      ...atLimit,
      { slot: decorSlotId("extra"), item: decorItemId("mug_pair") },
    ]),
  ).toBe(false);
});

it("refuses an overflowing placement before consuming survival gear and preserves all unknown saved entries", () => {
  const known = DECOR_SLOTS.map((s) => ({
    slot: s.id,
    item: decorItemId(s.hanging ? "macrame_planter" : "mug_pair"),
  }));
  const duplicate = {
    slot: decorSlotId("counter"),
    item: decorItemId("mug_pair"),
  };
  const raw = [
    ...known,
    duplicate,
    { slot: decorSlotId("future_"), item: decorItemId("mug_pair") },
  ];
  const overhead = Buffer.byteLength(defined(serializeDecor(raw), "base"));
  const unknown = {
    slot: decorSlotId(
      `future_${"x".repeat(CAMPER_SPEC.decorMaxBytes - overhead)}`,
    ),
    item: decorItemId("mug_pair"),
  };
  const saved = defined(
    serializeDecor([...known, duplicate, unknown]),
    "saved",
  );
  expect(Buffer.byteLength(saved)).toBe(CAMPER_SPEC.decorMaxBytes);
  const car = rebuildVehicle("camper", asVehicleId("car"), 0, [], {
    docked: true,
    dockDecor: saved,
  });
  stillTick(car, 100);
  const room = defined(car.asRoom(), "room");
  expect(room.setDecor(decorSlotId("counter"), undefined)).toBe(true);
  const before = room.decor();
  const repo = new InMemoryRepo();
  repo.save(car);
  const world = new FakeWorld();
  const place = new PlaceDecor(world, repo);
  const slot = defined(
    DECOR_SLOTS.find((s) => s.id === "counter"),
    "counter",
  );
  const pose = parkPose({ x: 0.5, y: 64, z: 0.5 }, 0);
  expect(
    place.execute({
      playerId: asPlayerId("p"),
      vehicleId: car.id,
      item: decorItemId("potted_plant"),
      cell: localCellAt(pose, slot.cell),
      point: slotPoint(pose, slot),
      hotbarSlot: 0,
      exact: true,
    }),
  ).toBe(false);
  expect(world.calls).toEqual(["showMessage"]);
  expect(room.decor()).toEqual(before);
  expect(room.decor()).toContainEqual(unknown);
  expect(room.decor()).toContainEqual(duplicate);
  expect(room.setDecor(slot.id, decorItemId("mug_pair"))).toBe(true);
  expect(decorFits(room.decor())).toBe(true);
});
