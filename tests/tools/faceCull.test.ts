import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

type Vec = [number, number, number];
type Face = { uv: [number, number]; uv_size: [number, number] };
type Cube = {
  origin: Vec;
  size: Vec;
  uv: Record<string, Face>;
  rotation?: Vec;
  pivot?: Vec;
};

const vector = (min: number, max: number) => {
  const axis = fc.integer({ min, max });
  return fc.tuple(axis, axis, axis);
};

const sides = ["west", "east", "down", "up", "north", "south"];
const cube = (origin: Vec, size: Vec, faces = sides): Cube => ({
  origin,
  size,
  uv: Object.fromEntries(
    faces.map((side, i) => [side, { uv: [i, 0], uv_size: [1, 1] }]),
  ),
});

const geometry = (...groups: unknown[][]) => ({
  description: { identifier: "geometry.test" },
  bones: groups.map((cubes, i) => ({ name: `bone_${i}`, cubes })),
});

type CullResult = {
  geometry: {
    description: { identifier: string };
    bones: { name: string; cubes: Cube[] }[];
  };
  removed_faces: number;
  removed_cubes: number;
  index_map: [string, number, number | null][];
};

async function run<T>(script: string, input: unknown): Promise<T> {
  const result = await python.run(
    `import json, sys
sys.path.insert(0, 'tools')
from face_cull import CullPolicy, cull_buried_faces, opaque_occluder, write_record
data = json.load(sys.stdin)
${script}`,
    JSON.stringify(input),
  );
  return JSON.parse(result) as T;
}

const cull = (
  input: ReturnType<typeof geometry>,
  { excluded = [] as string[], opaque = true, epsilon = 1e-3 } = {},
) =>
  run<{ first: CullResult; second: CullResult; input: typeof input }>(
    `
def encode(result):
    return dict(geometry=result.geometry, removed_faces=result.removed_faces,
                removed_cubes=result.removed_cubes,
                index_map=[(bone, old, new) for (bone, old), new in result.index_map.items()])
policy = CullPolicy(tuple(data["excluded"]), lambda bone, cube: data["opaque"], data["epsilon"])
first = cull_buried_faces(data["geometry"], policy)
second = cull_buried_faces(first.geometry, policy)
print(json.dumps(dict(first=encode(first), second=encode(second), input=data["geometry"])))
`,
    { geometry: input, excluded, opaque, epsilon },
  );

const outer = cube([0, 0, 0], [8, 8, 8]);
const inner = cube([2, 2, 2], [1, 1, 1]);

