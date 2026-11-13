import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";
import { defined } from "../../support/defined";
import { startPythonWorker } from "../../support/pythonWorker";
import {
  ALUMINIUM_SLOT,
  baseOrigin,
  bone,
  bones,
  type Cube,
  end,
  geometry,
  loadAtlas,
  readPng,
  swatchUv,
} from "./helpers";

const python = startPythonWorker();
afterAll(() => python.close());
const { width, height, base, regions, period, texelsPerPx, windows } =
  await loadAtlas(python);

describe("camper rib atlas (ADR 0190)", () => {
  it("resolves the nested rib region through base with groove, highlight, and flat bands", () => {
    expect([width, height]).toEqual([
      geometry.description.texture_width,
      geometry.description.texture_height,
    ]);
    expect(regions.find(([name]) => name === "bolt")?.[4]).toBe(1);
    expect(period / texelsPerPx).toBe(2);
    expect(texelsPerPx).toBe(2);
    expect(regions[0]).toEqual([
      "rib",
      base[0],
      base[1] + 1,
      8,
      64 * texelsPerPx,
    ]);
    expect(regions.map(([name]) => name)).toEqual([
      "rib",
      "door_head",
      "door_hinge",
      "door_latch",
      "vent_screws",
      "bolt",
      "mirror_chrome",
    ]);
    for (const [i, [, x, y, w, h]] of regions.entries()) {
      expect(x).toBeGreaterThanOrEqual(base[0]);
      expect(y).toBeGreaterThanOrEqual(base[1] + 1);
      expect(w).toBeGreaterThan(0);
      expect(h).toBeGreaterThan(0);
      expect(x + w).toBeLessThanOrEqual(base[0] + base[2]);
      expect(y + h).toBeLessThanOrEqual(base[1] + base[3]);
      for (const [, ox, oy, ow, oh] of regions.slice(0, i))
        expect(x + w <= ox || ox + ow <= x || y + h <= oy || oy + oh <= y).toBe(
          true,
        );
    }
    const [, x, y, w, h] = defined(regions[0], "rib region");
    expect(h % period).toBe(0);
    const texture = readPng("textures/entity/yasu_ride/camper");
    const [whiteU, whiteV] = swatchUv("white");
    const whiteOffset = (whiteV * width + whiteU) * 4;
    const shell = [...texture.pixels.subarray(whiteOffset, whiteOffset + 3)];
    for (let dy = 0; dy < h; dy++) {
      const phase = dy % period;
      const factor = phase === 0 ? 0.93 : phase === 1 ? 1.05 : 1;
      const expected = [
        ...shell.map((c) => Math.min(255, Math.floor(c * factor + 0.5))),
        255,
      ];
      for (let dx = 0; dx < w; dx++) {
        const offset = ((y + dy) * width + x + dx) * 4;
        expect([...texture.pixels.subarray(offset, offset + 4)]).toEqual(
          expected,
        );
      }
    }
  });

  it("maps only the outward white shell faces on both walls and the door to height-aligned ribs", () => {
    const [, x, y, w, h] = defined(regions[0], "rib region");
    const roofHeight = h / texelsPerPx;
    const sampledRow = (cube: Cube, v: number, worldY: number) =>
      Math.floor(v + (end(cube, 1) - worldY) * texelsPerPx);
    const entries = bones.flatMap((b) =>
      (b.cubes ?? []).flatMap((c) =>
        Object.entries(c.uv)
          .filter(([, f]) => {
            const [u = 0, v = 0] = f.uv;
            return u >= x && u < x + w && v >= y && v < y + h;
          })
          .map(([side, face]) => ({ bone: b.name, cube: c, side, face })),
      ),
    );
    const expectedWallFaces = (side: "west" | "east") =>
      (bone("body").cubes ?? []).filter((cube) => {
        const north = cube.uv.north;
        // The roof slab never passes through rib_sides in tools/gen_camper.py.
        const plainCap =
          cube.size[0] === 48 && cube.origin[1] === 61 && cube.size[1] === 3;
        return (
          !cube.rotation &&
          north?.uv[0] === swatchUv("white")[0] &&
          north.uv[1] === swatchUv("white")[1] &&
          north.uv_size[0] === 1 &&
          north.uv_size[1] === 1 &&
          (side === "west" ? cube.origin[0] === -24 : end(cube, 0) === 24) &&
          !plainCap
        );
      }).length;
    expect(
      entries.filter((e) => e.bone === "body" && e.side === "west"),
    ).toHaveLength(expectedWallFaces("west"));
    expect(
      entries.filter((e) => e.bone === "body" && e.side === "east"),
    ).toHaveLength(expectedWallFaces("east"));
    const roof = (bone("body").cubes ?? []).find(
      (c) => c.origin[1] === 61 && c.size[1] === 3 && c.size[0] === 48,
    );
    expect(roof).toBeDefined();
    for (const face of Object.values(roof?.uv ?? {}))
      expect(face.uv[1]).toBe(baseOrigin[1]);
    expect(new Set(entries.map((e) => e.bone))).toEqual(
      new Set(["body", "door_entry"]),
    );
    expect(
      entries.filter((e) => e.bone === "door_entry").map((e) => e.side),
    ).toEqual(["west"]);
    fc.assert(
      fc.property(
        fc.shuffledSubarray(entries, {
          minLength: entries.length,
          maxLength: entries.length,
        }),
        (faces) => {
          for (const { cube, side, face } of faces) {
            const [u = 0, v = 0] = face.uv;
            const [du = 0, dv = 0] = face.uv_size;
            const y0 = cube.origin[1] ?? 0;
            const height = cube.size[1] ?? 0;
            expect(u).toBeGreaterThanOrEqual(x);
            expect(v).toBeGreaterThanOrEqual(y);
            expect(du).toBeGreaterThan(0);
            expect(dv).toBeGreaterThan(0);
            expect(u + du).toBeLessThanOrEqual(x + w);
            expect(v + dv).toBeLessThanOrEqual(y + h);
            expect(v - y).toBeCloseTo(
              (roofHeight - (y0 + height)) * texelsPerPx,
              8,
            );
            expect(dv).toBeCloseTo(height * texelsPerPx, 8);
            const worldHeights = [0.137, 0.513, 0.879].map(
              (fraction) => y0 + fraction * height,
            );
            for (
              let step = Math.floor(y0 * texelsPerPx);
              step < (y0 + height) * texelsPerPx;
              step++
            ) {
              const worldY = (step + 0.5) / texelsPerPx;
              if (worldY > y0 && worldY < y0 + height)
                worldHeights.push(worldY);
            }
            for (const worldY of worldHeights)
              expect(sampledRow(cube, v, worldY)).toBe(
                Math.floor(y + (roofHeight - worldY) * texelsPerPx),
              );
            const edge =
              side === "west"
                ? (cube.origin[0] ?? 0)
                : (cube.origin[0] ?? 0) + (cube.size[0] ?? 0);
            expect(edge).toBe(side === "west" ? -24 : 24);
            expect(cube.rotation).toBeUndefined();
            for (const [other, f] of Object.entries(cube.uv)) {
              if (f.uv[1] === baseOrigin[1])
                expect(f).toEqual({ uv: swatchUv("white"), uv_size: [1, 1] });
              else expect(["east", "west"]).toContain(other);
            }
          }
        },
      ),
      { numRuns: 10 },
    );
    const overlaps = entries.flatMap((a, i) =>
      entries.slice(i + 1).flatMap((b) => {
        const plane = (entry: typeof a) =>
          entry.side === "west"
            ? (entry.cube.origin[0] ?? 0)
            : end(entry.cube, 0);
        if (a.side !== b.side || plane(a) !== plane(b)) return [];
        const bottom = Math.max(a.cube.origin[1] ?? 0, b.cube.origin[1] ?? 0);
        const top = Math.min(end(a.cube, 1), end(b.cube, 1));
        const front = Math.max(a.cube.origin[2] ?? 0, b.cube.origin[2] ?? 0);
        const rear = Math.min(end(a.cube, 2), end(b.cube, 2));
        return bottom < top && front < rear ? [{ a, b, bottom, top }] : [];
      }),
    );
    expect(overlaps.length).toBeGreaterThan(0);
    fc.assert(
      fc.property(
        fc.double({ min: 0.1, max: 0.9, noNaN: true }),
        (fraction) => {
          for (const { a, b, bottom, top } of overlaps) {
            const worldY = bottom + fraction * (top - bottom);
            expect(sampledRow(a.cube, a.face.uv[1] ?? 0, worldY) % 2).toBe(
              sampledRow(b.cube, b.face.uv[1] ?? 0, worldY) % 2,
            );
          }
        },
      ),
      { numRuns: 10 },
    );
  });
  const required = <T>(value: T | undefined): T =>
    defined(value, "camper trim");
  const regionFace = (name: string) => {
    const [, x, y, w, h] = required(regions.find(([n]) => n === name));
    return { uv: [x, y], uv_size: [w, h] };
  };

  it("uses aluminium door frames with head, hinge, and latch hardware on the outward face", () => {
    const frames = (bone("door_entry").cubes ?? []).filter(
      // The latch plate and the window's corner rows share this depth but are far smaller.
      (c) =>
        c.origin[0] === -24.18 &&
        c.size[0] === 0.18 &&
        Math.max(c.size[1] ?? 0, c.size[2] ?? 0) > 5,
    );
    expect(frames).toHaveLength(4);
    for (const c of frames)
      expect(c.uv.north?.uv).toEqual(swatchUv("aluminium"));
    for (const [name, y, z] of [
      ["door_head", 49, -4.6],
      ["door_hinge", 36, -4.6],
      ["door_latch", 36, 4],
    ] as const) {
      const frame = required(
        frames.find((c) => c.origin[1] === y && c.origin[2] === z),
      );
      expect(frame.uv.west).toEqual(regionFace(name));
    }
  });

  it("uses beige side window frames, black cab frames, and aluminium mullions", () => {
    for (const [side, sideWindows] of windows.entries()) {
      for (const [index, window] of sideWindows.entries()) {
        const [z0, z1, y0, y1] = window;
        const frames = (bone("body").cubes ?? []).filter(
          (c) =>
            c.size[0] === 0.15 &&
            Math.abs((c.origin[0] ?? 0) - (side === 0 ? -24.15 : 24)) < 1e-6 &&
            (c.origin[2] ?? 0) >= required(z0) - 0.601 &&
            (c.origin[2] ?? 0) + (c.size[2] ?? 0) <= required(z1) + 0.601 &&
            (c.origin[1] ?? 0) >= required(y0) - 0.601 &&
            (c.origin[1] ?? 0) + (c.size[1] ?? 0) <= required(y1) + 0.601,
        );
        expect(frames).toHaveLength(4);
        for (const c of frames)
          for (const face of Object.values(c.uv))
            expect(face.uv).toEqual(
              swatchUv(index === 0 ? "black" : "trim_beige"),
            );
      }
    }
    for (const z of [-22.8, -17.3]) {
      const mullion = required(
        (bone("body").cubes ?? []).find(
          (c) => c.origin[2] === z && c.size[0] === 0.2 && c.size[1] === 13,
        ),
      );
      expect(mullion.uv.north?.uv).toEqual(swatchUv("aluminium"));
    }
  });

  it("puts a screw row on the aluminium vent upper rail", () => {
    const rail = required(
      (bone("body").cubes ?? []).find(
        (c) =>
          c.origin[0] === -24.5 && c.origin[1] === 47.8 && c.origin[2] === 41.2,
      ),
    );
    expect(rail.uv.north?.uv).toEqual(swatchUv("aluminium"));
    expect(rail.uv.west).toEqual(regionFace("vent_screws"));
  });

  it("paints the exact dark hardware pattern over aluminium in each region", () => {
    const texture = readPng("textures/entity/yasu_ride/camper");
    const [aluminiumU, aluminiumV] = swatchUv("aluminium");
    const aluminiumOffset = (aluminiumV * width + aluminiumU) * 4;
    const aluminium = [
      ...texture.pixels.subarray(aluminiumOffset, aluminiumOffset + 3),
    ];
    const light = [...aluminium, 255];
    const dark = [...aluminium.map((c) => Math.floor(c * 0.65 + 0.5)), 255];
    const patterns: Record<
      string,
      (dx: number, dy: number, h: number) => boolean
    > = {
      door_head: (_dx, dy, h) => dy === h - 1,
      door_hinge: (_dx, dy) => [5, 6, 19, 20].includes(dy),
      door_latch: (dx, dy) => dx === 1 && [10, 11].includes(dy),
      vent_screws: (dx, dy) => dy === 1 && [2, 7, 12].includes(dx),
    };
    for (const [name, isDark] of Object.entries(patterns)) {
      const [, x, y, w, h] = required(regions.find(([n]) => n === name));
      let darkCount = 0;
      let lightCount = 0;
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          const hardware = isDark(dx, dy, h);
          const offset = ((y + dy) * width + x + dx) * 4;
          expect([...texture.pixels.subarray(offset, offset + 4)]).toEqual(
            hardware ? dark : light,
          );
          if (hardware) darkCount++;
          else lightCount++;
        }
      }
      expect(darkCount).toBeGreaterThan(0);
      expect(lightCount).toBeGreaterThan(0);
    }
  });

  it("preserves hardware pixels in lit textures and keeps their MER non-emissive", () => {
    const base = readPng("textures/entity/yasu_ride/camper");
    const lit = readPng("textures/entity/yasu_ride/camper_lit");
    const mer = readPng("textures/entity/yasu_ride/camper_lit_mer");
    for (const [, x, y, w, h] of regions)
      for (let dy = 0; dy < h; dy++)
        for (let dx = 0; dx < w; dx++) {
          const offset = ((y + dy) * width + x + dx) * 4;
          expect(lit.pixels.subarray(offset, offset + 4)).toEqual(
            base.pixels.subarray(offset, offset + 4),
          );
          expect([...mer.pixels.subarray(offset, offset + 4)]).toEqual([
            0, 0, 255, 255,
          ]);
        }
  });
});

