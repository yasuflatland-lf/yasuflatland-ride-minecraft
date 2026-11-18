import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

const FACES = ["north", "south", "east", "west", "up", "down"] as const;

type Face = { uv: [number, number]; uv_size: [number, number] };
type Cube = {
  origin: [number, number, number];
  size: [number, number, number];
  inflate?: number;
  uv: Record<string, Face>;
  // Test-only: the pass index (or boolean for select) that keeps each face.
  keep: Record<string, number>;
};
type Bone = {
  name: string;
  parent?: string;
  pivot: [number, number, number];
  rotation?: [number, number, number];
  mirror?: boolean;
  locators?: Record<string, [number, number, number]>;
  cubes?: Cube[];
};
type Geometry = {
  description: Record<string, unknown>;
  bones: Bone[];
};

const arbGeometry = (passes: number): fc.Arbitrary<Geometry> =>
  fc
    .array(
      fc.record({
        parentIndex: fc.nat(),
        hasParent: fc.boolean(),
        pivot: fc.tuple(
          fc.integer({ min: -8, max: 8 }),
          fc.integer({ min: -8, max: 8 }),
          fc.integer({ min: -8, max: 8 }),
        ),
        mirror: fc.boolean(),
        cubes: fc.array(
          fc.array(
            fc.record({
              face: fc.constantFrom(...FACES),
              keep: fc.nat(passes - 1),
            }),
            { minLength: 1, maxLength: 6 },
          ),
          { maxLength: 4 },
        ),
      }),
      { minLength: 1, maxLength: 6 },
    )
    .map((bones) => ({
      description: {
        identifier: "geometry.test.source",
        texture_width: 64,
        texture_height: 64,
      },
      bones: bones.map((bone, index): Bone => {
        const out: Bone = {
          name: `bone_${index}`,
          pivot: bone.pivot,
          rotation: [index, 0, 0],
          mirror: bone.mirror,
          locators: { anchor: [index, 1, 2] },
          cubes: bone.cubes.map((faces, cubeIndex): Cube => {
            const unique = [...new Map(faces.map((f) => [f.face, f])).values()];
            return {
              origin: [index, cubeIndex, 0],
              size: [1, 2, 3],
              inflate: 0.5,
              uv: Object.fromEntries(
                unique.map((f, i) => [
                  f.face,
                  { uv: [i, cubeIndex], uv_size: [-1, 1] },
                ]),
              ),
              keep: Object.fromEntries(unique.map((f) => [f.face, f.keep])),
            };
          }),
        };
        if (bone.hasParent && index > 0) {
          out.parent = `bone_${bone.parentIndex % index}`;
        }
        return out;
      }),
    }));

type Key = string;
const faceKeys = (
  geometry: Geometry,
  wanted?: (c: Cube, f: string) => boolean,
) =>
  geometry.bones.flatMap((bone) =>
    (bone.cubes ?? []).flatMap((cube) =>
      Object.keys(cube.uv)
        .filter((face) => wanted?.(cube, face) ?? true)
        .map((face): Key => `${bone.name}|${cube.origin.join(",")}|${face}`),
    ),
  );

const skeleton = (geometry: Geometry) =>
  geometry.bones.map(({ name, parent, pivot, rotation, mirror, locators }) => ({
    name,
    parent,
    pivot,
    rotation,
    mirror,
    locators,
  }));

const call = async (
  expression: string,
  geometry: unknown,
  extra: unknown = null,
): Promise<unknown> =>
  JSON.parse(
    await python.run(
      [
        "import json, sys",
        "sys.path.insert(0, 'tools')",
        "from tool_loader import load_tool",
        "module = load_tool('geometry_passes')",
        "args = json.loads(sys.stdin.read())",
        "geometry, extra = args['geometry'], args['extra']",
        "def spec(identifier, index):",
        "    return module.PassSpec(identifier, lambda bone, cube, face: cube['keep'][face] == index)",
        `print(json.dumps(${expression}))`,
      ].join("\n"),
      JSON.stringify({ geometry, extra }),
    ),
  );