describe("cull_buried_faces", () => {
  it("drops the inner cube and maps retained cubes to their new indices", async () => {
    const input = geometry([inner, outer]);
    const result = await cull(input);
    expect(result.input).toEqual(input);
    expect(result.first).toEqual({
      geometry: geometry([outer]),
      removed_faces: 6,
      removed_cubes: 1,
      index_map: [
        ["bone_0", 0, null],
        ["bone_0", 1, 0],
      ],
    });
  });

  it("keeps faces across bone boundaries", async () => {
    const input = geometry([inner], [outer]);
    expect((await cull(input)).first.geometry).toEqual(input);
  });

  it("keeps same-direction flush faces", async () => {
    const flush = cube([7, 1, 1], [1, 1, 1]);
    const { first } = await cull(geometry([outer, flush]));
    expect(first.geometry).toEqual(
      geometry([outer, { ...flush, uv: { west: flush.uv.west } }]),
    );
  });

  it("keeps faces when opacity rejects the occluder or the bone is excluded", async () => {
    const input = geometry([outer, inner], [outer, inner]);
    expect((await cull(input, { opaque: false })).first.geometry).toEqual(
      input,
    );
    const { first } = await cull(input, { excluded: ["bone_[!1]"] });
    expect(first.geometry).toEqual(geometry([outer, inner], [outer]));
    expect(first.removed_faces).toBe(6);
  });

  it("treats the normal axis strictly and allows 1e-6 on lateral axes across grid cells", async () => {
    const boundary = cube([7, 1, 1], [0, 1, 1], ["west"]);
    const lateral = cube([-5e-7, 1, 2], [1, 1, 0], ["north"]);
    const outside = cube([-2e-6, 1, 2], [1, 1, 0], ["north"]);
    const { first } = await cull(
      geometry([outer, boundary, lateral, outside]),
      { epsilon: 1 },
    );
    expect(first.geometry).toEqual(geometry([outer, boundary, outside]));
    expect(first.removed_faces).toBe(1);
  });

  it("uses all four corners and a single solid occluder", async () => {
    const target = cube([1, 1, 1], [4, 1, 0], ["south"]);
    const left = cube([0, 0, 0], [3, 3, 3]);
    const right = cube([3, 0, 0], [3, 3, 3]);
    const input = geometry([left, right, target]);
    const { first } = await cull(input);
    expect(first.geometry.bones[0]?.cubes[2]).toEqual(target);
  });

  it("never uses a zero-thickness cube as an occluder", async () => {
    const plane = cube([0, 0, 0], [0, 8, 8]);
    const target = cube([0, 1, 1], [0, 1, 1], ["north"]);
    const input = geometry([plane, target]);
    expect((await cull(input)).first.geometry).toEqual(input);
  });

  it("rejects box UV even on an excluded bone", async () => {
    await expect(
      cull(geometry([{ ...inner, uv: [0, 0] }]), { excluded: ["*"] }),
    ).rejects.toThrow("per-face uv");
  });

  it("handles rotated containment about a nonzero pivot and preserves slight protrusions", async () => {
    await fc.assert(
      fc.asyncProperty(
        vector(10, 25),
        vector(-179, 179),
        async ([x, y, z], rotation) => {
          const pivot: Vec = [17, -9, 5];
          const large = { ...cube([-6, -8, -10], [x, y, z]), pivot, rotation };
          const small = { ...cube([-5, -7, -9], [2, 2, 2]), pivot, rotation };
          const protruding = {
            ...small,
            origin: [x - 8 + 2e-6, -7, -9] satisfies Vec,
          };
          const { first } = await cull(geometry([large, small, protruding]));
          expect(first.index_map[1]).toEqual(["bone_0", 1, null]);
          const kept = first.geometry.bones[0]?.cubes[1];
          expect(kept?.uv.west).toEqual(protruding.uv.west);
          expect(kept?.uv.south).toEqual(protruding.uv.south);
          expect(kept?.uv.east).toBeUndefined();
        },
      ),
      { numRuns: 40 },
    );
  });

  it("inverts the occluder's pivot rotation for a target with its own rotation", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 30, max: 70 }),
        vector(-179, 179),
        async (yaw, rotation) => {
          const angle = (yaw * Math.PI) / 180;
          const center: Vec = [
            4 + 20 * Math.cos(angle),
            -3,
            7 - 20 * Math.sin(angle),
          ];
          const large = {
            ...cube([19, -8, 2], [10, 10, 10]),
            pivot: [4, -3, 7] satisfies Vec,
            rotation: [0, yaw, 0] satisfies Vec,
          };
          const small = {
            ...cube([center[0] - 1, center[1] - 1, center[2] - 1], [2, 2, 2]),
            pivot: center,
            rotation,
          };
          expect((await cull(geometry([large, small]))).first.geometry).toEqual(
            geometry([large]),
          );
        },
      ),
      { numRuns: 30 },
    );
  });

  it("keeps a rotated face whose shifted corners land exactly on the normal boundary", async () => {
    const pose = {
      pivot: [28, 23, 0] as Vec,
      rotation: [-47, 103, -60] as Vec,
    };
    const occluder = { ...outer, ...pose };
    const target = { ...cube([7, 2, 2], [0, 0, 0], ["west"]), ...pose };
    const input = geometry([occluder, target]);
    expect((await cull(input, { epsilon: 1 })).first.geometry).toEqual(input);
  });

  it("stabilizes when removing a face changes the cube's opacity", async () => {
    const slab = cube([-1, -1, -1], [2, 10, 10]);
    expect(
      await run(
        `
policy = CullPolicy((), lambda bone, cube: cube["origin"] != [0, 0, 0] or "east" not in cube["uv"])
first = cull_buried_faces(data, policy)
second = cull_buried_faces(first.geometry, policy)
print(json.dumps([first.removed_faces, first.removed_cubes, second.removed_faces]))
`,
        geometry([outer, slab, inner]),
      ),
    ).toEqual([7, 1, 0]);
  });

  it("only removes faces, preserves remaining data and is idempotent", async () => {
    const cubes = fc.array(
      fc
        .record({
          origin: vector(-3, 3),
          size: vector(0, 5),
          faces: fc.subarray(sides),
        })
        .map(({ origin, size, faces }) => cube(origin, size, faces)),
      { maxLength: 10 },
    );
    await fc.assert(
      fc.asyncProperty(cubes, cubes, async (a, b) => {
        const input = geometry(a, b);
        const { first, second } = await cull(input);
        const faceCount = (group: Cube[]) =>
          group.reduce((sum, entry) => sum + Object.keys(entry.uv).length, 0);
        const before = faceCount(a) + faceCount(b);
        const after = first.geometry.bones.reduce(
          (sum, bone) => sum + faceCount(bone.cubes),
          0,
        );
        expect(after).toBeLessThanOrEqual(before);
        expect(first.removed_faces).toBe(before - after);
        for (const [bone, old, index] of first.index_map) {
          if (index === null) continue;
          const original = (bone === "bone_0" ? a : b)[old];
          const kept = first.geometry.bones.find(({ name }) => name === bone)
            ?.cubes[index];
          expect(kept?.origin).toEqual(original?.origin);
          expect(kept?.size).toEqual(original?.size);
          expect(original?.uv).toMatchObject(kept?.uv ?? {});
        }
        expect(second.geometry).toEqual(first.geometry);
        expect(second.removed_faces).toBe(0);
        expect(second.removed_cubes).toBe(0);
      }),
    );
  });
});

