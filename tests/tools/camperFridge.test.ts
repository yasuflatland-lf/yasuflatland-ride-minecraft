import fc from "fast-check";
import { afterAll, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

const script = `
import copy, json, sys
sys.path.insert(0, 'tools')
import camper_fridge

def reference(cubes):
    for cube in cubes:
        lo = [round(v, camper_fridge.OUTPUT_PRECISION) for v in cube["origin"]]
        hi = [round(a + b, camper_fridge.OUTPUT_PRECISION) for a, b in zip(cube["origin"], cube["size"])]
        cube["origin"] = lo
        cube["size"] = [round(b - a, camper_fridge.OUTPUT_PRECISION) for a, b in zip(lo, hi)]
    for axis in (1, 2):
        cubes = camper_fridge.merge_axis(cubes, axis)
    result = []
    for cube in reversed(cubes):
        if any(v <= 0 for v in cube["size"]):
            continue
        pieces = [cube]
        for occupied in result:
            pieces = [part for piece in pieces for part in camper_fridge.subtract(piece, occupied)]
            if not pieces:
                break
        result.extend(pieces)
    for axis in (1, 2, 0):
        result = camper_fridge.merge_axis(result, axis)
    return result

boxes = json.loads(sys.stdin.read())
cubes = [camper_fridge.box(*coords, color) for coords, color in boxes]
print(json.dumps([camper_fridge.finish(copy.deepcopy(cubes)), reference(copy.deepcopy(cubes))]))
`;

const interval = fc
  .tuple(fc.integer({ min: 0, max: 23 }), fc.integer({ min: 1, max: 24 }))
  .filter(([a, b]) => a < b)
  .map(([a, b]) => [a * 0.5, b * 0.5] as const);
const box = fc
  .tuple(
    interval,
    interval,
    interval,
    fc.constantFrom("ivory", "white", "chrome"),
  )
  .map(([x, y, z, color]) => [[x[0], y[0], z[0], x[1], y[1], z[1]], color]);

// The finish property took up to 5.412 s on main (two runs after its merge); 4 x 5.412 = 21.648 s, rounded up to the 30 s global default.
it("matches the brute-force finish for boxes on a half-unit grid", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(box, { minLength: 1, maxLength: 12 }),
      async (boxes) => {
        const [actual, expected] = JSON.parse(
          await python.run(script, JSON.stringify(boxes)),
        );
        expect(actual).toEqual(expected);
      },
    ),
    { numRuns: 50 },
  );
});
