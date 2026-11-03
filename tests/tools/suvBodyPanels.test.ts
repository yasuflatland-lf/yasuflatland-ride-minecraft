import { execFileSync } from "node:child_process";
import { it } from "vitest";

it("builds three raised roof panels without increasing the existing rib height", () => {
  execFileSync("python3", [
    "-I",
    "-c",
    `import math, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
g = load_tool('suv_greenhouse')
D = g.DIMS
def bounds(c):
    return (*c['origin'], *(a + b for a, b in zip(c['origin'], c['size'])))
def close(actual, expected):
    assert all(math.isclose(a, b, abs_tol=1e-9) for a, b in zip(actual, expected)), (actual, expected)
roof = g.roof_cubes()
assert len(roof) == 4
close(bounds(roof[0]), (-13, D.greenhouse.roof_y, D.chassis.rear_z, 13, D.greenhouse.roof_top, D.windshield.roof_front))
for c, (left, right) in zip(roof[1:3], ((0.2, 12.7), (-12.7, -0.2))):
    close(bounds(c), (left, D.greenhouse.roof_top, D.cabin.roof_seam_z + 0.2, right, D.greenhouse.roof_top + 0.2, D.windshield.roof_front - 0.3))
close(bounds(roof[3]), (-12.7, D.greenhouse.roof_top, D.chassis.rear_z + 0.3, 12.7, D.greenhouse.roof_top + 0.2, D.cabin.roof_seam_z - 0.2))
ribs = g.roof_rib_cubes()
assert len(ribs) == 15
for c in ribs[:2]:
    close((c['origin'][1], c['size'][1]), (D.greenhouse.roof_top, 0.05))
for c in ribs[2:]:
    close((c['origin'][1], c['size'][1]), (D.greenhouse.roof_top + 0.2, 0.1))
    x, y, z, X, Y, Z = bounds(c)
    assert any(p['origin'][0] <= x and X <= bounds(p)[3] and p['origin'][2] <= z and Z <= bounds(p)[5] for p in roof[1:])
for c in roof + ribs + g.roof_edge_cubes():
    assert all(s > 0 for s in c['size'])
    assert bounds(c)[4] <= D.greenhouse.roof_top + 0.3 + 1e-9`,
  ]);
});

it("frames recessed quarter glass and separates the tailgate from its corners and edge hinges", () => {
  execFileSync("python3", [
    "-I",
    "-c",
    `import math, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
r = load_tool('suv_rear')
p = load_tool('suv_paint_body')
D = r.DIMS
def close(actual, expected):
    assert len(actual) == len(expected)
    assert all(math.isclose(a, b, abs_tol=1e-9) for a, b in zip(actual, expected)), (actual, expected)
def check(c, origin, size, color):
    close(c['origin'], origin)
    close(c['size'], size)
    expected = r.box(*origin, *(a + b for a, b in zip(origin, size)), color)['uv']
    assert c['uv'].keys() == expected.keys()
    for face in expected:
        close(c['uv'][face]['uv'], expected[face]['uv'])
        close(c['uv'][face]['uv_size'], expected[face]['uv_size'])
quarter = r.cargo_upper_side_cubes()
assert len(quarter) == 4
depth = D.chassis.cargo_front_z - D.chassis.rear_z
height = D.greenhouse.window_top_y - D.greenhouse.window_bottom_y
check(quarter[0], (12, D.greenhouse.window_top_y, D.chassis.rear_z), (1, D.greenhouse.roof_y - D.greenhouse.window_top_y, depth), 'hardtop')
check(quarter[1], (12, D.greenhouse.window_bottom_y, D.chassis.rear_z), (1, height, 2.5), 'hardtop')
check(quarter[2], (12, D.greenhouse.window_bottom_y, D.chassis.cargo_front_z - 1.5), (1, height, 1.5), 'hardtop')
check(quarter[3], (12, D.greenhouse.window_bottom_y, D.chassis.rear_z + 2.5), (0.6, height, depth - 4), 'glass')
gate = r.tailgate_cubes()
assert len(gate) == 4
assert r.TAILGATE_HALF_WIDTH == 9.5
close(gate[0]['origin'], (-9.5, D.chassis.floor_y, D.chassis.rear_z))
close(gate[0]['size'], (19, D.greenhouse.belt_y - D.chassis.floor_y, 1))
region = r.suv_cubes.atlas.region('body', 'tailgate')
close(gate[0]['uv']['north']['uv'], (region.x, region.y))
close(gate[0]['uv']['north']['uv_size'], (76, 41))
for c, x in zip(gate[1:3], (9.5, -13)):
    close(c['origin'], (x, D.chassis.floor_y, D.chassis.rear_z))
    close(c['size'], (3.5, D.greenhouse.belt_y - D.chassis.floor_y, 1))
    assert c['uv']['north'] != gate[0]['uv']['north']
check(gate[3], (-13, D.greenhouse.window_top_y, D.chassis.rear_z), (26, D.greenhouse.roof_y - D.greenhouse.window_top_y, 1), 'hardtop')
assert p.PANEL_EXTENTS['tailgate'] == (19, D.greenhouse.belt_y - D.chassis.floor_y)
assert (p.SPECS['tailgate'].w, p.SPECS['tailgate'].h) == (76, 41)
hinges = r.tailgate_hinge_cubes()
assert len(hinges) == 4
for i, center in enumerate((D.greenhouse.belt_y - 3.7, D.chassis.floor_y + 2.9)):
    check(hinges[2 * i], (7.7, center - 0.8, D.chassis.rear_z - 0.25), (1.3, 1.6, 0.25), 'body')
    check(hinges[2 * i + 1], (9.0, center - 0.8, D.chassis.rear_z - 0.45), (0.5, 1.6, 0.45), 'body')
for c in quarter + gate + hinges:
    assert all(s > 0 for s in c['size'])`,
  ]);
});
