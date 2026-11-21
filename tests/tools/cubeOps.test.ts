import fc from "fast-check";
import { afterAll, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

async function extent(origin: number[], end: number[]) {
  const script = [
    "import json, sys",
    "sys.path.insert(0, 'tools')",
    "from cube_ops import ordered_extent",
    `print(json.dumps(ordered_extent(*${JSON.stringify([...origin, ...end])})))`,
  ].join("\n");
  return JSON.parse(await python.run(script));
}

const coordinate = fc.integer({ min: -4000, max: 4000 }).map((n) => n / 8);
const point = fc.tuple(coordinate, coordinate, coordinate);

it("round-trips ordered bounds, including flat axes", async () => {
  await fc.assert(
    fc.asyncProperty(point, point, async (origin, offsets) => {
      const size = offsets.map(Math.abs);
      const end = origin.map((n, i) => n + (size[i] as number));
      expect(await extent(origin, end)).toEqual([origin, size]);
    }),
  );
  expect(await extent([0, 0, 0], [-1e-9, 0, 0])).toEqual([
    [0, 0, 0],
    [0, 0, 0],
  ]);
});

it.each(["x", "y", "z"])(
  "rejects an inverted %s axis and reports its bounds",
  async (axis) => {
    const i = ["x", "y", "z"].indexOf(axis);
    await fc.assert(
      fc.asyncProperty(
        point,
        fc.integer({ min: 1, max: 4000 }),
        async (origin, gap) => {
          const min = origin[i] as number;
          const max = min - gap / 8;
          const end = [...origin];
          end[i] = max;
          await expect(extent(origin, end)).rejects.toThrow(
            new RegExp(`ValueError: .*${axis}.*${min}.*${max}`),
          );
        },
      ),
    );
  },
);
