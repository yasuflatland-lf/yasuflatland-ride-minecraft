import fc from "fast-check";
import { expect, it } from "vitest";
import { contains, volume } from "../../../src/domain/build/box";
import {
  fillChunks,
  isStructureTooLarge,
  structureIdentifier,
  structureOffset,
} from "../../../src/infrastructure/build/bedrock/structureGeometry";

const boxArb = fc
  .record({
    x: fc.integer({ min: -1000, max: 1000 }),
    y: fc.integer({ min: -1000, max: 1000 }),
    z: fc.integer({ min: -1000, max: 1000 }),
    dx: fc.integer({ min: 1, max: 130 }),
    dy: fc.integer({ min: 1, max: 520 }),
    dz: fc.integer({ min: 1, max: 130 }),
  })
  .map(({ x, y, z, dx, dy, dz }) => ({
    min: { x, y, z },
    max: { x: x + dx - 1, y: y + dy - 1, z: z + dz - 1 },
  }));

it("partitions every box exactly into disjoint fill-sized chunks", () => {
  fc.assert(
    fc.property(boxArb, (box) => {
      const chunks = [...fillChunks(box)];
      expect(chunks.reduce((sum, chunk) => sum + volume(chunk), 0)).toBe(
        volume(box),
      );
      for (const [i, chunk] of chunks.entries()) {
        expect(volume(chunk)).toBeGreaterThan(0);
        expect(volume(chunk)).toBeLessThanOrEqual(32_768);
        expect(contains(box, chunk.min) && contains(box, chunk.max)).toBe(true);
        for (const other of chunks.slice(i + 1)) {
          expect(
            chunk.max.x < other.min.x ||
              other.max.x < chunk.min.x ||
              chunk.max.y < other.min.y ||
              other.max.y < chunk.min.y ||
              chunk.max.z < other.min.z ||
              other.max.z < chunk.min.z,
          ).toBe(true);
        }
      }
    }),
  );
});

it("classifies inclusive axis lengths independently of location and volume", () => {
  fc.assert(
    fc.property(boxArb, (box) => {
      expect(isStructureTooLarge(box)).toBe(
        box.max.x - box.min.x >= 64 ||
          box.max.y - box.min.y >= 384 ||
          box.max.z - box.min.z >= 64,
      );
    }),
  );
});

it("accepts axis limits and refuses lengths beyond them", () => {
  const min = { x: 0, y: 0, z: 0 };
  expect(isStructureTooLarge({ min, max: { x: 0, y: 383, z: 0 } })).toBe(false);
  expect(isStructureTooLarge({ min, max: { x: 0, y: 384, z: 0 } })).toBe(true);
  expect(isStructureTooLarge({ min, max: { x: 63, y: 0, z: 0 } })).toBe(false);
  expect(isStructureTooLarge({ min, max: { x: 64, y: 0, z: 0 } })).toBe(true);
  expect(isStructureTooLarge({ min, max: { x: 0, y: 0, z: 63 } })).toBe(false);
  expect(isStructureTooLarge({ min, max: { x: 0, y: 0, z: 64 } })).toBe(true);
});

const ownerArb = fc
  .array(fc.integer({ min: 0, max: 65535 }), { maxLength: 40 })
  .map((units) => String.fromCharCode(...units));
const pairArb = fc.tuple(
  ownerArb,
  fc.integer({ min: 1, max: Number.MAX_SAFE_INTEGER }),
);
it("encodes arbitrary UTF-16 player IDs injectively with a safe grammar", () => {
  fc.assert(
    fc.property(pairArb, pairArb, ([a, n], [b, m]) => {
      const first = structureIdentifier(a, n);
      expect(first).toMatch(/^yasu_build:[a-z0-9_]+$/);
      expect(first === structureIdentifier(b, m)).toBe(a === b && n === m);
    }),
  );
});

it("keeps negative player IDs distinct from literal n and separator characters", () => {
  const owners = ["-4294967295", "n4294967295", "_", "", "a_1", "A", "a"];
  expect(
    new Set(owners.map((owner) => structureIdentifier(owner, 1))).size,
  ).toBe(owners.length);
});

it("maps every cell of a box to a distinct structure offset inside its size", () => {
  fc.assert(
    fc.property(
      boxArb.filter((box) => volume(box) <= 4096),
      fc.nat(),
      (box, pick) => {
        const size = {
          x: box.max.x - box.min.x + 1,
          y: box.max.y - box.min.y + 1,
          z: box.max.z - box.min.z + 1,
        };
        const cell = {
          x: box.min.x + (pick % size.x),
          y: box.min.y + (Math.floor(pick / size.x) % size.y),
          z: box.min.z + (Math.floor(pick / (size.x * size.y)) % size.z),
        };
        expect(contains(box, cell)).toBe(true);
        const offset = structureOffset(box, cell);
        for (const axis of ["x", "y", "z"] as const) {
          expect(offset[axis]).toBeGreaterThanOrEqual(0);
          expect(offset[axis]).toBeLessThan(size[axis]);
          expect(box.min[axis] + offset[axis]).toBe(cell[axis]);
        }
      },
    ),
  );
});
