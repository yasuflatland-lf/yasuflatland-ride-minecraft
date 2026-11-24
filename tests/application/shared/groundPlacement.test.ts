import fc from "fast-check";
import { expect, it, vi } from "vitest";
import {
  canUseBlockTop,
  hasClearance,
  placeOnCells,
  placeOnGround,
} from "../../../src/application/shared/groundPlacement";
import type { GroundCellsWorld } from "../../../src/application/shared/ports/groundCells";
import type { ItemPayment } from "../../../src/application/shared/ports/itemPayment";
import {
  CHAIR_SPEC,
  DUTCH_OVEN_SPEC,
  FIRE_PIT_SPEC,
  GAS_LANTERN_SPEC,
  ROOF_TENT_SPEC,
  TABLE_SPEC,
  TENT_SPEC,
} from "../../../src/domain/camp/spec";
import { FURNITURE_SPEC } from "../../../src/domain/resort/furniture";
import {
  BEACH_CHAIR_SPEC,
  PARASOL_SPEC,
} from "../../../src/domain/resort/spec";
import type { BlockFace } from "../../../src/domain/shared/blockFace";
import { snapYaw } from "../../../src/domain/shared/facing";
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
  refuses: fc.shuffledSubarray(["vehicle", "camp"] as const),
  yawStep: fc.constantFrom(30, 45, 90, 180),
});
const commandArbitrary = fc.record({
  player: fc.constant(player),
  dimension: fc.constant(dimension),
  block: position,
  yaw: fc.double({ min: -720, max: 720, noNaN: true }),
  slot: fc.integer({ min: 0, max: 8 }),
});

function fixture(creative = false, consumeResult = true, failSpawn = false) {
  const nonAir = new Set<string>();
  const own = new Set<string>();
  const vehicle = new Set<string>();
  const camp = new Set<string>();
  const world = {
    isAir: vi.fn((_dimension, at) => !nonAir.has(cellKey(at))),
    isOwnBlock: vi.fn((_dimension, at) => own.has(cellKey(at))),
    isVehicleSpace: vi.fn((_dimension, at) => vehicle.has(cellKey(at))),
    isCampSpace: vi.fn((_dimension, at) => camp.has(cellKey(at))),
    isCreative: vi.fn(() => creative),
    consumeItem: vi.fn(() => consumeResult),
    refund: vi.fn(),
  } satisfies GroundCellsWorld & ItemPayment;
  const item = {
    isNear: vi.fn(() => false),
    spawn: vi.fn(() => (failSpawn ? undefined : "item")),
  };
  return { world, nonAir, own, vehicle, camp, item };
}

it("checks each gear spec against the protected spaces in a clearance cell", () => {
  const campGear = [
    CHAIR_SPEC,
    TABLE_SPEC,
    FIRE_PIT_SPEC,
    DUTCH_OVEN_SPEC,
    GAS_LANTERN_SPEC,
    TENT_SPEC,
    ROOF_TENT_SPEC,
  ];
  const resortGear = [
    BEACH_CHAIR_SPEC,
    PARASOL_SPEC,
    ...Object.values(FURNITURE_SPEC),
  ];
  fc.assert(
    fc.property(position, fc.boolean(), fc.boolean(), (cell, vehicle, camp) => {
      for (const [specs, allowed] of [
        [campGear, !vehicle],
        [resortGear, !vehicle && !camp],
      ] as const) {
        for (const spec of specs) {
          const fake = fixture();
          if (vehicle) fake.vehicle.add(cellKey(cell));
          if (camp) fake.camp.add(cellKey(cell));
          expect(
            placeOnCells(
              { dimension, cells: fake.world, payment: fake.world },
              { support: [], clear: [cell], refuses: spec.refuses },
              { player, slot: 0 },
              fake.item.spawn,
            ).placed,
          ).toBe(allowed);
        }
      }
    }),
  );
});

it("checks support, each clearance cell, and the extra check in order up to the first refusal", () => {
  fc.assert(
    fc.property(
      position,
      fc.integer({ min: 0, max: 5 }),
      fc.integer({ min: 0, max: 5 }),
      fc.shuffledSubarray(["vehicle", "camp"] as const),
      fc.option(fc.nat()),
      (base, supportCount, clearCount, refuses, refusal) => {
        const support = Array.from({ length: supportCount }, (_, x) => ({
          ...base,
          x: base.x + x,
        }));
        const clear = Array.from({ length: clearCount }, (_, x) => ({
          ...base,
          x: base.x + x,
          y: base.y + 1,
        }));
        const protectedChecks = (["vehicle", "camp"] as const).filter((space) =>
          refuses.includes(space),
        );
        const stages = [
          ...support.map((cell) => `support ${cellKey(cell)}`),
          ...clear.flatMap((cell) =>
            ["air", ...protectedChecks].map(
              (check) => `${check} ${cellKey(cell)}`,
            ),
          ),
          "extra",
        ];
        const failure =
          refusal === null ? stages.length : refusal % stages.length;
        const checked: string[] = [];
        const passes = (check: string) => {
          checked.push(check);
          return check !== stages[failure];
        };
        const { world: payment, item } = fixture();
        const cells = {
          isSolidTop: (d: typeof dimension, cell: Vec3) =>
            d === dimension && passes(`support ${cellKey(cell)}`),
          isAir: (d: typeof dimension, cell: Vec3) =>
            d === dimension && passes(`air ${cellKey(cell)}`),
          isVehicleSpace: (d: typeof dimension, cell: Vec3) =>
            d !== dimension || !passes(`vehicle ${cellKey(cell)}`),
          isCampSpace: (d: typeof dimension, cell: Vec3) =>
            d !== dimension || !passes(`camp ${cellKey(cell)}`),
        };
        const result = placeOnCells(
          { dimension, cells, payment },
          { support, clear, refuses, extraCheck: () => passes("extra") },
          { player, slot: 0 },
          item.spawn,
        );
        expect(checked).toEqual(stages.slice(0, failure + 1));
        expect(result).toEqual(
          refusal === null ? { placed: true, id: "item" } : { placed: false },
        );
        expect(payment.isCreative).toHaveBeenCalledTimes(
          refusal === null ? 1 : 0,
        );
        expect(item.spawn).toHaveBeenCalledTimes(refusal === null ? 1 : 0);
      },
    ),
  );
});

