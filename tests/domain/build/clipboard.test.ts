import fc from "fast-check";
import { expect, it } from "vitest";
import { boxOf, volume } from "../../../src/domain/build/box";
import {
  aimedPasteTarget,
  type Clipboard,
  type Face,
  parseFace,
  pasteTarget,
} from "../../../src/domain/build/clipboard/clipboard";
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

it("every turn preserves volume and minimum corner and swaps horizontal extents on odd turns", () => {
  fc.assert(
    fc.property(clipboard, cell, face, (clip, block, face) => {
      const original = pasteTarget(clip, block, face);
      for (const turn of [0, 1, 2, 3] as const) {
        const target = pasteTarget(clip, block, face, turn);
        expect(volume(target.box)).toBe(volume(original.box));
        expect(target.anchor).toEqual(original.anchor);
        expect(target.box.min).toEqual(original.box.min);
        expect(target.turn).toBe(turn);
        expect(target.box.max.x - target.box.min.x + 1).toBe(
          turn % 2 ? clip.size.z : clip.size.x,
        );
        expect(target.box.max.z - target.box.min.z + 1).toBe(
          turn % 2 ? clip.size.x : clip.size.z,
        );
        expect(target.box.max.y - target.box.min.y + 1).toBe(clip.size.y);
        expect(
          aimedPasteTarget(clip, { block: { cell: block, face } }, turn),
        ).toEqual(target);
      }
    }),
  );
});

it("pasteTarget anchors next to the face and its box preserves the clipboard size", () => {
  fc.assert(
    fc.property(clipboard, cell, face, (clip, block, face) => {
      const { anchor, box } = pasteTarget(clip, block, face);
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
    }),
  );
});

it("aimedPasteTarget is undefined exactly when there is no aimed block", () => {
  fc.assert(
    fc.property(
      clipboard,
      fc.option(fc.record({ cell, face }), { nil: undefined }),
      (clip, block) => {
        const target = aimedPasteTarget(clip, { block });
        expect(target === undefined).toBe(block === undefined);
        if (block)
          expect(target).toEqual(pasteTarget(clip, block.cell, block.face));
      },
    ),
  );
});

it("parseFace round-trips all six faces in any letter case", () => {
  fc.assert(
    fc.property(
      fc.array(fc.boolean(), { minLength: 5, maxLength: 5 }),
      (upper) => {
        for (const face of faces) {
          const mixed = [...face]
            .map((letter, i) => (upper[i] ? letter.toUpperCase() : letter))
            .join("");
          expect(parseFace(mixed)).toBe(face);
        }
      },
    ),
  );
});

it("parseFace rejects every string other than a case-insensitive face", () => {
  fc.assert(
    fc.property(
      fc
        .string()
        .filter((value) => !faces.some((face) => face === value.toLowerCase())),
      (value) => {
        expect(parseFace(value)).toBeUndefined();
      },
    ),
  );
});
