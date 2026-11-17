import { afterAll, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

it("keeps folded stand bounds clear of the rear wheel and every engine cube", async () => {
  await python.run(`import json, sys
from pathlib import Path
sys.path.insert(0, 'tools')
from tool_loader import load_tool
g=load_tool('gen_scooter')
t=load_tool('cube_tilt')
d=load_tool('scooter_dims')
geo=json.loads(Path('packs/yasu_ride_rp/models/entity/yasu_ride/scooter.geo.json').read_text())
bones={b['name']:b for b in geo['minecraft:geometry'][0]['bones']}
engine=load_tool('scooter_engine').build()
assert {'engine_muffler','engine_header'} <= set(engine.assemblies)
g.kit.mirror_to_game([dict(name='body',pivot=[0,0,0],cubes=engine['body'])])
obstacles=[('rear wheel',t.bounds(bones['wheel_rear']['cubes']))]
obstacles.extend((f'engine cube {i}',t.bounds([c])) for i,c in enumerate(g.rounded(engine['body'])))
rotation=load_tool('scooter_anim').build()['animations']['animation.yasu_ride.scooter.stand_up']['bones']['stand']['rotation']
assert rotation==[d.STAND_UP_DEGREES,0,0]
pivot=bones['stand']['pivot']
assert tuple(pivot)==d.STAND_PIVOT
matrix=t.cube_matrix(rotation)
for index,cube in enumerate(bones['stand']['cubes']):
    points=[[pivot[i]+v for i,v in enumerate(t.apply_matrix(matrix,[p[j]-pivot[j] for j in range(3)]))]
            for p in t.corners(cube)]
    lo=[min(p[i] for p in points) for i in range(3)]
    hi=[max(p[i] for p in points) for i in range(3)]
    assert lo[1]>1, ('ground clearance',index,lo)
    for name,(other_lo,other_hi) in obstacles:
        assert any(hi[i]+0.01<other_lo[i] or other_hi[i]+0.01<lo[i] for i in range(3)), (index,name,lo,hi)
`);
});
