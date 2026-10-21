import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { OpenGift } from "../../../src/application/vehicle/openGift";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { PLACEMENT_GIFTS } from "../../../src/domain/vehicle/placement/gift";
import { FakeWorld } from "./fakes";

describe("OpenGift (ADR 0093)", () => {
  it("takes the box from the slot it was used from and unpacks it, or does nothing when the slot no longer holds it", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...PLACEMENT_GIFTS),
        fc.integer({ min: 0, max: 8 }),
        fc.boolean(),
        (gift, slot, giftInSlot) => {
          const world = new FakeWorld();
          world.giftInSlot = giftInSlot;
          expect(
            new OpenGift(world).execute({
              playerId: asPlayerId("p"),
              gift,
              slot,
            }),
          ).toBe(giftInSlot);
          expect(world.calls).toEqual(
            giftInSlot
              ? [`takeGift:p:${slot}:${gift}`, `unpack:p:${gift}`]
              : [],
          );
        },
      ),
    );
  });

  it("opens a box once when one tap uses it twice", () => {
    const world = new FakeWorld();
    const openGift = new OpenGift(world);
    const cmd = {
      playerId: asPlayerId("p"),
      gift: "camping_gear_box" as const,
      slot: 0,
    };
    openGift.execute(cmd);
    world.giftInSlot = false;
    openGift.execute(cmd);
    expect(world.calls.filter((c) => c.startsWith("unpack:"))).toHaveLength(1);
  });
});
