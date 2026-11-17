import fc from "fast-check";
import { expect, it } from "vitest";
import {
  chunkString,
  joinChunks,
} from "../../../src/infrastructure/warp/persistence/chunks";

it("round trips arbitrary strings within the requested chunk size", () => {
  fc.assert(
    fc.property(
      fc.string({ unit: "binary", maxLength: 2000 }),
      fc.integer({ min: 1, max: 100_000 }),
      (text, size) => {
        const chunks = chunkString(text, size);
        expect(joinChunks(chunks)).toBe(text);
        expect(chunks.every((chunk) => chunk.length <= size)).toBe(true);
      },
    ),
  );
});

it("round trips empty strings and splits at exact boundaries", () => {
  expect(joinChunks(chunkString("", 1))).toBe("");
  expect(chunkString("abcdef", 2)).toEqual(["ab", "cd", "ef"]);
  expect(chunkString("abcde", 2)).toEqual(["ab", "cd", "e"]);
});

it("rejects sizes that are not positive integers", () => {
  fc.assert(
    fc.property(
      fc.double().filter((size) => !Number.isInteger(size) || size <= 0),
      (size) => {
        expect(() => chunkString("text", size)).toThrow(RangeError);
        expect(() => chunkString("", size)).toThrow(RangeError);
      },
    ),
  );
  for (const size of [0, -1, 0.5, Number.NaN, Infinity, -Infinity]) {
    expect(() => chunkString("", size)).toThrow(RangeError);
  }
});