describe("camper aluminium roof edges", () => {
  it("maps bolts only to the three outer edge faces and preserves lamp swatches and bezels", () => {
    const [, boltX, boltY, boltWidth, boltHeight] = defined(
      regions.find(([name]) => name === "bolt"),
      "bolt region",
    );
    expect(boltX).toBe(baseOrigin[0]);
    expect(boltHeight).toBe(1);
    const cubes = bones.flatMap((b) => b.cubes ?? []);
    const edges = cubes.filter((c) =>
      Object.values(c.uv).some((f) => f.uv[1] === boltY),
    );
    expect(edges).toHaveLength(2);
    // No rail crosses the front: only the two side rails carry bolts.
    expect(edges.every((c) => c.size[0] === 0.4)).toBe(true);
    for (const c of edges) {
      const outer = defined(c.origin[0], "edge x") < 0 ? "west" : "east";
      const width = defined(c.size[2], "edge width");
      expect(c.origin[1]).toBe(63.4);
      expect(c.size.slice(0, 2)).toEqual([0.4, 0.6]);
      expect(c.origin[0]).toBe(outer === "west" ? -24.4 : 24);
      for (const [face, uv] of Object.entries(c.uv))
        expect(uv).toEqual(
          face === outer
            ? { uv: [boltX, boltY], uv_size: [width, 1] }
            : { uv: [ALUMINIUM_SLOT, baseOrigin[1]], uv_size: [1, 1] },
        );
    }
    for (const [name, slots] of [
      ["headlights", [14, 34, 35]],
      ["ceiling_lights", [10, 33]],
    ] as const) {
      const lamps = bone(name).cubes ?? [];
      expect(lamps.length).toBeGreaterThan(0);
      for (const c of lamps)
        for (const face of Object.values(c.uv)) {
          expect(slots as readonly number[]).toContain(
            (face.uv[0] ?? -1) - baseOrigin[0],
          );
          expect(face.uv[1]).toBe(baseOrigin[1]);
          expect(face.uv_size).toEqual([1, 1]);
        }
    }
    const bezels = cubes.filter(
      (c) => c.origin[1] === 63.9 && c.size[1] === 0.2 && c.size[2] === 1.2,
    );
    expect(bezels).toHaveLength(5);
    for (const c of bezels)
      for (const face of Object.values(c.uv))
        expect(face).toEqual({ uv: swatchUv("chrome"), uv_size: [1, 1] });
    const texture = readPng("textures/entity/yasu_ride/camper");
    expect(texture.height).toBeGreaterThanOrEqual(boltY + boltHeight);
    expect(boltWidth).toBe(base[2]);
    expect(base[2]).toBe(
      Math.ceil(Math.max(...edges.map((c) => c.size[2] ?? 0))),
    );
    for (let x = 0; x < boltWidth; x++) {
      const offset = (boltY * texture.width + boltX + x) * 4;
      expect([...texture.pixels.subarray(offset, offset + 4)]).toEqual(
        x % 6 === 0 ? [109, 111, 109, 255] : [168, 170, 168, 255],
      );
    }
  });
});
