import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";
import { type Bone, boneChain, type Cube, worldCorners } from "./geometry";
import { modelFaces, overlapArea, planeBucketKey } from "./modelFaces";
import { startPythonWorker } from "./pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

const coordinate = fc.integer({ min: -200, max: 200 }).map((n) => n / 4);
const triple = fc.tuple(coordinate, coordinate, coordinate);
const unitCube: Cube = {
  origin: [0, 0, 0],
  size: [1, 1, 1],
  uv: { up: { uv: [0, 0], uv_size: [1, 1] } },
};
const face = (cube: Cube) => {
  const [result] = modelFaces({ bones: [{ name: "root", cubes: [cube] }] });
  if (!result) throw new Error("Expected a face");
  return result;
};

describe("world corners", () => {
  it("matches cube_tilt in bit order for rotated cubes, including inflation", async () => {
    const script = [
      "import json, sys",
      "sys.path.insert(0, 'tools')",
      "from cube_tilt import corners",
      "print(json.dumps(corners(json.load(sys.stdin))))",
    ].join("\n");
    await fc.assert(
      fc.asyncProperty(
        triple,
        triple,
        triple,
        triple,
        coordinate,
        async (origin, dimensions, pivot, angles, grow) => {
          const inflate = Math.abs(grow) / 20;
          const size = dimensions.map(Math.abs) as Cube["size"];
          const cube = { origin, size, pivot, rotation: angles, inflate };
          const inflated = {
            ...cube,
            origin: origin.map((value) => value - inflate),
            size: size.map((value) => value + 2 * inflate),
          };
          const expected = JSON.parse(
            await python.run(script, JSON.stringify(inflated)),
          ) as number[][];
          const root = { name: "root" };
          const actual = worldCorners([root], root, cube);
          expect(actual).toHaveLength(8);
          for (const [i, point] of actual.entries()) {
            for (const [axis, value] of point.entries()) {
              expect(
                Math.abs(value - (expected[i]?.[axis] ?? Number.NaN)),
              ).toBeLessThanOrEqual(1e-6);
            }
          }
        },
      ),
    );
  });

  it("applies the cube and child turns before the rotated parent", () => {
    const parent: Bone = {
      name: "root",
      pivot: [1, 0, 0],
      rotation: [0, 90, 0],
    };
    const child: Bone = {
      name: "child",
      parent: "root",
      pivot: [0, 0, 0],
      rotation: [0, 0, 90],
    };
    const cube: Cube = {
      ...unitCube,
      origin: [2, 0, 0],
      pivot: [1, 0, 0],
      rotation: [0, 90, 0],
    };
    const point = worldCorners([child, parent], child, cube)[0];
    expect(point?.[0]).toBeCloseTo(0, 10);
    expect(point?.[1]).toBeCloseTo(-1, 10);
    expect(point?.[2]).toBeCloseTo(1, 10);
  });

  it("identifies broken bone chains", () => {
    const child = { name: "child", parent: "root" };
    expect(() => boneChain([child], child)).toThrow(/child.*root/);
    expect(() =>
      boneChain([child, { name: "root", parent: "child" }], child),
    ).toThrow(/child.*cycle/i);
  });
});

describe("model faces", () => {
  it("keeps opposite sides of a flat cube and normalizes signed UV sizes", () => {
    const uv: { uv: [number, number]; uv_size: [number, number] } = {
      uv: [4, 7],
      uv_size: [-3, -2],
    };
    const faces = modelFaces({
      bones: [
        {
          name: "root",
          cubes: [
            {
              ...unitCube,
              size: [1, 0, 1],
              uv: { up: uv, down: uv, east: uv },
            },
            { ...unitCube, uv: [0, 0] },
          ],
        },
      ],
    });
    expect(faces.map(({ side, normal, uv }) => ({ side, normal, uv }))).toEqual(
      [
        { side: "up", normal: [0, 1, 0], uv: { u: 1, v: 5, w: 3, h: 2 } },
        { side: "down", normal: [0, -1, 0], uv: { u: 1, v: 5, w: 3, h: 2 } },
      ],
    );
  });

  it("measures a shared full face and gives zero for a shared edge", () => {
    const a = face(unitCube);
    expect(overlapArea(a, face({ ...unitCube }))).toBe(1);
    expect(overlapArea(a, face({ ...unitCube, origin: [1, 0, 0] }))).toBe(0);
    expect(planeBucketKey(a)).toBe(
      planeBucketKey(face({ ...unitCube, origin: [1, 0, 0] })),
    );
  });

  it("clips symmetrically, within both face areas, independent of translation", () => {
    const width = fc.integer({ min: 1, max: 16 }).map((n) => n / 4);
    const angle = fc.integer({ min: -180, max: 180 });
    fc.assert(
      fc.property(
        width,
        width,
        width,
        width,
        coordinate,
        coordinate,
        angle,
        angle,
        triple,
        (aw, ad, bw, bd, x, z, ar, br, translation) => {
          const first: Cube = {
            ...unitCube,
            size: [aw, 1, ad],
            pivot: [0, 0, 0],
            rotation: [0, ar, 0],
          };
          const second: Cube = {
            ...unitCube,
            origin: [x / 10, 0, z / 10],
            size: [bw, 1, bd],
            pivot: [0, 0, 0],
            rotation: [0, br, 0],
          };
          const move = (point: Cube["origin"]): Cube["origin"] => [
            point[0] + translation[0],
            point[1] + translation[1],
            point[2] + translation[2],
          ];
          const translated = (cube: Cube) =>
            face({ ...cube, origin: move(cube.origin), pivot: translation });
          const a = face(first);
          const b = face(second);
          const area = overlapArea(a, b);
          expect(area).toBeCloseTo(overlapArea(b, a), 8);
          expect(area).toBeGreaterThanOrEqual(0);
          expect(area).toBeLessThanOrEqual(Math.min(aw * ad, bw * bd) + 1e-8);
          expect(
            overlapArea(translated(first), translated(second)),
          ).toBeCloseTo(area, 8);
          const opposite = face({
            ...second,
            origin: [x / 10, 1, z / 10],
            uv: { down: { uv: [0, 0], uv_size: [1, 1] } },
          });
          expect(overlapArea(a, opposite)).toBe(0);
        },
      ),
    );
  });
});
