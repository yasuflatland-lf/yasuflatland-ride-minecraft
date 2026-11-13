import { describe, expect, it } from "vitest";
import { readPng } from "./helpers";

describe("camper model assets (ADR 0067)", () => {
  it("generates a 16 by 16 RGBA item icon with transparency", () => {
    const icon = readPng("textures/items/yasu_ride/camper_item");
    expect([icon.width, icon.height]).toEqual([16, 16]);
    expect(icon.pixels.subarray(0, 16 * 4)).toEqual(Buffer.alloc(16 * 4));
    expect(icon.pixels.subarray((3 * 16 + 2) * 4, (3 * 16 + 3) * 4)).toEqual(
      Buffer.from([238, 235, 226, 255]),
    );
  });

  it("generates a 16 by 16 RGBA camping gear box icon with transparency", () => {
    const icon = readPng("textures/items/yasu_ride/camping_gear_box");
    expect([icon.width, icon.height]).toEqual([16, 16]);
    expect(icon.pixels.subarray(0, 16 * 4)).toEqual(Buffer.alloc(16 * 4));
    expect(icon.pixels.subarray((3 * 16 + 2) * 4, (3 * 16 + 3) * 4)).toEqual(
      Buffer.from([222, 184, 135, 255]),
    );
    expect(icon.pixels.subarray((9 * 16 + 8) * 4, (9 * 16 + 9) * 4)).toEqual(
      Buffer.from([204, 85, 0, 255]),
    );
  });
});
