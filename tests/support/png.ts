import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { expect } from "vitest";

// Decodes the unfiltered 8-bit RGBA PNGs that tools/gen_*.py and render_preview.py write; any
// other encoding fails the calling test.
export function readRgbaPng(path: string) {
  const png = readFileSync(path);
  expect(png.subarray(0, 8)).toEqual(
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  );
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  expect(png[24]).toBe(8);
  expect(png[25]).toBe(6);
  const idat: Buffer[] = [];
  for (let pos = 8; pos < png.length; ) {
    const length = png.readUInt32BE(pos);
    if (png.toString("ascii", pos + 4, pos + 8) === "IDAT") {
      idat.push(png.subarray(pos + 8, pos + 8 + length));
    }
    pos += length + 12;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * 4;
  expect(raw.length).toBe(height * (stride + 1));
  const pixels = Buffer.concat(
    Array.from({ length: height }, (_, y) => {
      const start = y * (stride + 1);
      expect(raw[start]).toBe(0);
      return raw.subarray(start + 1, start + 1 + stride);
    }),
  );
  return { width, height, pixels };
}
