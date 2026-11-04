import fc from "fast-check";
import { expect, it } from "vitest";
import {
  isRoomDrive,
  type RoomDrive,
} from "../../../../src/domain/vehicle/dock/roomDrive";
import { CamperDrive } from "../../../../src/domain/vehicle/kinds/camper/drive";

const METHODS: (keyof RoomDrive)[] = [
  "useDockDoor",
  "bedSpawnCell",
  "pressShowerToilet",
  "decor",
  "setDecor",
  "decorSlotFor",
  "placeDecor",
  "removeDecor",
  "pressStorage",
];

it("requires every room method to be callable, including inherited methods", () => {
  fc.assert(
    fc.property(
      fc.integer(),
      fc.subarray(METHODS, { minLength: 1 }),
      fc.oneof(
        fc.constant(undefined),
        fc.constant(null),
        fc.boolean(),
        fc.string(),
        fc.integer(),
      ),
      (yaw, missing, value) => {
        const drive = new CamperDrive(yaw, {});
        expect(isRoomDrive(drive)).toBe(true);
        for (const method of missing) {
          Object.defineProperty(drive, method, { value });
        }
        expect(isRoomDrive(drive)).toBe(false);
      },
    ),
  );
});
