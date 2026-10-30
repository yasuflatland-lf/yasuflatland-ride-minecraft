import { execFileSync } from "node:child_process";
import fc from "fast-check";
import { expect, it } from "vitest";

const run = (body: string) =>
  execFileSync(
    "python3",
    [
      "-I",
      "-c",
      `
import sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
m = load_tool('mer')
${body}
`,
    ],
    { encoding: "utf8" },
  ).trim();

it("validates channels and preserves them in RGBA", () => {
  fc.assert(
    fc.property(
      fc.tuple(...Array(3).fill(fc.integer({ min: 0, max: 255 }))),
      (values) => {
        expect(
          JSON.parse(
            run(
              `import json\nprint(json.dumps(m.Mer(${values.join(",")}).rgba()))`,
            ),
          ),
        ).toEqual([...values, 255]);
      },
    ),
    { numRuns: 10 },
  );
  fc.assert(
    fc.property(
      fc.oneof(fc.integer({ max: -1 }), fc.integer({ min: 256 })),
      (value) => {
        expect(
          run(
            `try:\n m.Mer(${value}, 0, 0)\nexcept ValueError:\n print('rejected')`,
          ),
        ).toBe("rejected");
      },
    ),
    { numRuns: 10 },
  );
});

it("paints the lookup value or the supplied default", () => {
  expect(
    JSON.parse(
      run(
        `import json\np = m.mer_painter(lambda x, y: m.MER_LIT if x else None, m.Mer(1, 2, 3))\nprint(json.dumps([p(0, 0), p(1, 0)]))`,
      ),
    ),
  ).toEqual([
    [1, 2, 3, 255],
    [0, 255, 255, 255],
  ]);
});
