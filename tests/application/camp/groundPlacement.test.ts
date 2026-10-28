import fc from "fast-check";
import { expect, it, vi } from "vitest";
import {
  canUseBlockTop,
  hasClearance,
  placeOnGround,
} from "../../../src/application/camp/groundPlacement";
import type { GroundCellsWorld } from "../../../src/application/camp/ports/groundCells";
import { asDimensionId, asPlayerId } from "../../../src/domain/shared/ids";
import type { Vec3 } from "../../../src/domain/shared/vec";

const dimension = asDimensionId("overworld");
const player = asPlayerId("player");
const cellKey = (at: Vec3) => `${at.x},${at.y},${at.z}`;
const position = fc.record({
  x: fc.integer({ min: -1000, max: 1000 }),
  y: fc.integer({ min: -64, max: 320 }),
  z: fc.integer({ min: -1000, max: 1000 }),
});
const specArbitrary = fc.record({
  clearance: fc.integer({ min: 1, max: 3 }),
  yawStep: fc.constantFrom(30, 45, 90, 180),
});
const commandArbitrary = fc.record({
  player: fc.constant(player),
  dimension: fc.constant(dimension),
  block: position,
  yaw: fc.double({ min: -720, max: 720, noNaN: true }),
  slot: fc.integer({ min: 0, max: 8 }),
});

function fixture(creative = false, consumeResult = true) {
  const nonAir = new Set<string>();
  const own = new Set<string>();
  const vehicle = new Set<string>();
  const world = {
    isAir: vi.fn((_dimension, at) => !nonAir.has(cellKey(at))),
    isOwnBlock: vi.fn((_dimension, at) => own.has(cellKey(at))),
    isVehicleSpace: vi.fn((_dimension, at) => vehicle.has(cellKey(at))),
    isCreative: vi.fn(() => creative),
    consumeItem: vi.fn(() => consumeResult),
  } satisfies GroundCellsWorld;
  const item = { isNear: vi.fn(() => false), spawn: vi.fn() };
  return { world, nonAir, own, vehicle, item };
}

it("accepts exactly the up face of a block that is not own", () => {
  fc.assert(
    fc.property(
      position,
      fc.oneof(fc.constant("up"), fc.string()),
      fc.boolean(),
      (block, face, own) => {
        const { world, own: cells } = fixture();
        if (own) cells.add(cellKey(block));
        expect(canUseBlockTop(world, dimension, block, face)).toBe(
          face === "up" && !own,
        );
        if (face === "up")
          expect(world.isOwnBlock).toHaveBeenCalledExactlyOnceWith(
            dimension,
            block,
          );
        else expect(world.isOwnBlock).not.toHaveBeenCalled();
      },
    ),
  );
});

it("requires every clearance cell to be air outside vehicle space, ignoring the cell above", () => {
  fc.assert(
    fc.property(
      position,
      fc.integer({ min: 1, max: 3 }),
      fc.array(fc.boolean(), { minLength: 3, maxLength: 3 }),
      fc.array(fc.boolean(), { minLength: 3, maxLength: 3 }),
      (base, clearance, nonAir, vehicle) => {
        const fake = fixture();
        for (let dy = 0; dy < 3; dy++) {
          const key = cellKey({ ...base, y: base.y + dy });
          if (nonAir[dy]) fake.nonAir.add(key);
          if (vehicle[dy]) fake.vehicle.add(key);
        }
        const expected =
          nonAir.slice(0, clearance).every((blocked) => !blocked) &&
          vehicle.slice(0, clearance).every((blocked) => !blocked);
        expect(hasClearance(fake.world, dimension, base, clearance)).toBe(
          expected,
        );
        const above = cellKey({ ...base, y: base.y + clearance });
        fake.nonAir.add(above);
        fake.vehicle.add(above);
        expect(hasClearance(fake.world, dimension, base, clearance)).toBe(
          expected,
        );
      },
    ),
  );
});

it("rejects blocked clearance or nearby items before payment and spawn", () => {
  fc.assert(
    fc.property(
      commandArbitrary,
      specArbitrary,
      fc.boolean(),
      (cmd, spec, creative) => {
        for (const reason of ["nonAir", "vehicle", "near"] as const) {
          for (let dy = 1; dy <= spec.clearance; dy++) {
            const fake = fixture(creative);
            if (reason === "near") fake.item.isNear.mockReturnValue(true);
            else
              fake[reason].add(cellKey({ ...cmd.block, y: cmd.block.y + dy }));
            expect(placeOnGround(fake.world, spec, cmd, fake.item)).toBe(false);
            expect(fake.world.consumeItem).not.toHaveBeenCalled();
            expect(fake.item.spawn).not.toHaveBeenCalled();
            if (reason !== "near")
              expect(fake.item.isNear).not.toHaveBeenCalled();
          }
        }
      },
    ),
  );
});

it("refuses failed payment outside Creative and otherwise spawns once with centered position and snapped yaw", () => {
  fc.assert(
    fc.property(commandArbitrary, specArbitrary, (cmd, spec) => {
      for (const creative of [false, true]) {
        for (const consumeResult of [false, true]) {
          const { world, item } = fixture(creative, consumeResult);
          const accepted = creative || consumeResult;
          expect(placeOnGround(world, spec, cmd, item)).toBe(accepted);
          expect(world.isCreative).toHaveBeenCalledExactlyOnceWith(player);
          expect(world.consumeItem).toHaveBeenCalledTimes(creative ? 0 : 1);
          if (!creative)
            expect(world.consumeItem).toHaveBeenCalledWith(player, cmd.slot);
          const at = {
            x: cmd.block.x + 0.5,
            y: cmd.block.y + 1,
            z: cmd.block.z + 0.5,
          };
          expect(item.isNear).toHaveBeenCalledExactlyOnceWith(dimension, at);
          expect(item.spawn).toHaveBeenCalledTimes(accepted ? 1 : 0);
          if (accepted) {
            const yaw = Math.round(cmd.yaw / spec.yawStep) * spec.yawStep;
            expect(item.spawn).toHaveBeenCalledWith(dimension, at, yaw);
            expect(Math.abs(yaw % spec.yawStep)).toBe(0);
            expect(Math.abs(yaw - cmd.yaw)).toBeLessThanOrEqual(
              spec.yawStep / 2,
            );
          }
        }
      }
    }),
  );
});
