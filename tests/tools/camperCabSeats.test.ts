import fc from "fast-check";
import { afterAll, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());

it("registers deterministic shared cloth and vinyl and builds independent cab seats", async () => {
  await python.run(`
import sys, json, hashlib
from pathlib import Path
sys.path.insert(0, str(Path('tools').resolve()))
from tool_loader import load_tool
assert Path('tools/camper_cab_seats.py').exists(), 'rounded cab seat builder is missing'
kit = load_tool('camper_kit')
seats = load_tool('camper_cab_seats')
first = seats.build_cab_seats(kit.REGISTRY)
assert isinstance(first, kit.AreaCubes)
assert list(first) == ['seat_0', 'seat_1']
assert all(len(cubes) == 501 for cubes in first.values())
assert 'seat_0' not in load_tool('camper_cab').build()
regions = {r.name: r for r in kit.REGISTRY.regions()}
cloth = regions['green tweed and vinyl shared by both seats']
assert (cloth.width, cloth.height, cloth.material) == (333, 128, kit.regions.Material.FABRIC)
assert any(r.material == kit.regions.Material.VINYL for r in regions.values())
assert len({cloth.pixel(x, y) for x in range(128) for y in range(128)}) == 7
# The approved complete slab, including transparent padding and thirteen swatches.
rgba = bytes(channel for y in range(cloth.height) for x in range(cloth.width) for channel in cloth.pixel(x,y))
assert hashlib.sha256(rgba).hexdigest() == '1b90ae7fb5be0cdd714f8b5a2ab14cbf93aab8756ea0ddf4984d72bb8810d7ad'
snapshot = json.dumps(first)
first['seat_0'][0]['origin'][0] += 100
assert json.dumps(seats.build_cab_seats(kit.REGISTRY)) == snapshot
assert kit.regions.audit(kit.LAYOUT, kit.regions.render_atlas(kit.LAYOUT)) == []
`);
}, 30_000);

it("keeps transformed seat boxes clear of the wheel, door armrests, and lap belts", async () => {
  await python.run(`
import json, sys, math
from pathlib import Path
sys.path.insert(0, str(Path('tools').resolve()))
from tool_loader import load_tool
tilt = load_tool('cube_tilt')
model = json.loads(Path('packs/yasu_ride_rp/models/entity/yasu_ride/camper.geo.json').read_text())['minecraft:geometry'][0]
bones = {b['name']: b for b in model['bones']}
def points(cube, bone):
    corners = tilt.corners(cube)
    if any(bone.get('rotation', [])):
        matrix = tilt.cube_matrix(bone['rotation'])
        pivot = bone['pivot']
        corners = [[p + d for p, d in zip(pivot, tilt.apply_matrix(matrix, [v-p for v,p in zip(c, pivot)]))] for c in corners]
    return corners

def sub(a, b): return [x-y for x,y in zip(a,b)]
def dot(a, b): return sum(x*y for x,y in zip(a,b))
def cross(a,b): return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
def overlap(a, b):
    ae = [sub(a[i], a[0]) for i in (1,2,4)]
    be = [sub(b[i], b[0]) for i in (1,2,4)]
    for axis in ae + be + [cross(x,y) for x in ae for y in be]:
        length = math.sqrt(dot(axis, axis))
        if length < 1e-9: continue
        axis = [x/length for x in axis]
        aa, bb = [dot(p,axis) for p in a], [dot(p,axis) for p in b]
        if min(max(aa),max(bb)) - max(min(aa),min(bb)) <= .002: return False
    return True

# Exercise both separation and intersection, including a rotated thin box.
a = {'origin':[0,0,0], 'size':[2,2,2]}
b = {'origin':[.5,.5,.5], 'size':[2,.1,.1], 'pivot':[.5,.5,.5], 'rotation':[0,45,0]}
assert overlap(points(a, {}), points(b, {}))
b['origin'][1] = 3
assert not overlap(points(a, {}), points(b, {}))
armrests = [c for c in bones['body']['cubes'] if c['origin'][1] == 22 and c['size'][1:] == [1.4,8]]
assert len(armrests) == 2
obstacles = [points(c, bones['body']) for c in armrests]
obstacles += [points(c, bones['steering']) for c in bones['steering']['cubes']]
for name in ('seat_0','seat_1'):
    seat = bones[name]
    assert len(seat['cubes']) == 501
    boxes = [points(c, seat) for c in seat['cubes']]
    for i, box in enumerate(boxes):
        assert not any(overlap(box, obstacle) for obstacle in obstacles), (name, i, 'cab clearance')
    belt = boxes[-3]
    assert seat['cubes'][-3]['rotation'] == [0,7,0]
    # The golden belt's outboard end attaches through the lower bolster and piping.
    contacts = [i for i, box in enumerate(boxes[:-3]) if overlap(box, belt)]
    assert contacts == [23, 32], (name, contacts)
    from copy import deepcopy
    lap = deepcopy(seat['cubes'][-3])
    anchor_length = 1.6
    lap['origin'][0] += anchor_length
    lap['size'][0] -= 2 * anchor_length
    exposed = points(lap, seat)
    assert not any(overlap(box, exposed) for box in boxes[:-3]), (name, 'exposed belt clearance')
`);
}, 30_000);

it("keeps seat UVs inside their material regions after arbitrary atlas relocation", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 1, max: 512 }),
      fc.integer({ min: 1, max: 256 }),
      async (width, height) => {
        await python.run(`
import sys
from pathlib import Path
sys.path.insert(0, str(Path('tools').resolve()))
from tool_loader import load_tool
kit = load_tool('camper_kit')
seats = load_tool('camper_cab_seats')
r = kit.regions.RegionRegistry()
r.register(kit.BASE_REF.region)
r.register(kit.regions.Region('other', ${width}, ${height}, kit.regions.Material.WOOD, lambda x,y: (1,2,3,255)))
area = seats.build_cab_seats(r)
assert len(area['seat_0']) == len(area['seat_1']) == 501
assert kit.regions.audit(r._layout, kit.regions.render_atlas(r._layout)) == []
for cubes in area.values():
    used = set()
    for cube in cubes:
        for face in cube['uv'].values():
            u,v = face['uv']; du,dv = face['uv_size']
            owners = []
            for region in r.regions():
                x,y = r._layout.origin(region.name)
                e = 1e-6
                if x - e <= min(u,u+du) <= max(u,u+du) <= x+region.width + e and y - e <= min(v,v+dv) <= max(v,v+dv) <= y+region.height + e:
                    owners.append(region.material)
            assert len(owners) == 1
            used.update(owners)
    assert used == {kit.regions.Material.FABRIC, kit.regions.Material.VINYL, kit.regions.Material.SWATCHES_MIXED}
`);
      },
    ),
    { numRuns: 5, examples: [[131, 155]] },
  );
}, 30_000);
