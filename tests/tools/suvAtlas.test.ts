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
        "import sys, json",
        "sys.path.insert(0, 'tools')",
        "from tool_loader import load_tool",
        script,
      ].join("\n"),
    ],
    { encoding: "utf8" },
  );

it("reserves fixed ordered blocks below unchanged swatches", () => {
  run(`a = load_tool('suv_atlas')
p = load_tool('suv_palette')
assert (a.ATLAS.width, a.ATLAS.height) == (512, 256)
assert a.ATLAS.width <= 512 and a.ATLAS.height <= 512
assert a.TEXELS_PER_PIXEL == 4
assert [(name, *b.region[1:]) for name, b in a.BLOCKS.items()] == [
    ('body', 0, 8, 512, 160), ('headlight', 0, 168, 96, 88),
    ('tail_lamp', 96, 168, 96, 88), ('dash', 192, 168, 128, 88),
    ('gauges', 320, 168, 128, 88), ('spare', 448, 168, 64, 88)]
for i, r in enumerate(a.ATLAS.regions):
    assert r.x >= 0 and r.y >= 4 and r.x + r.w <= a.ATLAS.width and r.y + r.h <= a.ATLAS.height
    for s in a.ATLAS.regions[:i]:
        assert r.x + r.w <= s.x or s.x + s.w <= r.x or r.y + r.h <= s.y or s.y + s.h <= r.y
original = ['body', 'trim', 'grille', 'tire', 'rim', 'seat', 'seat_pleat', 'light', 'tail', 'glass', 'gauge', 'amber', 'leather', 'spoke', 'glow', 'rear_glass', 'prop', 'prop_hub', 'arm', 'hardtop', 'hardtop_rib']
assert p.NAMES == original + ['resin', 'chrome']
assert p.PALETTE['resin'] == (24, 24, 24) and p.PALETTE['chrome'] == (200, 202, 205)
assert p.LIT_SLOTS == (7,)
for i, name in enumerate(original):
    assert a.ATLAS.face(name) == {'uv': [i * 4 + 1, 1], 'uv_size': [2, 2]}
assert a.region('dash', 'grain') == ('grain', 192, 168, 32, 32)
for x, y in [(191, 168), (224, 168), (192, 200), (0, 0), (0, 8)]:
    assert a.region_at(x, y) is None`);
});

it("allocates regions in declaration order regardless of module import order", () => {
  const painters = [
    "suv_paint_body",
    "suv_paint_headlight",
    "suv_paint_tail",
    "suv_paint_dash",
    "suv_paint_gauges",
  ];
  const modules = ["suv_texture", "suv_cubes", "suv_atlas"];
  const table = (painterOrder: string[], moduleOrder: string[]) =>
    JSON.parse(
      run(`stubs = {
    'suv_paint_body': [('panel', 300, 20, 'body'), ('trim', 180, 30, 'trim'), ('roof', 80, 12, 'hardtop')],
    'suv_paint_headlight': [('lens', 60, 12, 'light'), ('rim', 30, 20, 'chrome'), ('indicator', 20, 8, 'amber')],
    'suv_paint_tail': [('lens', 50, 10, 'tail'), ('rim', 40, 16, 'chrome'), ('indicator', 24, 12, 'amber')],
    'suv_paint_dash': [('grain', 80, 16, 'resin'), ('trim', 64, 12, 'trim')],
    'suv_paint_gauges': [('dial', 48, 12, 'gauge'), ('rim', 64, 20, 'chrome')],
}
for name in ${JSON.stringify(painterOrder)}:
    painter = load_tool(name)
    painter.REGIONS = tuple(load_tool('suv_texture').RegionSpec(*spec) for spec in stubs[name])
for name in ${JSON.stringify(moduleOrder)}: load_tool(name)
a = load_tool('suv_atlas')
print(json.dumps([(block, list(b.regions)) for block, b in a.BLOCKS.items()]))`),
    );
  const expected = [
    [
      "body",
      [
        ["body.panel", 0, 8, 300, 20],
        ["body.trim", 300, 8, 180, 30],
        ["body.roof", 0, 38, 80, 12],
      ],
    ],
    [
      "headlight",
      [
        ["headlight.lens", 0, 168, 60, 12],
        ["headlight.rim", 60, 168, 30, 20],
        ["headlight.indicator", 0, 188, 20, 8],
      ],
    ],
    [
      "tail_lamp",
      [
        ["tail_lamp.lens", 96, 168, 50, 10],
        ["tail_lamp.rim", 146, 168, 40, 16],
        ["tail_lamp.indicator", 96, 184, 24, 12],
      ],
    ],
    [
      "dash",
      [
        ["dash.grain", 192, 168, 80, 16],
        ["dash.trim", 192, 184, 64, 12],
      ],
    ],
    [
      "gauges",
      [
        ["gauges.dial", 320, 168, 48, 12],
        ["gauges.rim", 368, 168, 64, 20],
      ],
    ],
    ["spare", []],
  ];
  fc.assert(
    fc.property(
      fc.shuffledSubarray(painters, {
        minLength: painters.length,
        maxLength: painters.length,
      }),
      fc.shuffledSubarray(modules, {
        minLength: modules.length,
        maxLength: modules.length,
      }),
      (painterOrder, moduleOrder) => {
        expect(table(painterOrder, moduleOrder)).toEqual(expected);
      },
    ),
    { numRuns: 15 },
  );
});

it("dispatches local region pixels, material fallbacks and lit masks", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 31 }),
      fc.integer({ min: 0, max: 31 }),
      (u, v) => {
        run(`a = load_tool('suv_atlas')
t = load_tool('suv_texture')
p = load_tool('suv_palette')
r = a.region('dash', 'grain')
hit = a.region_at(r.x + ${u}, r.y + ${v})
assert hit == ('dash', t.RegionSpec('grain', 32, 32, 'resin'), ${u}, ${v})
for paint in p.BODY_PAINTS:
    assert t.paint_pixel(paint)(r.x + ${u}, r.y + ${v}) == (24, 24, 24, 255)
    assert t.paint_pixel(paint)(511, 255) == (0, 0, 0, 255)
assert not t.is_lit(r.x + ${u}, r.y + ${v})
assert t.is_lit(28, 0) and t.is_lit(31, 3) and not t.is_lit(28, 4)
painter = a.PAINTERS['dash']
assert painter.mer('grain', ${u}, ${v}, p.BODY_PAINTS[0]) is None
assert painter.relief('grain', ${u}, ${v}) is None
painter.color = lambda name, u, v, paint: (u, v, 123, 255)
painter.lit = lambda name, u, v: u == ${u} and v == ${v}
assert t.paint_pixel(p.BODY_PAINTS[0])(r.x + ${u}, r.y + ${v}) == (${u}, ${v}, 123, 255)
assert t.is_lit(r.x + ${u}, r.y + ${v})`);
      },
    ),
    { numRuns: 15 },
  );
});
