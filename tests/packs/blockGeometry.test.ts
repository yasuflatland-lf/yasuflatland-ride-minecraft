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
  "camper_cabinet_door",
  "camper_ceiling",
  "camper_door",
  "camper_floor",
  "camper_fridge_door",
  "camper_furniture",
  "camper_shower_door",
  "camper_shower_toilet",
  "camper_wall",
  "deck_floor",
  "tent_ceiling",
  "tent_flap",
  "tent_lantern",
  "tent_mattress",
  "tent_wall",
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
    // Besides the hidden cube, only the pair blocks pick bones: the item at each end (ADR 0108),
    // shown on a storage compartment's only while its door is open (ADR 0114, 0123).
    const otherBoneVisibility = blocks.filter(
      ({ identifier, reference }) =>
        identifier !== HIDDEN_CUBE_GEOMETRY &&
        typeof reference !== "string" &&
        "bone_visibility" in reference,
    );
    expect([...new Set(otherBoneVisibility.map(({ path }) => path))]).toEqual(
      PAIR_BLOCKS,
    );
  });
});

// The client checks a block's geometry after its minecraft:transformation, and rejects the
// whole block definition when a permutation leaves no part of it in its own cell on some axis:
// every permutation then renders as the fallback block. Logged in game for #429: "Transformation
// Component error for yasu_ride:toaster_decor[...] : Schematic 'geometry.yasu_ride.toaster' is
// not included within the unit cube on axis x" (ADR 0108). Microsoft Learn's "Advanced Block
// Visuals" states the same limits: at least 1 px on each axis inside the base 16 px block,
// within 30 px of the origin on each axis, and selection_box inside (-8, 0, -8) to (8, 16, 8).
const CELL_MIN = [-8, 0, -8] as const;
const CELL_MAX = [8, 16, 8] as const;
const MIN_INSIDE_PX = 1;
const MAX_REACH_PX = 30;
const PAIR_BLOCKS = [
  "cabinet_decor_pair",
  "fridge_decor_pair",
  "shelf_decor_pair",
  "table_decor_pair",
].map((name) => `blocks/yasu_ride/${name}.block.json`);

type Bounds = { lo: number[]; hi: number[] };
type Box = { origin: number[]; size: number[] };
interface Transformation {
  rotation?: number[];
  translation?: number[];
  scale?: number[];
}

function modelBones(): Map<string, Map<string, Box[]>> {
  const out = new Map<string, Map<string, Box[]>>();
  for (const file of jsonFiles(join(RP, "models"))) {
    for (const geometry of (file["minecraft:geometry"] as Json[] | undefined) ??
      []) {
      const { identifier } = geometry.description as { identifier: string };
      const bones = (geometry.bones as { name: string; cubes?: Box[] }[]) ?? [];
      out.set(identifier, new Map(bones.map((b) => [b.name, b.cubes ?? []])));
    }
  }
  return out;
}

/** The cubes a block can show: every bone not hidden outright; a Molang condition may show it. */
function visibleCubes(
  reference: GeometryReference,
  bones: Map<string, Box[]>,
): Box[] {
  const visibility =
    typeof reference === "string"
      ? {}
      : ((reference as { bone_visibility?: Record<string, unknown> })
          .bone_visibility ?? {});
  return [...bones].flatMap(([name, cubes]) =>
    visibility[name] === false ? [] : cubes,
  );
}

/** The bounds of `cubes` in pixels after the block's turn about the vertical axis and its translation. */
function transformed(cubes: Box[], t: Transformation | undefined): Bounds {
  const [rx = 0, ry = 0, rz = 0] = t?.rotation ?? [];
  expect([rx, rz]).toEqual([0, 0]);
  expect(t?.scale ?? [1, 1, 1]).toEqual([1, 1, 1]);
  const r = (ry * Math.PI) / 180;
  const [tx = 0, ty = 0, tz = 0] = (t?.translation ?? []).map((v) => v * 16);
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (const { origin, size } of cubes)
    for (const dx of [0, 1])
      for (const dy of [0, 1])
        for (const dz of [0, 1]) {
          const x = (origin[0] ?? 0) + dx * (size[0] ?? 0);
          const y = (origin[1] ?? 0) + dy * (size[1] ?? 0);
          const z = (origin[2] ?? 0) + dz * (size[2] ?? 0);
          // Bedrock's block turn by r takes (x, z) to (x cos r + z sin r, z cos r - x sin r).
          const p = [
            x * Math.cos(r) + z * Math.sin(r) + tx,
            y + ty,
            z * Math.cos(r) - x * Math.sin(r) + tz,
          ];
          for (const axis of AXES) {
            lo[axis] = Math.min(lo[axis] ?? Infinity, p[axis] ?? 0);
            hi[axis] = Math.max(hi[axis] ?? -Infinity, p[axis] ?? 0);
          }
        }
  return { lo, hi };
}

/** The axis the client rejects, or undefined when the bounds keep a pixel in the cell on every axis. */
function axisOutsideCell({ lo, hi }: Bounds): string | undefined {
  return AXES.map((axis) => {
    const inside =
      Math.min(hi[axis] ?? 0, CELL_MAX[axis]) -
      Math.max(lo[axis] ?? 0, CELL_MIN[axis]);
    const reach = Math.max(Math.abs(lo[axis] ?? 0), Math.abs(hi[axis] ?? 0));
    return inside < MIN_INSIDE_PX - 1e-9 || reach > MAX_REACH_PX
      ? "xyz"[axis]
      : undefined;
  }).find((a) => a !== undefined);
}

const AXES = [0, 1, 2] as const;

interface BlockState {
  path: string;
  condition: string;
  components: Json;
}

