import fc from "fast-check";
import { expect, it } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { boxOf, sizeOf, volume } from "../../../src/domain/build/box";
import { anchorCornerOf } from "../../../src/domain/build/clipboard/anchorCorner";
import {
  type Clipboard,
  clipboardOf,
  pasteTarget,
} from "../../../src/domain/build/clipboard/clipboard";
import {
  FACINGS,
  turnBetween,
} from "../../../src/domain/build/rotation/facing";
import type { QuarterTurn } from "../../../src/domain/build/rotation/quarterTurn";
import { selectionOf } from "../../../src/domain/build/selection";
import { structureHandle } from "../../../src/domain/build/structure/handle";
import {
  anchorCell,
  type BlockFace,
} from "../../../src/domain/shared/blockFace";
import { cellOf } from "../../../src/domain/shared/cells";
import { asDimensionId } from "../../../src/domain/shared/ids";
import { structureClipboard } from "../../support/buildClipboard";

const faces: readonly BlockFace[] = [
  "up",
  "down",
  "north",
  "south",
  "east",
  "west",
];
const face = fc.constantFrom(...faces);
const coordinate = fc.integer();
const cell = fc
  .record({ x: coordinate, y: coordinate, z: coordinate })
  .map(cellOf);
const dimension = fc.integer({ min: 1, max: 32 });
const clipboard: fc.Arbitrary<Clipboard> = fc
  .record({ x: dimension, y: dimension, z: dimension })
  .map((size) =>
    structureClipboard(
      boxOf(
        cellOf({ x: 0, y: 0, z: 0 }),
        cellOf({ x: size.x - 1, y: size.y - 1, z: size.z - 1 }),
      ),
    ),
  );

it("builds the same clipboard as the copy and cut literals", () => {
  fc.assert(
    fc.property(
      cell,
      cell,
      fc.constantFrom(...FACINGS),
      fc.constantFrom("minecraft:stone", "minecraft:dirt"),
      fc.uuid(),
      (a, b, facing, materialId, rawHandle) => {
        const box = boxOf(a, b);
        const material = blockStateOf(materialId);
        const selection = selectionOf(
          asDimensionId("minecraft:overworld"),
          box,
          material,
        );
        const handle = structureHandle(rawHandle);
        expect(clipboardOf({ selection, facing, handle })).toStrictEqual({
          anchor: anchorCornerOf(box, undefined, facing),
          material,
          facing,
          size: sizeOf(box),
          blockCount: volume(box),
          contents: { kind: "structure", handle },
        });
      },
    ),
  );
});

it("four facings give distinct turns, preserve volume and swap horizontal extents on odd turns", () => {
  fc.assert(
    fc.property(
      clipboard,
      fc.constantFrom(...FACINGS),
      cell,
      face,
      (copied, facing, block, face) => {
        const clip = { ...copied, facing };
        const original = pasteTarget(
          clip,
          block,
          face,
          turnBetween(clip.facing, "east"),
        );
        const turns = new Set<number>();
        for (const facing of FACINGS) {
          const turn = turnBetween(clip.facing, facing);
          turns.add(turn);
          const target = pasteTarget(
            clip,
            block,
            face,
            turnBetween(clip.facing, facing),
          );
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
      fc.constantFrom<BlockFace>("up", "down"),
      (clip, block, face) => {
        const { anchor, box } = pasteTarget(
          clip,
          block,
          face,
          turnBetween(clip.facing, "east"),
        );
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
          boxOf(
            anchor,
            cellOf({
              x: anchor.x + clip.size.x - 1,
              y: anchor.y + clip.size.y - 1,
              z: anchor.z + clip.size.z - 1,
            }),
          ),
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

it("uses the explicit turn for the footprint independently of the facing", () => {
  fc.assert(
    fc.property(
      clipboard,
      cell,
      face,
      fc.constantFrom<QuarterTurn>(0, 1, 2, 3),
      (clip, block, face, turn) => {
        const target = pasteTarget(clip, block, face, turn);
        const near = anchorCell(block, face);
        expect(target.corner).toEqual(near);
        for (const axis of ["x", "y", "z"] as const) {
          expect(target.box.min[axis]).toBeLessThanOrEqual(near[axis]);
          expect(target.box.max[axis]).toBeGreaterThanOrEqual(near[axis]);
          expect(target.anchor[axis]).toBeGreaterThanOrEqual(
            target.box.min[axis],
          );
          expect(target.anchor[axis]).toBeLessThanOrEqual(target.box.max[axis]);
        }
        expect(target.turn).toBe(turn);
        expect(target.box.max.x - target.box.min.x + 1).toBe(
          turn % 2 ? clip.size.z : clip.size.x,
        );
        expect(target.box.max.z - target.box.min.z + 1).toBe(
          turn % 2 ? clip.size.x : clip.size.z,
        );
        expect(target.box.max.y - target.box.min.y + 1).toBe(clip.size.y);
      },
    ),
  );
});