const partition = (geometry: Geometry, passes: number) =>
  call(
    "module.partition_geometry(geometry, [spec(f'geometry.test.p{i}', i) for i in range(extra)])",
    geometry,
    passes,
  ) as Promise<Geometry[]>;

describe("geometry passes", () => {
  it("partitions faces exactly once and keeps every bone", async () => {
    const passes = 3;
    await fc.assert(
      fc.asyncProperty(arbGeometry(passes), async (geometry) => {
        // A pass with no face at all is a valid partition result.
        const outputs = await partition(geometry, passes);
        expect(outputs).toHaveLength(passes);
        const all = outputs.flatMap((output) => faceKeys(output));
        expect(new Set(all).size).toBe(all.length);
        expect([...all].sort()).toEqual(faceKeys(geometry).sort());
        outputs.forEach((output, index) => {
          expect(skeleton(output)).toEqual(skeleton(geometry));
          expect(output.description).toEqual({
            ...geometry.description,
            identifier: `geometry.test.p${index}`,
          });
          expect(faceKeys(output).sort()).toEqual(
            faceKeys(
              geometry,
              (cube, face) => cube.keep[face] === index,
            ).sort(),
          );
        });
      }),
      { numRuns: 40 },
    );
  });

  it("selects exactly the faces the predicate keeps", async () => {
    await fc.assert(
      fc.asyncProperty(arbGeometry(2), async (geometry) => {
        const expected = faceKeys(
          geometry,
          (cube, face) => cube.keep[face] === 0,
        );
        if (expected.length === 0) return;
        const before = JSON.stringify(geometry);
        const output = (await call(
          "module.select_faces(geometry, spec('geometry.test.sel', 0))",
          geometry,
        )) as Geometry;
        expect(JSON.stringify(geometry)).toBe(before);
        expect(faceKeys(output).sort()).toEqual(expected.sort());
        expect(skeleton(output)).toEqual(skeleton(geometry));
        expect(output.description.identifier).toBe("geometry.test.sel");
        for (const bone of output.bones) {
          for (const cube of bone.cubes ?? []) {
            expect(Object.keys(cube.uv).length).toBeGreaterThan(0);
            expect(cube.inflate).toBe(0.5);
            expect(cube.size).toEqual([1, 2, 3]);
          }
        }
      }),
      { numRuns: 40 },
    );
  });

  const small: Geometry = {
    description: { identifier: "geometry.test.source" },
    bones: [
      {
        name: "root",
        pivot: [0, 0, 0],
        cubes: [
          {
            origin: [0, 0, 0],
            size: [1, 1, 1],
            uv: {
              north: { uv: [0, 0], uv_size: [1, 1] },
              south: { uv: [1, 0], uv_size: [1, 1] },
            },
            keep: { north: 0, south: 1 },
          },
        ],
      },
    ],
  };

  it("names the bone, cube index and face when a face is kept twice", async () => {
    const overlapping = structuredClone(small);
    await expect(
      call(
        "module.partition_geometry(geometry, [module.PassSpec('a', lambda b, c, f: True), module.PassSpec('b', lambda b, c, f: f == 'south')])",
        overlapping,
      ),
    ).rejects.toThrow(
      /bone 'root' cube 0 face 'south' is kept by several passes/,
    );
  });

  it("names the bone, cube index and face when a face is kept by no pass", async () => {
    await expect(
      call(
        "module.partition_geometry(geometry, [module.PassSpec('a', lambda b, c, f: f == 'north')])",
        small,
      ),
    ).rejects.toThrow(/bone 'root' cube 0 face 'south' is kept by no pass/);
  });

  it("rejects a selection that keeps no face", async () => {
    await expect(
      call(
        "module.select_faces(geometry, module.PassSpec('a', lambda b, c, f: False))",
        small,
      ),
    ).rejects.toThrow(/no face is kept/);
  });

  it("deep-copies kept faces so callers can re-resolve UVs", async () => {
    const output = (await call(
      "(lambda out: (out['bones'][0]['cubes'][0]['uv']['north'].update(uv=[9, 9]), geometry['bones'][0]['cubes'][0]['uv']['north']['uv'])[1])(module.select_faces(geometry, spec('a', 0)))",
      small,
    )) as number[];
    expect(output).toEqual([0, 0]);
  });
});
