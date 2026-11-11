import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());
const PYTHON_PROPERTY_TIMEOUT_MS = 30_000;
const preamble = `import copy, json, math, sys
sys.path.insert(0, 'tools')
import gear_kit as g
import cube_tilt as ct
# The worker keeps imported modules between runs, so reset the switches a previous run flipped.
g.COMPOUND_TILTS = True
g.ALPHA_CUT_PLATES = True
args = json.loads(sys.stdin.read())
face = {'uv': [0, 0], 'uv_size': [8, 8]}
table = {'test': {'owner': 'test', 'cubes': 0}}
def inside(p, c, tol=1e-3):
    m = ct.cube_matrix(c.get('rotation', [0,0,0]))
    pivot = c.get('pivot', [0,0,0])
    q = [sum(m[j][i]*(p[j]-pivot[j]) for j in range(3))+pivot[i] for i in range(3)]
    return all(c['origin'][i]-tol <= q[i] <= c['origin'][i]+c['size'][i]+tol for i in range(3))
def check(call):
    before = copy.deepcopy(face)
    a, b = call(), call()
    assert a == b and face == before
    g.assert_rule(a)
    compound = ct.compound_cubes(a)
    ct.assert_axes(a, {'test': compound}, {'test': {'owner': 'test', 'cubes': len(compound)}})
    if a:
        a[0]['uv']['up']['uv'][0] = 999
        assert face == before and b[0]['uv']['up']['uv'][0] == 0
    return b
def rejects(call, text=''):
    try:
        call()
    except ValueError as error:
        assert text in str(error)
    else:
        raise AssertionError('expected ValueError')
`;
const run = async (script: string, args: unknown = null) => {
  expect(
    (
      await python.run(
        `${preamble}\n${script}\nprint('ok')`,
        JSON.stringify(args),
      )
    ).trim(),
  ).toBe("ok");
};
const runs = { numRuns: 20 };
const dimension = fc.integer({ min: 2, max: 10 });

