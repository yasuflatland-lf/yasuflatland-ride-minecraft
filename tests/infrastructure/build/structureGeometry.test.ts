import fc from "fast-check";
import { expect, it } from "vitest";
import { contains, volume } from "../../../src/domain/build/box";
import {
  fillChunks,
  isStructureTooLarge,
  structureIdentifier,
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
          box.max.y - box.min.y >= 256 ||
          box.max.z - box.min.z >= 64,
      );
    }),
  );
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
