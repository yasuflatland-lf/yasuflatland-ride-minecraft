import { execFileSync } from "node:child_process";
import { it } from "vitest";

it("registers compound back rotations and rejects an oversized or forward-leaning chair", () => {
  execFileSync("python3", [
    "-I",
    "-c",
    `
import copy, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
m = load_tool('gen_dining_chair')
t = load_tool('cube_tilt')
parts = m.cubes()
assert len(t.compound_cubes(parts)) == m.BACK_PANELS + 7
try:
    t.assert_axes(parts, {})
except ValueError:
    pass
else:
    raise AssertionError('unregistered compound rotation accepted')
for axis in range(3):
    broken = copy.deepcopy(parts)
    broken[0]['size'][axis] += 100
    try:
        m.validate(broken)
    except ValueError:
        pass
    else:
        raise AssertionError('out-of-bounds chair accepted')
m.BACK_LEAN = -10
try:
    m.validate(m.cubes())
except ValueError:
    pass
else:
    raise AssertionError('forward lean accepted')
`,
  ]);
});