describe("gear geometry kit", { timeout: PYTHON_PROPERTY_TIMEOUT_MS }, () => {
  it("closes rings with overlapping yaw-only edges and validates sizes", async () => {
    await fc.assert(
      fc.asyncProperty(
        dimension,
        fc.integer({ min: 8, max: 32 }),
        async (a, n) => {
          await run(
            `a, n = args
for mode in (True, False):
    g.COMPOUND_TILTS = mode
    cubes = check(lambda: g.ring(n, a, 0, 2, face))
    assert len(cubes) == n
    for c in cubes:
        assert c['size'][0] > 2*a*math.tan(math.pi/n)
        assert c['rotation'][0] == c['rotation'][2] == 0
for n in (0, 7, 33):
    rejects(lambda: g.ring(n, a, 0, 1, face))
rejects(lambda: g.ring(8, 0.5, 0, 1, face))
rejects(lambda: g.ring(8, a, 1, 0, face))`,
            [a, n],
          );
        },
      ),
      runs,
    );
  });

  it("closes constant lofts in both modes and builds local pitch before yaw", async () => {
    await fc.assert(
      fc.asyncProperty(
        dimension,
        fc.integer({ min: 8, max: 24 }),
        async (a, n) => {
          await run(
            `a, n = args
s = {'a': a, 'zf': -a, 'zb': a, 'nf': 2, 'nb': 2}
rings = [(0, s), (2, dict(s))]
before = copy.deepcopy(rings)
for mode in (True, False):
    g.COMPOUND_TILTS = mode
    for inward in (False, True):
        cubes = check(lambda: g.loft(rings, face, sides=n, inward=inward, assembly='test', assemblies=table))
        for y, outline in rings:
            for x, z in g.outline_points(outline, n):
                assert sum(inside([x,y,z], c) for c in cubes) >= 2
        if not mode:
            assert all(c['size'][1] <= g.STEP+g.STEP_VERTICAL_OVERLAP+1e-4 and c['rotation'][0] == 0 for c in cubes)
        lo, hi = ct.bounds(cubes)
        assert lo[1] >= -0.4-g.LOFT_Y_OVERLAP
        assert hi[1] <= 2+0.4+g.LOFT_Y_OVERLAP
assert rings == before
rounded = dict(s, r=1)
for mode in (True, False):
    g.COMPOUND_TILTS = mode
    cubes = g.loft([(0,rounded),(2,rounded)], face)
    for x,z in g.outline_points(rounded,n):
        assert sum(inside([x,0,z],c) for c in cubes) >= 2
g.COMPOUND_TILTS = True
sloped = [(0,s), (2,dict(s, a=a+0.02, zf=-a-0.02, zb=a+0.02))]
cubes = check(lambda: g.loft(sloped, face, sides=n, assembly='test', assemblies=table))
assert ct.compound_cubes(cubes)
for y, outline in sloped:
    for x,z in g.outline_points(outline,n):
        assert sum(inside([x,y,z],c) for c in cubes) >= 2
rejects(lambda: g.loft(sloped, face, sides=n), '0247')
lower = g.outline_points(sloped[0][1],n)
upper = g.outline_points(sloped[1][1],n)
for j,c in enumerate(cubes):
    rotation = c['rotation']
    nxt = (j+1)%n
    u = [(lower[nxt][0]-lower[j][0]+upper[nxt][0]-upper[j][0])/2,0,(lower[nxt][1]-lower[j][1]+upper[nxt][1]-upper[j][1])/2]
    v = [(upper[j][0]-lower[j][0]+upper[nxt][0]-lower[nxt][0])/2,2,(upper[j][1]-lower[j][1]+upper[nxt][1]-lower[nxt][1])/2]
    ex = [x/math.sqrt(sum(t*t for t in u)) for x in u]
    vp = [v[i]-ex[i]*sum(v[k]*ex[k] for k in range(3)) for i in range(3)]
    m = ct.cube_matrix(rotation)
    assert abs(abs(sum(m[i][0]*ex[i] for i in range(3)))-1)<1e-6
    assert abs(abs(sum(m[i][1]*vp[i] for i in range(3)))/math.sqrt(sum(t*t for t in vp))-1)<1e-6
    assert ct.cube_matrix(rotation) == ct.panel_matrix(*rotation[:2])
    assert len(ct.corners(c)) == 8
rejects(lambda: g.loft([(1,s),(0,s)], face))
rejects(lambda: g.loft([(0,s),(1,dict(s,r=0.5))], face))
# A changing outline still closes at both rings when each step's change is under the wall thickness.
wide = dict(s, a=a+1, zf=-a-1, zb=a+1)
for mode in (True, False):
    g.COMPOUND_TILTS = mode
    for inward in (False, True):
        for grown in ([(0, s), (2, wide)], [(0, wide), (2, s)]):
            cubes = g.loft(grown, face, sides=n, inward=inward, assembly='test', assemblies=table)
            for y, outline in grown:
                for x, z in g.outline_points(outline, n):
                    assert sum(inside([x,y,z], c) for c in cubes) >= 2, (mode, inward, y, x, z)
g.COMPOUND_TILTS = True`,
            [a, n],
          );
        },
      ),
      runs,
    );
  });

  it("extrudes convex and concave profiles without gaps and with exact bounds", async () => {
    await fc.assert(
      fc.asyncProperty(dimension, dimension, async (w, h) => {
        await run(
          `w, h = args
for polygon in ([[0,0],[w,0],[w,h],[0,h]], [[0,0],[w,0],[w,h/3],[w/3,h/3],[w/3,2*h/3],[w,2*h/3],[w,h],[0,h]], [[0,0],[w,h/2],[0,h]], [[0,0],[0.1,0],[w,h-0.1],[w,h],[w-0.1,h],[0,0.1]]):
    before = copy.deepcopy(polygon)
    cubes = check(lambda: g.extrude(polygon, 0.6, face, z=1))
    assert polygon == before
    lo, hi = ct.bounds(cubes)
    assert all(abs(a-b)<1e-4 for a,b in zip(lo+hi,[0,0,0.7,w,h,1.3]))
    assert all(not any(c.get('rotation', [])) for c in cubes)
    for ix in range(41):
        for iy in range(41):
            x, y = w*ix/40, h*iy/40
            hits = 0
            for a,b in zip(polygon,polygon[1:]+polygon[:1]):
                if (a[1]>y)!=(b[1]>y) and x < a[0]+(b[0]-a[0])*(y-a[1])/(b[1]-a[1]):
                    hits += 1
            if hits%2:
                assert any(inside([x,y,1],c) for c in cubes)
    for c in cubes:
        top = c['origin'][1]+c['size'][1]
        next_band = [d for d in cubes if abs(d['origin'][1]-top)<1e-4]
        if next_band:
            assert any(min(c['origin'][0]+c['size'][0], d['origin'][0]+d['size'][0]) >= max(c['origin'][0],d['origin'][0])-1e-4 for d in next_band)`,
          [w, h],
        );
      }),
      runs,
    );
  });

  it("plates use exact alpha bounds or conservative strips avoiding offset holes", async () => {
    await fc.assert(
      fc.asyncProperty(dimension, dimension, async (a, depth) => {
        await run(
          `a, depth = args
for s in ({'a':a,'zf':-depth,'zb':depth,'xc':1}, {'a':a,'zf':-depth,'zb':depth,'xc':1,'r':1}):
    hole = {'a':0.5,'zf':-0.7,'zb':0.7,'xc':1.3}
    before = copy.deepcopy([s,hole])
    g.ALPHA_CUT_PLATES = True
    cubes = check(lambda: g.plate(s, 0, 0.2, face, hole))
    assert len(cubes)==1
    assert ct.bounds(cubes) == ([1-a,0,-depth],[1+a,0.2,depth])
    g.ALPHA_CUT_PLATES = False
    cubes = check(lambda: g.plate(s, 0, 0.2, face, hole))
    assert cubes
    for c in cubes:
        for p in ct.corners(c):
            assert s['zf']-1e-4 <= p[2] <= s['zb']+1e-4
            assert abs(p[0]-1) <= g.width_at(s,p[2])+1e-3
        for i in range(11):
            z = c['origin'][2]+c['size'][2]*i/10
            if hole['zf'] <= z <= hole['zb']:
                hw = g.width_at(hole,z)
                assert c['origin'][0]+c['size'][0] <= 1.3-hw+1e-3 or c['origin'][0] >= 1.3+hw-1e-3
    assert [s,hole] == before
rejects(lambda: g.outline_points({'a':1,'zf':-1,'zb':1,'r':2}))`,
          [a, depth],
        );
      }),
      runs,
    );
  });

  it("bounds planar polygons in broad faces with horizontal local x and normalized face UVs", async () => {
    await fc.assert(
      fc.asyncProperty(dimension, dimension, async (w, h) => {
        await run(
          `w,h = args
for points, axes in (([[0,0,0],[w,0,0],[w,0,h],[0,0,h]],1),
                     ([[0,0,0],[w,0,0],[w,h,0]],0),
                     ([[0,0,0],[0,0,w],[0,h,w]],1),
                     ([[0,0,0],[w,0,w],[w,h,w+h],[0,h,h]],2)):
    cube, uv = g.planar(points, face, .04, assembly='test', assemblies=table)
    assert ct.axis_count(cube) == axes
    assert cube['rotation'][2] == 0
    corners = ct.corners(cube)
    # Corner bit order is x + 2y + 4z, so opposite broad faces differ by four.
    center_plane = [[(corners[i][a]+corners[i+4][a])/2 for a in range(3)] for i in range(4)]
    a,b,c = center_plane[0],center_plane[1],center_plane[2]
    ex,ey = [b[i]-a[i] for i in range(3)],[c[i]-a[i] for i in range(3)]
    for p,(u,v) in zip(points,uv):
        assert inside(p,cube)
        assert -1e-6 <= u <= 1+1e-6 and -1e-6 <= v <= 1+1e-6
        reconstructed = [a[i]+u*ex[i]+(1-v)*ey[i] for i in range(3)]
        assert max(abs(p[i]-reconstructed[i]) for i in range(3)) < .001
    if axes == 2:
        rejects(lambda: g.planar(points,face,.04), 'assembly')
rejects(lambda: g.planar([[0,0,0],[1,0,0],[2,0,0]],face,.1))
rejects(lambda: g.planar([[0,0,0],[1,0,0],[1,1,0],[0,1,1]],face,.1))`,
          [w, h],
        );
      }),
      runs,
    );
  });

  it("tubes contain segment endpoints and switch to yaw-only stairs", async () => {
    await fc.assert(
      fc.asyncProperty(dimension, dimension, dimension, async (x, y, z) => {
        await run(
          `x,y,z = args
points = [[0,0,0],[x,y,z],[x+1,y,z+2],[x+1,y+2,z+2]]
before = copy.deepcopy(points)
for mode in (True,False):
    g.COMPOUND_TILTS = mode
    cubes = check(lambda: g.tube(points, 0.3, face, assembly='test', assemblies=table))
    assert all(any(inside(p,c) for c in cubes) for p in points)
    if mode:
        for a,b,c in zip(points,points[1:],cubes):
            assert inside(a,c) and inside(b,c)
            if c.get('rotation'):
                axis = ct.apply_matrix(ct.cube_matrix(c['rotation']), [0,0,1])
                d = [b[i]-a[i] for i in range(3)]
                assert all(abs(axis[i]-d[i]/math.sqrt(sum(v*v for v in d)))<1e-5 for i in range(3))
    else:
        assert all(ct.axis_count(c)<=1 for c in cubes)
        assert all(c['size'][1]-0.3 <= g.STEP+1e-4 for c in cubes[:-2])
assert points == before
for endpoint in ([2,0,0],[-2,0,0],[0,2,0],[0,-2,0],[0,0,2],[0,0,-2]):
    c = g.tube([[0,0,0],endpoint],0.3,face)[0]
    assert not any(c.get('rotation', []))
    assert inside([0,0,0],c) and inside(endpoint,c)
horizontal = g.tube([[0,0,0],[2,0,-3]],0.3,face)[0]
assert horizontal['rotation'][0] == horizontal['rotation'][2] == 0
g.COMPOUND_TILTS = True
rejects(lambda: g.tube(points,0.3,face), '0167')
rejects(lambda: g.tube([],0.3,face))
rejects(lambda: g.tube([[0,0,0],[0,0,0]],0.3,face))
for rotation in ([1,2,3],[0,0,1]):
    rejects(lambda: g.assert_rule([{'rotation':rotation}]),'0247')
g.COMPOUND_TILTS = False
rejects(lambda: g.assert_rule([{'rotation':[1,2,0]}]),'0247')`,
          [x, y, z],
        );
      }),
      runs,
    );
  });
});
