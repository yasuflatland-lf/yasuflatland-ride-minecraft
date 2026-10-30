import { execFileSync } from "node:child_process";
import fc from "fast-check";
import { expect, it } from "vitest";

const run = (script: string) =>
  execFileSync(
    "python3",
    [
      "-I",
      "-c",
      [
        "import sys, json, hashlib",
        "sys.path.insert(0, 'tools')",
        "from tool_loader import load_tool",
        "d = load_tool('suv_paint_dash')",
        "p = load_tool('suv_palette')",
        script,
      ].join("\n"),
    ],
    { encoding: "utf8" },
  );

it("keeps every grain texel within resin jitter and identical across paints", () => {
  const pixels = JSON.parse(
    run(`print(json.dumps({
    'jitter': d.GRAIN_JITTER,
    'resin': p.PALETTE['resin'],
    'paints': [[[d.color('grain', u, v, paint) for u in range(32)] for v in range(32)] for paint in p.BODY_PAINTS]
}))`),
  );
  for (const paint of pixels.paints) {
    expect(paint).toEqual(pixels.paints[0]);
    for (const row of paint)
      for (const pixel of row) {
        expect(pixel[3]).toBe(255);
        pixel.slice(0, 3).forEach((channel: number, i: number) => {
          expect(Math.abs(channel - pixels.resin[i])).toBeLessThanOrEqual(
            pixels.jitter,
          );
        });
      }
  }
  fc.assert(
    fc.property(fc.integer(), fc.integer(), (u, v) => {
      run(`for paint in p.BODY_PAINTS:
    pixel = d.color('grain', ${u}, ${v}, paint)
    assert pixel == d.color('grain', ${u}, ${v}, p.BODY_PAINTS[0])
    assert pixel[3] == 255
    assert all(abs(c - base) <= d.GRAIN_JITTER for c, base in zip(pixel[:3], p.PALETTE['resin']))`);
    }),
    { numRuns: 15 },
  );
});

it("caps every dash texel and keeps its material matte, unlit and without relief", () => {
  run(`for spec in d.REGIONS:
    assert spec.base == 'resin'
    for v in range(spec.h):
        for u in range(spec.w):
            for paint in p.BODY_PAINTS:
                pixel = d.color(spec.name, u, v, paint)
                assert max(pixel[:3]) <= d.BRIGHTNESS_CAP <= 120
                assert min(pixel[:3]) >= 0 and pixel[3] == 255
                assert pixel == d.color(spec.name, u, v, p.BODY_PAINTS[0])
                assert d.mer(spec.name, u, v, paint) == load_tool('mer').Mer(0, 0, 235)
            assert not d.lit(spec.name, u, v)
            assert d.relief(spec.name, u, v) is None`);
});

it("paints identical dash regions in separate Python processes", () => {
  const script = `pixels = bytes(channel for spec in d.REGIONS for v in range(spec.h) for u in range(spec.w) for paint in p.BODY_PAINTS for channel in d.color(spec.name, u, v, paint))
print(hashlib.sha256(pixels).hexdigest())`;
  expect(run(script)).toEqual(run(script));
});