it("writes the policy record through the generator output interface", async () => {
  expect(
    await run(
      `
class Outputs:
    def fixture_json(self, path, record):
        print(json.dumps([path.as_posix(), record]))
policy = CullPolicy(("glass*",), lambda bone, cube: True)
result = cull_buried_faces(data, policy)
write_record(Outputs(), data["description"]["identifier"], ("textures/test",), result, policy.excluded_bones)
`,
      geometry([inner, outer]),
    ),
  ).toEqual([
    expect.stringMatching(/\/tests\/packs\/fixtures\/face-cull\/test\.json$/),
    {
      excludedBones: ["glass*"],
      textures: ["textures/test"],
      removedFaces: 6,
      removedCubes: 1,
    },
  ]);
});

describe("opaque_occluder", () => {
  const check = (uv: Face, badIndex: number) =>
    run<boolean>(
      `
pixels = bytearray([255] * (4 * 4 * 4))
pixels[data["badIndex"] * 4 + 3] = 254
white = (4, 4, bytes([255] * len(pixels)))
variant = (4, 4, bytes(pixels))
def textures(bone, cube, side):
    assert bone == "body" and side in ("west", "south")
    return [(white, (2, 2))] if side == "west" else [(white, (2, 2)), (variant, (2, 2))]
print(json.dumps(opaque_occluder(textures)("body", {"uv": {"south": data["uv"], "west": data["uv"]}})))
`,
      { uv, badIndex },
    );

  it("rejects alpha 254 inside a scaled and flipped rectangle in any variant", async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(0, 1, 4, 5), async (badIndex) => {
        expect(await check({ uv: [1, 1], uv_size: [-1, -1] }, badIndex)).toBe(
          false,
        );
      }),
      { numRuns: 12 },
    );
    expect(await check({ uv: [1, 1], uv_size: [-1, -1] }, 2)).toBe(true);
  });

  it("samples the nearest texel when the rectangle is smaller than a texel", async () => {
    const uv: Face = { uv: [0.6, 0.1], uv_size: [0.05, 0.05] };
    expect(await check(uv, 1)).toBe(false);
    expect(await check(uv, 0)).toBe(true);
  });
});
