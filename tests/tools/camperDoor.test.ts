import { afterAll, describe, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());
const run = async (expression: string, setup = "") =>
  JSON.parse(
    await python.run(`
import json, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
kit = load_tool('camper_kit')
door = load_tool('camper_door')
${setup}
print(json.dumps(${expression}))
`),
  );

describe("camper door interiors", () => {
  it("registers the four full-resolution door materials", async () => {
    expect(
      await run(
        "[[r.name, r.width, r.height, r.material.value] for r in kit.REGISTRY.regions() if r.name.startswith('door ')]",
      ),
    ).toEqual([
      ["door wood", 111, 336, "wood"],
      ["door marble", 101, 41, "stone"],
      ["door kick", 101, 44, "metal"],
      ["door cloth", 16, 104, "fabric"],
    ]);
  });
  it("builds the complete entry interior without changing the glass count", async () => {
    expect(await run("len(door.build()['door_entry'])")).toBe(245);
  });
});

it("maps every shower panel face to door wood with vertical upright grain", async () => {
  const faces = await run(
    "panel['uv']",
    `
panel = door.build_shower_door(kit.REGISTRY)['shower_door'][0]
x, y = kit.LAYOUT.origin('door wood')
for face in panel['uv'].values():
    face['uv'][0] -= x
    face['uv'][1] -= y
`,
  );
  for (const side of ["north", "south", "east", "west"]) {
    expect(faces[side].uv[1]).toBeCloseTo(52.8);
    expect(faces[side].uv_size[1]).toBeCloseTo(283.2);
  }
  expect(faces.east.uv_size[0]).toBeCloseTo(-94.4);
  expect(faces.west.uv_size[0]).toBeCloseTo(94.4);
  for (const side of ["up", "down"]) {
    expect(faces[side].uv_size).toEqual([4.8, 94.4]);
  }
});

it("maps each entry wood field vertically at eight texels per pixel", async () => {
  const fields = await run(
    "fields",
    `
x, y = kit.LAYOUT.origin('door wood')
fields = []
for cube in door.build_door_entry(kit.REGISTRY)['door_entry']:
    face = cube['uv']['west']
    u, v = face['uv']
    if x <= u < x + 111 and y <= v < y + 336:
        fields.append([v - y, face['uv_size'][1]])
`,
  );
  expect(fields).toEqual([
    [144, 192],
    [0, 40],
    [40, 104],
    [40, 104],
  ]);
});

it("builds repeatably and audits every finish without growing geometry", async () => {
  expect(
    await run(
      "[a == b, len(a['shower_door']), kit.regions.audit(kit.LAYOUT, kit.regions.render_atlas(kit.LAYOUT))]",
      `
a = door.build()
b = door.build()
`,
    ),
  ).toEqual([true, 3, []]);
});
