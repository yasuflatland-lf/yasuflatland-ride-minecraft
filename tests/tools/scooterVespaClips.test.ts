import { execFileSync } from "node:child_process";
import { it } from "vitest";

it("plans exact loop lengths and rejects invalid seam fades without FFmpeg", () => {
  execFileSync(
    "python3",
    [
      "-I",
      "-c",
      `
import os, random, sys
sys.path.insert(0, 'tools')
from tool_loader import load_tool
os.environ['PATH'] = ''
m = load_tool('scooter_vespa_clips')
rng = random.Random(1849)
for _ in range(1000):
    length = rng.uniform(0.001, 60)
    for fade in (0, length / 2, rng.uniform(0, length / 2)):
        window, output = m.crossfade_plan(length, fade)
        assert output == length
        assert window == length + fade
    for bad_length, bad_fade in ((length, length / 2 + 0.001),
                                  (length, -0.001), (0, 0), (-length, 0)):
        try:
            m.crossfade_plan(bad_length, bad_fade)
        except ValueError:
            pass
        else:
            raise AssertionError((bad_length, bad_fade))
for length, fade in ((float('nan'), 0), (1, float('nan')),
                     (float('inf'), 0), (1, float('inf'))):
    try:
        m.crossfade_plan(length, fade)
    except ValueError:
        pass
    else:
        raise AssertionError((length, fade))
assert len(m.SCOOTER_ENGINE_SLICES) == 6
for i, spec in enumerate(m.SCOOTER_ENGINE_SLICES):
    assert spec.source == ('idle' if i == 0 else 'rev')
    assert 2 <= spec.length <= 6
    assert spec.start >= 0
    assert 0 <= spec.fade <= spec.length / 2
    assert m.crossfade_plan(spec.length, spec.fade) == (spec.length + spec.fade, spec.length)
`,
    ],
    { encoding: "utf8" },
  );
});
