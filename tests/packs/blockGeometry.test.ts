// The client draws a block geometry wrongly in two ways that no block-type
// check can see, both measured in game on BDS 1.26.52 (#410): a geometry
// without cubes hides every custom-geometry block in its chunk (F1), and a
// geometry whose lowest cube is above y 0 renders as an unshaped full block
// (F2). These checks walk every block file, so new blocks are covered.
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type Json, jsonFileEntries, jsonFiles } from "../support/packFiles";

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const RP = join(REPO_ROOT, "packs/yasu_ride_rp");
const BP = join(REPO_ROOT, "packs/yasu_ride_bp");

const HIDDEN_CUBE_GEOMETRY = "geometry.yasu_ride.deck_floor";
const HIDDEN_CUBE_REFERENCE = {
  identifier: HIDDEN_CUBE_GEOMETRY,
  bone_visibility: { root: false },
};
const INVISIBLE_BLOCKS = [
  "camper_bed",
  "camper_ceiling",
  "camper_door",
  "camper_floor",
  "camper_furniture",
  "camper_shower_toilet",
  "camper_wall",
  "deck_floor",
].map((name) => `blocks/yasu_ride/${name}.block.json`);

type Cube = { origin: number[] };
type GeometryReference = string | { identifier: string };

interface BlockGeometry {
  path: string;
  reference: GeometryReference;
  identifier: string;
}

function identifierOf(reference: GeometryReference): string {
  return typeof reference === "string" ? reference : reference.identifier;
}

function blockGeometries(): BlockGeometry[] {
  const geometries: BlockGeometry[] = [];
  for (const { path, json } of jsonFileEntries(join(BP, "blocks"))) {
    const block = json["minecraft:block"] as Json;
    const permutations =
      (block.permutations as { components?: Json }[] | undefined) ?? [];
    const componentSets = [
      block.components as Json | undefined,
      ...permutations.map((permutation) => permutation.components),
    ];
    for (const components of componentSets) {
      const reference = components?.["minecraft:geometry"] as
        | GeometryReference
        | undefined;
      if (reference === undefined) continue;
      geometries.push({
        path: `blocks/${path}`,
        reference,
        identifier: identifierOf(reference),
      });
    }
  }
  return geometries;
}

function modelCubes(): Map<string, Cube[]> {
  const cubes = new Map<string, Cube[]>();
  for (const file of jsonFiles(join(RP, "models"))) {
    const geometries = (file["minecraft:geometry"] as Json[] | undefined) ?? [];
    for (const geometry of geometries) {
      const description = geometry.description as { identifier: string };
      const bones = (geometry.bones as { cubes?: Cube[] }[] | undefined) ?? [];
      cubes.set(
        description.identifier,
        bones.flatMap((bone) => bone.cubes ?? []),
      );
    }
  }
  return cubes;
}

function lowestY(cubes: Cube[]): number {
  return Math.min(...cubes.map((cube) => cube.origin[1] ?? 0));
}

const blocks = blockGeometries();
const models = modelCubes();

describe("block geometries (ADR 0101)", () => {
  it("finds the blocks to check", () => {
    expect(blocks.length).toBeGreaterThanOrEqual(27);
  });

  it("names a geometry that exists and has at least one cube (F1)", () => {
    for (const { path, identifier } of blocks) {
      const cubes = models.get(identifier);
      expect(cubes, `${path} names ${identifier}`).toBeDefined();
      expect(cubes?.length, `${path} names ${identifier}`).toBeGreaterThan(0);
    }
  });

  it("starts every block geometry at the bottom of the cell (F2)", () => {
    for (const { path, identifier } of blocks) {
      expect(
        lowestY(models.get(identifier) ?? []),
        `${path} names ${identifier}`,
      ).toBe(0);
    }
  });

  it("hides the cube of every invisible block", () => {
    const hidden = blocks.filter(
      ({ identifier }) => identifier === HIDDEN_CUBE_GEOMETRY,
    );
    for (const { path, reference } of hidden) {
      expect(reference, path).toEqual(HIDDEN_CUBE_REFERENCE);
    }
    expect([...new Set(hidden.map(({ path }) => path))].sort()).toEqual(
      INVISIBLE_BLOCKS,
    );
    const otherBoneVisibility = blocks.filter(
      ({ identifier, reference }) =>
        identifier !== HIDDEN_CUBE_GEOMETRY &&
        typeof reference !== "string" &&
        "bone_visibility" in reference,
    );
    expect(otherBoneVisibility.map(({ path }) => path)).toEqual([]);
  });
});
