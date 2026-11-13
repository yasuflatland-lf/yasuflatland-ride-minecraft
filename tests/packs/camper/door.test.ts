import { describe, expect, it } from "vitest";
import { bone, swatch } from "./helpers";

describe("camper model assets (ADR 0067)", () => {
  it("aligns both entry handles half a pixel below the stripe (#596)", () => {
    const door = bone("door_entry");
    expect(door.pivot).toEqual([-24, 0, -7]);
    const handles = (door.cubes ?? []).filter(
      (c) => swatch(c, "chrome") && c.origin[2] === 4.5 && c.size[2] === 1.5,
    );
    expect(handles).toHaveLength(2);
    expect(handles.map((c) => c.origin[0] ?? 0).sort((a, b) => a - b)).toEqual([
      -24.6, -23,
    ]);
    for (const c of handles) {
      expect(c.origin[1]).toBe(28);
      expect(c.size).toEqual([0.6, 1, 1.5]);
    }
    const stripe = (door.cubes ?? []).filter((c) => swatch(c, "stripe"));
    expect(stripe).toHaveLength(1);
    expect(stripe[0]?.origin[1]).toBe(29.5);
  });
});
