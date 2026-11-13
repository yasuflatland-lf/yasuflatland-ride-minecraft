import { afterAll, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());
it("builds repeatable kitchen fronts with one lacquer region and audited shared grain", async () => {
  const result = JSON.parse(
    await python.run(`
import json, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
k = load_tool('camper_kitchen_fronts')
kit = load_tool('camper_kit')
r = load_tool('camper_regions')
registry = r.RegionRegistry()
refs = kit.kitchen.register_kitchen(registry)
k.register_panel(registry)
registry.register(kit.BASE_REF.region)
r.pack(registry)
a = k.build_drawers(refs, registry).merge(k.build_cabinet_fronts(registry))
first = json.dumps(a)
wood = list(refs.BROWN_ENDGRAIN.uv(0, 0))
panel = list(k.register_panel(registry).uv(0, 0))
for name in ('drawer_bottom', 'drawer_top', 'cabinet_sink_door', 'cabinet_stove_door'):
    assert a[name][0]['uv']['west']['uv'] == panel
    assert all(face['uv'] == wood for side,face in a[name][0]['uv'].items() if side != 'west')
    assert all(face['uv'] == wood for c in a[name][1:] for face in c['uv'].values())
assert all(face['uv'] == wood for c in a['body'] for face in c['uv'].values())
b = k.build_drawers(refs, registry).merge(k.build_cabinet_fronts(registry))
print(json.dumps(dict(counts={n:len(c) for n,c in a.items()}, repeat=first==json.dumps(b), panel=[[v.name,v.width,v.height,v.material.name] for v in registry.regions() if v.name == 'routed cream panel'], audit=r.audit(registry._layout,r.render_atlas(registry._layout)))))
`),
  );
  expect(result).toEqual({
    counts: {
      drawer_bottom: 10,
      drawer_top: 10,
      body: 6,
      cabinet_sink_door: 2,
      cabinet_stove_door: 2,
    },
    repeat: true,
    panel: [["routed cream panel", 224, 160, "LACQUER"]],
    audit: [],
  });
});

it("matches the reference routed panel texels without an external image dependency", async () => {
  expect(
    await python.run(`
import sys, hashlib
sys.path.insert(0, 'tools')
from tool_loader import load_tool
print(hashlib.sha256(bytes(v for p in load_tool('camper_kitchen_fronts').panel_pixels() for v in p)).hexdigest())
`),
  ).toBe("8cca841df51ba96803304b6dd1fa7ae65862963449f629613cc4118056d3dcff\n");
});

it("preserves kitchen UVs when drawers follow the kitchen builder on a fresh registry", async () => {
  expect(
    await python.run(`
import json, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
k = load_tool('camper_kitchen')
f = load_tool('camper_kitchen_fronts')
r = load_tool('camper_regions')
registry = r.RegionRegistry()
kitchen, refs = k.build_kitchen_top(registry)
layout = registry._layout
before = layout.origin('flecked laminate')
f.build_drawers(refs, registry)
f.build_cabinet_fronts(registry)
assert registry._layout is layout, 'Builders must retain the packed layout and live face bindings'
assert registry._layout.origin('flecked laminate') == before
assert not r.audit(layout, r.render_atlas(layout))
print('stable')
`),
  ).toBe("stable\n");
});
