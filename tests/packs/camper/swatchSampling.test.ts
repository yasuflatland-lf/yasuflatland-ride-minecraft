import { expect, it } from "vitest";
import { defined } from "../../support/defined";
import { baseOrigin, bones, registry, swatchName } from "./helpers";

it("keeps the packed camper atlas within the texture budget", () => {
  for (const side of registry.layoutSize)
    expect(side).toBeLessThanOrEqual(2048);
  expect(registry.atlasWidth).toBeGreaterThanOrEqual(100);
  expect(registry.atlasWidth).toBeLessThanOrEqual(130);
  expect(registry.cell).toBe(8);
  expect(registry.inset).toBe(2);
  expect(registry.columns).toBe(14);
});

it("samples only the inset of each swatch used by a camper cube face", () => {
  const { cell, inset } = registry;
  const [baseU, baseV] = baseOrigin;
  let sampledFaces = 0;
  for (const bone of bones) {
    for (const [index, cube] of (bone.cubes ?? []).entries()) {
      for (const [side, face] of Object.entries(cube.uv)) {
        const name = swatchName(face);
        if (name === undefined) continue;
        const label = `${bone.name} cube ${index} ${side} (${name})`;
        const {
          origin: [x, y],
          sampleRect: [, , width, height],
        } = defined(registry.swatches[name], label);
        const [u, v] = face.uv;
        const [du, dv] = face.uv_size;
        expect([width, height], label).toEqual([4, 4]);
        expect(face.uv_size, label).toEqual([width, height]);
        expect(u, label).toBeGreaterThanOrEqual(baseU + x + inset);
        expect(v, label).toBeGreaterThanOrEqual(baseV + y + inset);
        expect(u + du, label).toBeLessThanOrEqual(baseU + x + cell - inset);
        expect(v + dv, label).toBeLessThanOrEqual(baseV + y + cell - inset);
        sampledFaces++;
      }
    }
  }
  expect(sampledFaces).toBeGreaterThan(0);
});
