import fc from "fast-check";
import { afterAll, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

const run = (script: string) =>
  python.run(
    [
      "import sys",
      "sys.path.insert(0, 'tools')",
      "from tool_loader import load_tool",
      "m = load_tool('mip_check')",
      script,
    ].join("\n"),
  );

const byte = fc.integer({ min: 0, max: 255 });
const size = fc.integer({ min: 1, max: 13 });

it("preserves uniform opaque texels and rounds each dimension up", async () => {
  await fc.assert(
    fc.asyncProperty(
      size,
      size,
      fc.tuple(byte, byte, byte),
      async (w, h, rgb) => {
        await run(`color = (*${JSON.stringify(rgb)}, 255)
pixels, width, height = m.downsample([color] * (${w} * ${h}), ${w}, ${h})
assert (width, height) == (${Math.ceil(w / 2)}, ${Math.ceil(h / 2)})
assert pixels == [color] * (width * height)`);
      },
    ),
    { numRuns: 25 },
  );
});

it("keeps filtered RGB within each input channel's range", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.tuple(byte, byte, byte, byte), {
        minLength: 4,
        maxLength: 4,
      }),
      async (texels) => {
        await run(`texels = list(map(tuple, ${JSON.stringify(texels)}))
[pixel], _, _ = m.downsample(texels, 2, 2)
for c in range(3):
    values = [texel[c] for texel in texels]
    assert min(values) <= pixel[c] <= max(values)`);
      },
    ),
    { numRuns: 25 },
  );
});

it("weights RGB by alpha, averages transparent RGB, and repeats edge texels", async () => {
  await run(`texels = [(200, 0, 0, 192), (0, 100, 0, 64), (1, 2, 3, 255)]
assert m.downsample(texels, 3, 1) == ([(150, 25, 0, 128), texels[2]], 2, 1)
assert m.downsample([(20, 0, 40, 0), (40, 30, 0, 0)], 1, 2) == ([(30, 15, 20, 0)], 1, 1)`);
});

it("measures exact swatch errors for alpha, odd centres, and edge clamping", async () => {
  await run(`texels = [(10, 20, 30, alpha) for alpha in (200, 200, 200, 100, 20)]
chain = m.mip_chain(texels, 5, 1, 1)
assert m.swatch_mip_error(chain, (3, 0, 1, 1), 1) == 50
assert m.swatch_mip_error(chain, (0, 0, 3, 1), 1) == 0
assert m.swatch_mip_error(chain, (4, 0, 5, 5), 1) == 0`);
});

// Largest per-channel drift allowed between a flat swatch and its mip texel.
const MIP_TOLERANCE = 8;

// requiredThrough is the deepest mip level that must be within tolerance (levels 0-2 for both; camper level 3 still blends neighbouring cells).
it.each([
  { vehicle: "suv", atlas: "suv_atlas", requiredThrough: 2, failures: [] },
  {
    vehicle: "camper",
    atlas: "camper_kit",
    requiredThrough: 2,
    failures: [],
  },
])(
  "checks every $vehicle swatch against the mip tolerance",
  async ({ vehicle, atlas, requiredThrough, failures }) => {
    const output = await run(`import json
rects = m.swatch_rects(load_tool('${atlas}').ATLAS)
chain = m.mip_chain(*m.read_texture('${vehicle}'), 3)
print(json.dumps([max(m.swatch_mip_error(chain, rect, level) for rect in rects.values())
                  for level in range(4)]))`);
    const errors: number[] = JSON.parse(output);
    const failedLevels = errors.flatMap((error, level) =>
      level <= requiredThrough && error > MIP_TOLERANCE ? [level] : [],
    );
    expect(
      failedLevels,
      `Maximum errors by level: ${errors.join(", ")}`,
    ).toEqual(failures);
  },
);
