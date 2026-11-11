import fc from "fast-check";
import { afterAll, describe, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());
const run = (body: string) =>
  python.run(
    `import sys\nsys.path.insert(0, 'tools')\nfrom tool_loader import load_tool\nm = load_tool('gen_toilet')\n${body}`,
  );

describe("Toilet generator", () => {
  it("ports the ring tables, single-cube plates and declared tilted assemblies", async () => {
    await run(`
g = m.geometry()['minecraft:geometry'][0]
bones = {b['name']: b for b in g['bones']}
for name, count in m.LOFT_COUNTS.items():
    extra = 2 if name == 'lid' else 0 if name == 'tank' else 1
    assert len(bones[name]['cubes']) == count + extra
assert len(m.BODY) == 7 and len(m.INTERIOR) == 5
assert len(m.TANK) == 3 and len(m.CAP) == 4 and len(m.LID) == 3
assert bones['lid']['pivot'] == [round(v, m.DECIMALS) for v in m.HINGE]
assert bones['water']['pivot'] == [0,round(5.1*m.SCALE, m.DECIMALS),0]
assert list(bones)[-1] == 'water'
for name in ('swirl', 'rim_jets'):
    assert bones[name]['parent'] == 'root'
for prefix, count, parent in (('swirl',16,'swirl'),('rim_jet',6,'rim_jets')):
    for i in range(count):
        assert bones[f'{prefix}_{i}']['parent'] == parent
        assert len(bones[f'{prefix}_{i}']['cubes']) == 1
parts = [c for b in bones.values() for c in b.get('cubes', [])]
m.tilt.assert_axes(parts, {name:bones[name]['cubes'][:count] for name,count in m.LOFT_COUNTS.items()}, m.ASSEMBLIES)
for cube in parts:
    for face in cube['uv'].values():
        assert all(0 <= face['uv'][i] < face['uv'][i]+face['uv_size'][i] <= m.ATLAS_SIZE for i in (0,1))
plates = [c for c in parts if sum(f == m.HIDDEN for f in c['uv'].values()) == 5]
assert len(plates) == 9
assert sum(len(b.get('cubes',[])) for b in bones.values()) == 369
`);
  });

  it("keeps binary cutouts and edge RGB padding separate from translucent water", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 511 }),
        fc.integer({ min: 0, max: 511 }),
        async (x, y) => {
          await run(`
x,y = ${x},${y}
tile = x//m.TILE + 4*(y//m.TILE)
pixel = m.pixel(x,y)
assert len(pixel) == 4 and all(0 <= v <= 255 for v in pixel)
assert pixel[3] in ((0,153) if tile == 7 else (0,255))
if tile < 8:
    assert pixel[:3] == m.PLATES[tile][2]
`);
        },
      ),
      { numRuns: 80 },
    );
    await run(`
assert m.pixel(0,0) == (*m.WHITE,0)
assert m.pixel(128+64,64) == (*m.INNER,255)
assert m.pixel(2*128+64,96)[3] == 0
assert m.pixel(3*128+64,128+64) == (*m.WATER,153)
assert m.pixel(3*128,3*128)[3] == 0
for tile in range(8):
    alpha = {m.pixel((tile%4)*128+x,(tile//4)*128+y)[3] for x in range(128) for y in range(128)}
    assert alpha == ({0,153} if tile == 7 else {0,255})
opaque = [(x,y) for y in range(128) for x in range(128) if (x+.5-64)**2+(y+.5-64)**2 <= 61**2]
for x,y in ((0,0),(127,127),(0,64),(64,0),(10,18)):
    nearest = min((a-x)**2+(b-y)**2 for a,b in opaque)
    colors = {m.disc_color(a,b) for a,b in opaque if (a-x)**2+(b-y)**2 == nearest}
    assert m.padded_disc(x,y)[:3] in colors and m.padded_disc(x,y)[3] == 0
chrome = [m.pixel(x,3*128+64)[:3] for x in range(128)]
assert len(set(chrome)) > 50
assert max(sum(c) for c in chrome) > 740
assert min(sum(c) for c in chrome) < 450
`);
  });

  it("round-trips outputs and detects missing, stale geometry and changed texels without rewriting in check mode", async () => {
    await run(`
import tempfile, subprocess, json
from pathlib import Path
with tempfile.TemporaryDirectory(dir='.') as folder:
    cmd = [sys.executable,'-I','tools/gen_toilet.py',folder]
    root = Path(folder)
    result = subprocess.run(cmd+['--check'],capture_output=True,text=True)
    assert result.returncode and not list(root.iterdir())
    subprocess.run(cmd,check=True,capture_output=True)
    geo,tex = root/m.GEOMETRY,root/m.TEXTURE
    assert json.loads(geo.read_text()) == m.geometry()
    subprocess.run(cmd+['--check'],check=True,capture_output=True)
    geo.write_text('{}')
    result = subprocess.run(cmd+['--check'],capture_output=True,text=True)
    assert result.returncode and str(geo) in result.stderr and geo.read_text() == '{}'
    subprocess.run(cmd,check=True,capture_output=True)
    m.texture_io.Outputs(False).png(tex,m.ATLAS_SIZE,m.ATLAS_SIZE,
        lambda x,y: (0,0,0,0) if (x,y)==(64,64) else m.pixel(x,y))
    before = tex.read_bytes()
    result = subprocess.run(cmd+['--check'],capture_output=True,text=True)
    assert result.returncode and str(tex) in result.stderr and tex.read_bytes() == before
`);
  }, 30000);

  it("uses the rest pose in item and all photo previews without moving the lid", async () => {
    await run(`
import json
from pathlib import Path
r = load_tool('render_preview')
g = m.geometry()['minecraft:geometry'][0]
anims = json.loads(Path('packs/yasu_ride_rp/animations/yasu_ride/toilet.anim.json').read_text())['animations']
posed = r.static_pose(g,anims['animation.yasu_ride.toilet.rest'])
assert sum(len(b.get('cubes',[])) for b in posed['bones']) == 347
assert sum(len(b.get('cubes',[])) for b in g['bones']) == 369
for name in ('swirl','rim_jets'):
    assert all(not b.get('cubes') for b in posed['bones'] if b.get('parent') == name)
opened = r.open_lid(posed,91)
lid = next(b for b in opened['bones'] if b['name']=='lid')
assert lid['rotation'] == [-91,0,0]
turns = r.bone_turns(opened['bones'])
points = [r.rotate(p,*turns['lid'][0]) for c in lid['cubes'] for p in m.tilt.corners(c)]
assert max(p[1] for p in points) > 17
assert min(p[2] for p in points) > 0.5
`);
  });
});
