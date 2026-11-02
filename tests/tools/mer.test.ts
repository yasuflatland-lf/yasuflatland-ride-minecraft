import fc from "fast-check";
import { afterAll, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

const run = async (body: string) =>
  (
    await python.run(`
import sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
m = load_tool('mer')
${body}
`)
  ).trim();

it("validates channels and preserves them in RGBA", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.tuple(...Array(3).fill(fc.integer({ min: 0, max: 255 }))),
      async (values) => {
        expect(
          JSON.parse(
            await run(
              `import json\nprint(json.dumps(m.Mer(${values.join(",")}).rgba()))`,
            ),
          ),
        ).toEqual([...values, 255]);
      },
    ),
    { numRuns: 10 },
  );
  await fc.assert(
    fc.asyncProperty(
      fc.oneof(fc.integer({ max: -1 }), fc.integer({ min: 256 })),
      async (value) => {
        expect(
          await run(
            `try:\n m.Mer(${value}, 0, 0)\nexcept ValueError:\n print('rejected')`,
          ),
        ).toBe("rejected");
      },
    ),
    { numRuns: 10 },
  );
});

it("paints the lookup value or the supplied default", async () => {
  expect(
    JSON.parse(
      await run(
        `import json\np = m.mer_painter(lambda x, y: m.MER_LIT if x else None, m.Mer(1, 2, 3))\nprint(json.dumps([p(0, 0), p(1, 0)]))`,
      ),
    ),
  ).toEqual([
    [1, 2, 3, 255],
    [0, 255, 255, 255],
  ]);
});