/** Each permutation's components over the block's own, and the block's own for states no permutation matches. */
function blockStates(): BlockState[] {
  return jsonFileEntries(join(BP, "blocks")).flatMap(({ path, json }) => {
    const block = json["minecraft:block"] as Json;
    const base = (block.components as Json | undefined) ?? {};
    const permutations =
      (block.permutations as { condition: string; components?: Json }[]) ?? [];
    return [
      { path: `blocks/${path}`, condition: "(none)", components: base },
      ...permutations.map((p) => ({
        path: `blocks/${path}`,
        condition: p.condition,
        components: { ...base, ...(p.components ?? {}) },
      })),
    ];
  });
}

describe("block bounds the client accepts (ADR 0108)", () => {
  const bones = modelBones();
  const states = blockStates();

  it("keeps every permutation's transformed geometry in its own cell on every axis and within reach", () => {
    let checked = 0;
    for (const { path, condition, components } of states) {
      const reference = components["minecraft:geometry"] as
        | GeometryReference
        | undefined;
      if (reference === undefined) continue;
      const model = bones.get(identifierOf(reference));
      if (model === undefined) continue;
      const cubes = visibleCubes(reference, model);
      if (cubes.length === 0) continue;
      const bounds = transformed(
        cubes,
        components["minecraft:transformation"] as Transformation | undefined,
      );
      expect(axisOutsideCell(bounds), `${path} ${condition}`).toBeUndefined();
      checked++;
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it("keeps every selection box inside the cell", () => {
    for (const { path, condition, components } of states) {
      const box = components["minecraft:selection_box"];
      if (typeof box !== "object" || box === null) continue;
      const { origin = [-8, 0, -8], size = [16, 16, 16] } = box as Partial<Box>;
      for (const axis of AXES) {
        expect(origin[axis], `${path} ${condition}`).toBeGreaterThanOrEqual(
          CELL_MIN[axis],
        );
        expect(
          (origin[axis] ?? 0) + (size[axis] ?? 0),
          `${path} ${condition}`,
        ).toBeLessThanOrEqual(CELL_MAX[axis]);
      }
    }
  });

  it("keeps both items of a pair block over its own cell in every permutation, not just a pixel of them (ADR 0108)", () => {
    for (const { path, condition, components } of states) {
      if (!PAIR_BLOCKS.includes(path)) continue;
      const reference = components["minecraft:geometry"] as GeometryReference;
      const model = bones.get(identifierOf(reference)) ?? new Map();
      const { lo, hi } = transformed(
        visibleCubes(reference, model),
        components["minecraft:transformation"] as Transformation | undefined,
      );
      for (const axis of [0, 2] as const) {
        expect(lo[axis], `${path} ${condition}`).toBeGreaterThanOrEqual(-8);
        expect(hi[axis], `${path} ${condition}`).toBeLessThanOrEqual(8);
      }
    }
  });

  it("rejects the second item #429 drew a cell away, as the client did", () => {
    const toaster = [
      ...(bones.get("geometry.yasu_ride.toaster") ?? []),
    ].flatMap(([, cubes]) => cubes);
    // #429's shelf front end: forward -12.5 px at face 3, which is +x in the world.
    expect(
      axisOutsideCell(
        transformed(toaster, {
          rotation: [0, -90, 0],
          translation: [12.5 / 16, 10 / 16, 0],
        }),
      ),
    ).toBe("x");
    expect(
      axisOutsideCell(
        transformed(toaster, {
          rotation: [0, -90, 0],
          translation: [5.4 / 16, 15 / 16, 0],
        }),
      ),
    ).toBeUndefined();
  });
});

// BDS refuses to load a block definition that breaks either rule below, and the block is then
// missing from the world: the CI server logged both for PR #429's pair blocks (ADR 0108).
describe("block definitions BDS loads (ADR 0108)", () => {
  const definitions = jsonFileEntries(join(BP, "blocks")).map(
    ({ path, json }) => ({
      path: `blocks/${path}`,
      block: json["minecraft:block"] as Json,
    }),
  );

  it("lists at least two values in every enum state: 'Block State enum array must have more than 1 value'", () => {
    for (const { path, block } of definitions) {
      const description = block.description as {
        states?: Record<string, unknown>;
      };
      for (const [state, values] of Object.entries(description.states ?? {}))
        if (Array.isArray(values))
          expect(values.length, `${path} ${state}`).toBeGreaterThanOrEqual(2);
    }
  });

  // A block state holds at most 16 values and a block fewer than 65,536 combinations of
  // its states; the fridge's compartment block is the largest (ADR 0108, 0123).
  it("lists at most 16 values in every enum state and keeps every block under 65,536 combinations of its states", () => {
    for (const { path, block } of definitions) {
      const description = block.description as {
        states?: Record<string, unknown>;
      };
      let combinations = 1;
      for (const [state, values] of Object.entries(description.states ?? {}))
        if (Array.isArray(values)) {
          expect(values.length, `${path} ${state}`).toBeLessThanOrEqual(16);
          combinations *= values.length;
        }
      expect(combinations, path).toBeLessThan(65_536);
    }
  });

  it("keeps every material instance of a block opaque or every one not: 'MaterialInstances can't mix and match opaque and transparent materials'", () => {
    for (const { path, block } of definitions) {
      const permutations =
        (block.permutations as { components?: Json }[] | undefined) ?? [];
      for (const components of [
        block.components as Json | undefined,
        ...permutations.map((p) => p.components),
      ]) {
        const instances = components?.["minecraft:material_instances"] as
          | Record<string, { render_method?: string }>
          | undefined;
        const opaque = new Set(
          Object.values(instances ?? {}).map(
            (i) => (i.render_method ?? "opaque") === "opaque",
          ),
        );
        expect(opaque.size, path).toBeLessThanOrEqual(1);
      }
    }
  });
});