it("spawns only after payment, refunds failed spawns, and runs the hook only with a spawned id", () => {
  fc.assert(
    fc.property(
      fc.record({
        creative: fc.boolean(),
        consumeResult: fc.boolean(),
        hasPlayer: fc.boolean(),
        failSpawn: fc.boolean(),
        id: fc.string(),
        slot: fc.integer({ min: 0, max: 8 }),
      }),
      ({ creative, consumeResult, hasPlayer, failSpawn, id, slot }) => {
        const { world: payment } = fixture(creative, consumeResult);
        const spawn = vi.fn(() => (failSpawn ? undefined : id));
        const after = vi.fn();
        const owesPayment = hasPlayer && !creative;
        const spawnAttempted = !owesPayment || consumeResult;
        const placed = spawnAttempted && !failSpawn;
        const result = placeOnCells(
          { dimension, cells: payment, payment },
          { support: [], clear: [], refuses: [] },
          { player: hasPlayer ? player : undefined, slot },
          spawn,
          after,
        );
        expect(result).toEqual(
          placed ? { placed: true, id } : { placed: false },
        );
        expect(payment.isCreative).toHaveBeenCalledTimes(hasPlayer ? 1 : 0);
        expect(payment.consumeItem).toHaveBeenCalledTimes(owesPayment ? 1 : 0);
        expect(spawn).toHaveBeenCalledTimes(spawnAttempted ? 1 : 0);
        if (owesPayment) {
          expect(payment.consumeItem).toHaveBeenCalledWith(player, slot);
          if (spawnAttempted)
            expect(payment.consumeItem).toHaveBeenCalledBefore(spawn);
        }
        if (owesPayment && consumeResult && failSpawn) {
          expect(payment.refund).toHaveBeenCalledExactlyOnceWith(player, slot);
          expect(spawn).toHaveBeenCalledBefore(payment.refund);
        } else expect(payment.refund).not.toHaveBeenCalled();
        if (placed) {
          expect(after).toHaveBeenCalledExactlyOnceWith(id);
          expect(spawn).toHaveBeenCalledBefore(after);
        } else expect(after).not.toHaveBeenCalled();
      },
    ),
  );
});

it("accepts exactly the up face of a block that is not own", () => {
  fc.assert(
    fc.property(
      position,
      fc.constantFrom<BlockFace>(
        "up",
        "down",
        "north",
        "south",
        "east",
        "west",
      ),
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

it("checks only the requested column against the gear's refused spaces", () => {
  const obstructions = fc.array(
    fc.record({
      nonAir: fc.boolean(),
      vehicle: fc.boolean(),
      camp: fc.boolean(),
    }),
    { minLength: 4, maxLength: 4 },
  );
  fc.assert(
    fc.property(position, specArbitrary, obstructions, (base, spec, layers) => {
      const fake = fixture();
      for (const [dy, layer] of layers.entries()) {
        const key = cellKey({ ...base, y: base.y + dy });
        if (layer.nonAir) fake.nonAir.add(key);
        if (layer.vehicle) fake.vehicle.add(key);
        if (layer.camp) fake.camp.add(key);
      }
      const column = layers.slice(0, spec.clearance);
      expect(
        hasClearance(fake.world, dimension, base, spec.clearance, spec.refuses),
      ).toBe(
        column.every(
          ({ nonAir, vehicle, camp }) =>
            !nonAir &&
            !(vehicle && spec.refuses.includes("vehicle")) &&
            !(camp && spec.refuses.includes("camp")),
        ),
      );
      expect(hasClearance(fake.world, dimension, base, spec.clearance)).toBe(
        column.every(({ nonAir, vehicle }) => !nonAir && !vehicle),
      );
    }),
  );
});

it("rejects blocked clearance or nearby items before payment and spawn", () => {
  fc.assert(
    fc.property(
      commandArbitrary,
      specArbitrary,
      fc.boolean(),
      (cmd, spec, creative) => {
        for (const reason of ["nonAir", "vehicle", "camp", "near"] as const) {
          for (let dy = 1; dy <= spec.clearance; dy++) {
            const fake = fixture(creative);
            if (reason === "near") fake.item.isNear.mockReturnValue(true);
            else
              fake[reason].add(cellKey({ ...cmd.block, y: cmd.block.y + dy }));
            const allowed =
              (reason === "camp" || reason === "vehicle") &&
              !spec.refuses.includes(reason);
            expect(placeOnGround(fake.world, spec, cmd, fake.item)).toBe(
              allowed,
            );
            if (allowed) continue;
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
            const yaw = snapYaw(cmd.yaw, spec.yawStep);
            expect(item.spawn).toHaveBeenCalledWith(dimension, at, yaw);
            expect(Math.abs(yaw % spec.yawStep)).toBe(0);
            const delta = ((((yaw - cmd.yaw) % 360) + 540) % 360) - 180;
            expect(Math.abs(delta)).toBeLessThanOrEqual(spec.yawStep / 2);
          }
        }
      }
    }),
  );
});
