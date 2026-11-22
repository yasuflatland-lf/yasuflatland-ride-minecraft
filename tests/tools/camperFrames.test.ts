import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

const PRELUDE = `import copy, json, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
frames = load_tool('camper_frames')
data = json.loads(sys.stdin.read())
inp = copy.deepcopy(data)
`;

async function check(body: string, data: unknown) {
  const out = await python.run(
    PRELUDE + body + "\nprint(json.dumps(True))",
    JSON.stringify(data),
  );
  expect(JSON.parse(out)).toBe(true);
}

const coord = fc.integer({ min: -300, max: 300 }).map((n) => n / 10);
const size = fc.integer({ min: 1, max: 200 }).map((n) => n / 10);
const angle = fc.integer({ min: -90, max: 90 });
const vec = fc.tuple(coord, coord, coord);
const FACES = ["north", "south", "east", "west", "up", "down"];
const cube = fc
  .record({
    origin: vec,
    size: fc.tuple(size, size, size),
    turn: fc.option(
      fc.record({ pivot: vec, rotation: fc.tuple(angle, angle, angle) }),
      { nil: undefined },
    ),
  })
  .map(({ origin, size, turn }) => ({
    origin,
    size,
    ...(turn ?? {}),
    uv: Object.fromEntries(
      FACES.map((f, i) => [f, { uv: [i, 0], uv_size: [1, 1] }]),
    ),
  }));
const bone = fc
  .record({
    name: fc.constant("b"),
    pivot: vec,
    rotation: fc.option(fc.tuple(angle, angle, angle), { nil: undefined }),
    locators: fc.dictionary(fc.constantFrom("a", "b", "c"), vec, {
      maxKeys: 3,
    }),
    cubes: fc.array(cube, { minLength: 0, maxLength: 5 }),
  })
  .map((b) =>
    b.rotation === undefined ? (({ rotation, ...rest }) => rest)(b) : b,
  );

describe("camper frames", () => {
  it("to_game_frame mirrors positions, pivots, locators and rotations", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(bone, { minLength: 1, maxLength: 3 }),
        async (data) => {
          await check(
            `out = frames.to_game_frame(data)
assert out is data
for actual, original in zip(out, inp, strict=True):
    assert actual.keys() == original.keys()
    assert actual['name'] == original['name']
    px, py, pz = original['pivot']
    assert actual['pivot'] == [-px, py, pz]
    assert actual['locators'] == {
        name: [-x, y, z] for name, (x, y, z) in original['locators'].items()
    }
    if 'rotation' in original:
        rx, ry, rz = original['rotation']
        assert actual['rotation'] == [rx, -ry, -rz]
    for c, before in zip(actual['cubes'], original['cubes'], strict=True):
        assert c.keys() == before.keys()
        x, y, z = before['origin']
        w = before['size'][0]
        assert c['origin'] == [-(x + w), y, z]
        assert c['size'] == before['size']
        assert c['uv'] == before['uv']
        if 'pivot' in before:
            px, py, pz = before['pivot']
            rx, ry, rz = before['rotation']
            assert c['pivot'] == [-px, py, pz]
            assert c['rotation'] == [rx, -ry, rz]`,
            data,
          );
        },
      ),
      { numRuns: 30 },
    );
  });

  it("to_game_frame keeps every face name and UV", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(bone, { minLength: 1, maxLength: 3 }),
        async (data) => {
          await check(
            `uvs = [id(c['uv']) for b in data for c in b.get('cubes', [])]
out = frames.to_game_frame(data)
actual = [c['uv'] for b in out for c in b.get('cubes', [])]
original = [c['uv'] for b in inp for c in b.get('cubes', [])]
for uv, before, identity in zip(actual, original, uvs, strict=True):
    assert id(uv) == identity
    assert list(uv) == list(before)
    assert uv == before`,
            data,
          );
        },
      ),
      { numRuns: 30 },
    );
  });

  it("from_game_trace keeps every face name and UV", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(cube, { minLength: 1, maxLength: 8 }),
        async (data) => {
          await check(
            `uvs = [id(c['uv']) for c in data]
out = frames.from_game_trace(data)
assert out is data
for c, before, identity in zip(out, inp, uvs, strict=True):
    assert id(c['uv']) == identity
    assert list(c['uv']) == list(before['uv'])
    assert c['uv'] == before['uv']`,
            data,
          );
        },
      ),
      { numRuns: 30 },
    );
  });

  it("to_game_frame undoes from_game_trace", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(cube, { minLength: 1, maxLength: 8 }),
        async (data) => {
          await check(
            `frames.to_game_frame([{"name": "b", "pivot": [0, 0, 0], "cubes": frames.from_game_trace(data)}])
for c, before in zip(data, inp, strict=True):
    assert ('pivot' in c) == ('pivot' in before)
    assert ('rotation' in c) == ('rotation' in before)
    assert all(abs(a - b) <= 1e-9 for a, b in zip(c['origin'], before['origin'], strict=True))
    if 'pivot' in before:
        assert all(abs(a - b) <= 1e-9 for a, b in zip(c['pivot'], before['pivot'], strict=True))
        assert c['rotation'] == before['rotation']
    assert c['size'] == before['size']
    assert c['uv'] == before['uv']`,
            data,
          );
        },
      ),
      { numRuns: 30 },
    );
  });
});
