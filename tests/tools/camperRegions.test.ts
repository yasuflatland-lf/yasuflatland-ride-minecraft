import { afterAll, describe, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());
const run = async <T>(setup: string, expression: string): Promise<T> =>
  JSON.parse(
    await python.run(`import json, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
m = load_tool('region_atlas')
materials = load_tool('camper_regions')
${setup}
print(json.dumps(${expression}))`),
  );

describe("camper region registry", () => {
  it("registers the six dashboard regions with the approved pixels and materials", async () => {
    expect(
      await run(
        `import hashlib
kit = load_tool('camper_kit')
dashboard_names = {'cab SPEED', 'cab QUAD', 'cab PAD', 'cab RADIO', 'cab SMALL', 'cab DARK19'}
selected = [r for r in kit.REGISTRY.regions() if r.name in dashboard_names]`,
        "[[r.name, r.width, r.height, r.material.value, hashlib.sha256(bytes(c for y in range(r.height) for x in range(r.width) for c in r.pixel(x,y))).hexdigest()] for r in selected]",
      ),
    ).toEqual([
      [
        "cab SPEED",
        128,
        128,
        "glass_coat",
        "a17300945ab36ec52abe746fd3672eef13d9f08b4c40118bd53a03be272dc63a",
      ],
      [
        "cab QUAD",
        128,
        128,
        "glass_coat",
        "ee2c45e13b9a1705830628f72128202fd20a17eb5a312e62899004632eaac991",
      ],
      [
        "cab PAD",
        184,
        48,
        "vinyl",
        "486ea611ed466a9e67d19d4954ed4a9051910c3d88b91e2ccfbb216a1f0805ca",
      ],
      [
        "cab RADIO",
        144,
        40,
        "metal",
        "b37a7f7b5de638b9eb2b3aad71f43f80836cb8c0955c222854ace0d1a6926b55",
      ],
      [
        "cab SMALL",
        128,
        60,
        "glass_coat",
        "b6b77379755e6e2f974f4bb78f64a9a5f641c121b1fc28f2852664dfc56aeaad",
      ],
      [
        "cab DARK19",
        1,
        1,
        "dark_lacquer",
        "1a93b51f95cce226460cda2e9cb83e9943978987534d498b8f501178bc9cdf63",
      ],
    ]);
  });

  it("renders the registered base without running the generator", async () => {
    expect(
      await run(
        "kit = load_tool('camper_kit')",
        "m.audit(kit.LAYOUT, m.render_atlas(kit.LAYOUT))",
      ),
    ).toEqual([]);
  });
});

it("registers the shower materials before packing and audits every emitted face", async () => {
  const result = await run<unknown[]>(
    `
kit = load_tool('camper_kit')
shower = load_tool('camper_shower')
layout = kit.LAYOUT
built = shower.build_shower(kit.REGISTRY)
for cubes in built.values():
    for cube in cubes:
        for face in cube['uv'].values(): layout.bind_face(layout.face_region(face), face)
`,
    "[[[r.name, r.width, r.height, r.material.value] for r in kit.REGISTRY.regions() if r.name != 'base'], m.audit(layout, m.render_atlas(layout))]",
  );
  expect(result).toEqual([
    [
      ["olive looped tweed", 192, 256, "fabric"],
      ["olive khaki cream bolster", 128, 128, "fabric"],
      ["olive welt", 32, 32, "fabric"],
      ["green tweed and vinyl shared by both seats", 333, 128, "fabric"],
      ["cab seat vinyl", 64, 64, "vinyl"],
      ["cab seat vinyl swatches", 6, 1, "vinyl"],
      ["flecked laminate", 192, 192, "lacquer"],
      ["brushed stainless", 128, 64, "metal"],
      ["range dial", 64, 64, "glass_coat"],
      ["dark olive cab panel", 128, 64, "dark_lacquer"],
      ["brown endgrain and pulls", 128, 128, "wood"],
      ["carpet v3", 74, 222, "carpet"],
      ["wall veneer", 416, 180, "wood"],
      ["backsplash tile", 124, 152, "tile"],
      ["table oak", 168, 144, "wood"],
      ["light curtain fabric", 96, 120, "fabric"],
      ["door wood", 111, 336, "wood"],
      ["door marble", 101, 41, "stone"],
      ["door kick", 101, 44, "metal"],
      ["door cloth", 16, 104, "fabric"],
      ["cab SPEED", 128, 128, "glass_coat"],
      ["cab QUAD", 128, 128, "glass_coat"],
      ["cab PAD", 184, 48, "vinyl"],
      ["cab RADIO", 144, 40, "metal"],
      ["cab SMALL", 128, 60, "glass_coat"],
      ["cab DARK19", 1, 1, "dark_lacquer"],
      ["routed cream panel", 224, 160, "lacquer"],
      ["shower glaze", 128, 354, "tile"],
      ["shower head", 64, 64, "metal"],
      ["shower grip", 16, 80, "metal"],
      ["shower hose", 16, 256, "metal"],
    ],
    [],
  ]);
});

it("matches the catalogue's 950 shower additions after lossless cleanup", async () => {
  expect(
    await run(
      `kit = load_tool('camper_kit')
layout = kit.LAYOUT
shower = load_tool('camper_shower')
built = shower.build_shower(kit.REGISTRY)
door = load_tool('camper_door').build_shower_door(kit.REGISTRY)`,
      "[len(built['body']) - len(shower.room_base()['body']), len(door['shower_door'])]",
    ),
  ).toEqual([950, 3]);
});

it("builds shower faces against a caller's packed registry when its base origin moves", async () => {
  expect(
    await run(
      `kit = load_tool('camper_kit')
shower = load_tool('camper_shower')
shared = kit.LAYOUT
registry = m.RegionRegistry()
registry.register(kit.BASE_REF.region)
shower.register_regions(registry)
registry.register(m.Region('other area', 200, 800, materials.Material.WOOD, lambda x, y: (1, 2, 3, 255)))
layout = m.pack(registry)
assert layout.origin('base') != shared.origin('base')
built = shower.build_shower(registry)
assert built['body'][0]['uv']['north']['uv'] == [layout.origin('base')[0] + kit.SLOTS.index('ivory'), layout.origin('base')[1]]
for cubes in built.values():
    for cube in cubes:
        for face in cube['uv'].values(): layout.bind_face(layout.face_region(face), face)
`,
      "m.audit(layout, m.render_atlas(layout))",
    ),
  ).toEqual([]);
});

it("preserves the approved shower region RGBA bytes independently of packing", async () => {
  expect(
    await run(
      `import hashlib
kit = load_tool('camper_kit')
layout = kit.LAYOUT
`,
      "{r.name: hashlib.sha256(bytes(c for y in range(r.height) for x in range(r.width) for c in r.pixel(x, y))).hexdigest() for r in kit.REGISTRY.regions() if r.name.startswith('shower ')}",
    ),
  ).toEqual({
    "shower glaze":
      "131787556502c48acfaaf05d8cdb57f05be43af874278b10fcf8a8e7d0fe00e5",
    "shower head":
      "da2c3a7bb66e447063774c8af11daed25f1c8241e2ceb1aba032b66211dfcfdb",
    "shower grip":
      "c1422dd8a8b163b3bdb090517ea085fbd75ad7c8af2184b4a13804df96fec7ee",
    "shower hose":
      "45e3c718c89eba216b3fcc0db49046cdc148c8ff264f57ee0b17f557de0267cd",
  });
});
