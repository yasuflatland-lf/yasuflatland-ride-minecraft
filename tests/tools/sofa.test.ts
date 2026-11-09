import fc from "fast-check";
import { afterAll, describe, it } from "vitest";
import { startPythonWorker } from "../support/pythonWorker";

const python = startPythonWorker();
afterAll(() => python.close());
const run = (body: string) =>
  python.run(
    `import sys\nsys.path.insert(0, 'tools')\nfrom tool_loader import load_tool\nm = load_tool('gen_sofa')\n${body}`,
  );

describe("shared sofa generator", () => {
  it("keeps both widths inside their cells including every tilted corner", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 2 }), async (width) => {
        await run(`
w = ${width}
parts = m.cubes(w)
m.validate(parts, w)
lo, hi = m.tilt.bounds(parts)
assert hi[0]-lo[0] <= w*16-0.8+1e-6
assert hi[2]-lo[2] <= 15.2+1e-6
assert lo[1] == 0 and 11.5 < hi[1] <= 12.8
for cube in parts:
    for face in cube['uv'].values():
        assert all(0 <= face['uv'][i] <= face['uv'][i]+face['uv_size'][i] <= m.ATLAS_SIZE for i in (0,1))
`);
      }),
      { numRuns: 10 },
    );
  });
  it("widens the reusable frame, cushions and feet without stretching weave pitch", async () => {
    await run(`
for build in (m.build_frame, m.build_cushions, m.build_feet):
    a, b = [m.tilt.bounds(build(w)) for w in (1,2)]
    assert b[1][0]-b[0][0] > a[1][0]-a[0][0]+15
    assert a[0][1:] == b[0][1:] and a[1][1:] == b[1][1:]
assert len(m.build_feet(1)) == len(m.build_feet(2)) == 4
assert len(m.build_cushions(2)) == len(m.build_cushions(1))+6
assert len(m.tilt.compound_cubes(m.cubes())) == m.ASSEMBLIES['throw_cushion']['cubes']
assert len(m.tilt.compound_cubes(m.cubes(2))) == sum(a['cubes'] for a in m.ASSEMBLIES.values())
seat, back_left, back_right, throw_left, throw_right = [m.build_cushions(2)[i:i+3] for i in range(0,15,3)]
assert len(m.build_cushions(2)) == 15
assert all(c['size'][0] > 25 for c in seat)
assert all(c['origin'][0] < 0 for c in back_left)
assert all(c['origin'][0] >= 0 for c in back_right)
left = sorted((round(p[0],6),round(p[1],6),round(p[2],6)) for c in throw_left for p in m.tilt.corners(c))
right = sorted((round(-p[0],6),round(p[1],6),round(p[2],6)) for c in throw_right for p in m.tilt.corners(c))
assert left == right
assert m.geometry(2)['minecraft:geometry'][0]['description']['identifier'] == 'geometry.yasu_ride.sofa_double'
assert m.SEAT_POSITION[1] == m.SEAT_TOP/16-0.24
`);
  });
  it("rejects widths outside the supported single and double variants", async () => {
    await run(`
for width in (0, 3, -1, True, 1.5):
    for build in (m.build_frame, m.build_cushions, m.build_feet):
        try:
            build(width)
        except ValueError:
            pass
        else:
            raise AssertionError(width)
`);
  });
  it("round-trips generated files and detects stale geometry and texels", async () => {
    await run(`
import tempfile, subprocess, json
from pathlib import Path
with tempfile.TemporaryDirectory() as folder:
    cmd = [sys.executable, '-I', 'tools/gen_sofa.py', folder]
    subprocess.run(cmd, check=True, capture_output=True)
    subprocess.run(cmd+['--check'], check=True, capture_output=True)
    root = Path(folder)
    for name in ('sofa_single', 'sofa_double'):
        geo = root/f'models/entity/yasu_ride/{name}.geo.json'
        geo.write_text('{}')
        result = subprocess.run(cmd+['--check'], capture_output=True, text=True)
        assert result.returncode and str(geo) in result.stderr
        subprocess.run(cmd, check=True, capture_output=True)
        texture = root/f'textures/entity/yasu_ride/{name}.png'
        m.texture_io.Outputs(False).png(texture, 1, 1, lambda x,y: (0,0,0,0))
        result = subprocess.run(cmd+['--check'], capture_output=True, text=True)
        assert result.returncode and str(texture) in result.stderr

`);
  }, 30000);
});
