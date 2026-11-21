import { existsSync, globSync, readFileSync } from "node:fs";
import { beforeAll, expect, it } from "vitest";
import { type ModelFace, modelFaces } from "../support/modelFaces";
import { readRgbaPng } from "../support/png";
import { GEOMETRY_TEXTURES } from "./coplanarFaces.config";
import { findCoplanarFaces, type Geometry } from "./coplanarFaces.support";

interface Baseline {
  pairs: number;
  cleanBones?: string[];
}

const packs = ["packs/yasu_ride_rp", "packs/yasu_ride_test_rp"];
const models = packs.flatMap((pack) =>
  globSync(`${pack}/**/*.geo.json`)
    .sort()
    .flatMap((file) => {
      const data = JSON.parse(readFileSync(file, "utf8")) as {
        "minecraft:geometry": Geometry[];
      };
      return data["minecraft:geometry"].map((geometry) => ({ pack, geometry }));
    }),
);

beforeAll(() => {
  const missing = models
    .filter(
      ({ geometry }) =>
        !GEOMETRY_TEXTURES[geometry.description.identifier] &&
        modelFaces(geometry).length > 0,
    )
    .map(({ geometry }) => geometry.description.identifier);
  expect(
    missing,
    "Geometries with faces need a GEOMETRY_TEXTURES entry",
  ).toEqual([]);
});

const textures = new Map<string, ReturnType<typeof readRgbaPng>>();
function textureFor(pack: string, path: string) {
  const file = `${pack}/${path}.png`;
  const cached = textures.get(file);
  if (cached) return cached;
  const texture = readRgbaPng(file);
  textures.set(file, texture);
  return texture;
}

const faceLabel = ({ bone, cubeIndex, side }: ModelFace) =>
  `${bone}[${cubeIndex}].${side}`;

for (const { pack, geometry } of models) {
  const { identifier } = geometry.description;
  it(`${identifier} matches its visible coplanar face baseline`, () => {
    const name = identifier.replace(/^geometry\./, "");
    const file = `tests/packs/fixtures/coplanar/${name}.json`;
    const baseline: Baseline = existsSync(file)
      ? JSON.parse(readFileSync(file, "utf8"))
      : { pairs: 0 };
    const texture = GEOMETRY_TEXTURES[identifier];
    const findings = texture
      ? findCoplanarFaces(geometry, textureFor(pack, texture))
      : [];
    const largest = findings
      .sort((a, b) => b.area - a.area)
      .slice(0, 5)
      .map(
        ({ a, b, area }) =>
          `  ${faceLabel(a)} / ${faceLabel(b)} (area ${area.toFixed(6)})`,
      );
    expect(
      findings.length,
      [
        `Baseline ${name}.json = ${JSON.stringify({ pairs: findings.length })}`,
        ...largest,
      ].join("\n"),
    ).toBe(baseline.pairs);

    const cleanBones = new Set(baseline.cleanBones);
    const conflicts = findings
      .filter(({ a, b }) => cleanBones.has(a.bone) || cleanBones.has(b.bone))
      .map(
        ({ a, b, area }) =>
          `${faceLabel(a)} / ${faceLabel(b)} (area ${area.toFixed(6)})`,
      );
    expect(conflicts, "These findings involve bones declared clean").toEqual(
      [],
    );
  });
}
