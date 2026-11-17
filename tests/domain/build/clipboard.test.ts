import fc from "fast-check";
import { expect, it } from "vitest";
import type { Face } from "../../../src/domain/build/aim/face";
import { boxOf, volume } from "../../../src/domain/build/box";
import {
  aimedPasteTarget,
  type Clipboard,
  pasteTarget,
} from "../../../src/domain/build/clipboard/clipboard";
import {
  FACINGS,
  turnBetween,
} from "../../../src/domain/build/rotation/facing";
import { structureClipboard } from "../../support/buildClipboard";

const faces: readonly Face[] = ["up", "down", "north", "south", "east", "west"];
const face = fc.constantFrom(...faces);
const coordinate = fc.integer();
const cell = fc.record({ x: coordinate, y: coordinate, z: coordinate });
const dimension = fc.integer({ min: 1, max: 32 });
const clipboard: fc.Arbitrary<Clipboard> = fc
  .record({ x: dimension, y: dimension, z: dimension })
  .map((size) =>
    structureClipboard(
      boxOf(
        { x: 0, y: 0, z: 0 },
        { x: size.x - 1, y: size.y - 1, z: size.z - 1 },
      ),
    ),
  );

it("four facings give distinct turns, preserve volume and swap horizontal extents on odd turns", () => {
  fc.assert(
    fc.property(
      clipboard,
      fc.constantFrom(...FACINGS),
      cell,
      face,
      (copied, facing, block, face) => {
        const clip = { ...copied, facing };
        const original = pasteTarget(clip, block, face, "east");
        const turns = new Set<number>();
        for (const facing of FACINGS) {
          const turn = turnBetween(clip.facing, facing);
          turns.add(turn);
          const target = pasteTarget(clip, block, face, facing);
          expect(volume(target.box)).toBe(volume(original.box));
          expect(target.anchor).toEqual(target.box.min);
          expect(target.turn).toBe(turn);
          expect(target.box.max.x - target.box.min.x + 1).toBe(
            turn % 2 ? clip.size.z : clip.size.x,
          );
          expect(target.box.max.z - target.box.min.z + 1).toBe(
            turn % 2 ? clip.size.x : clip.size.z,
          );
          expect(target.box.max.y - target.box.min.y + 1).toBe(clip.size.y);
          expect(
            aimedPasteTarget(clip, { block: { cell: block, face } }, facing),
          ).toEqual(target);
        }
        expect(turns.size).toBe(4);
      },
    ),
  );
});

it("east-facing vertical-face targets reproduce the original positive-axis box", () => {
  fc.assert(
    fc.property(
      clipboard,
      cell,
      fc.constantFrom<Face>("up", "down"),
      (clip, block, face) => {
        const { anchor, box } = pasteTarget(clip, block, face, "east");
        const offsets = {
          up: { x: 0, y: 1, z: 0 },
          down: { x: 0, y: -1, z: 0 },
          north: { x: 0, y: 0, z: -1 },
          south: { x: 0, y: 0, z: 1 },
          east: { x: 1, y: 0, z: 0 },
          west: { x: -1, y: 0, z: 0 },
        };
        const offset = offsets[face];
        expect(anchor).toEqual({
          x: block.x + offset.x,
          y: block.y + offset.y,
          z: block.z + offset.z,
        });
        expect(box).toEqual(
          boxOf(anchor, {
            x: anchor.x + clip.size.x - 1,
            y: anchor.y + clip.size.y - 1,
            z: anchor.z + clip.size.z - 1,
          }),
        );
        expect({
          x: box.max.x - box.min.x + 1,
          y: box.max.y - box.min.y + 1,
          z: box.max.z - box.min.z + 1,
        }).toEqual(clip.size);
      },
    ),
  );
});

it("aimedPasteTarget is undefined exactly when there is no aimed block", () => {
  fc.assert(
    fc.property(
      clipboard,
      fc.option(fc.record({ cell, face }), { nil: undefined }),
      (clip, block) => {
        const target = aimedPasteTarget(clip, { block }, "east");
        expect(target === undefined).toBe(block === undefined);
        if (block)
          expect(target).toEqual(
            pasteTarget(clip, block.cell, block.face, "east"),
          );
      },
    ),
  );
});
