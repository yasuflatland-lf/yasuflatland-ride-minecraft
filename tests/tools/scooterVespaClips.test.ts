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
clips = load_tool('scooter_sound').ENGINE_CLIPS
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
SOURCE_SECONDS = {'idle': 8.088, 'rev': 14.64}
# The falling rev spans 2.0–4.0 s; centroid falls from 1879 Hz over
# 2.0–4.25 s to 1598 Hz over 4.0–6.25 s (8192 samples, no overlap).
REV_DROP_START = 2.0
REV_DROP_END = 4.0
for i, spec in enumerate(m.SCOOTER_ENGINE_SLICES):
    assert spec.source == ('idle' if i == 0 else 'rev')
    assert 2 <= spec.length <= 6
    assert spec.start >= 0
    assert 0 <= spec.fade <= spec.length / 2
    end = spec.start + spec.length + spec.fade
    assert end <= SOURCE_SECONDS[spec.source], (i, end)
    if i == 0:
        assert 2.0 <= spec.length <= 2.4
        assert 0.02 <= spec.fade <= 0.05
        assert spec.start >= 4.0 and end <= 8.0
    else:
        ticks = spec.length / 0.05
        assert abs(ticks - round(ticks)) < 1e-9
        assert 50 <= round(ticks) <= 80
        assert round(spec.length * m.RATE) == round(ticks) * 2400
        assert spec.length == clips[i].seconds
        assert 0.02 <= spec.fade <= 0.05
        assert spec.start >= 4.0
        if i == 1:
            assert spec.start < 5.0
        if i > 1:
            assert spec.start > m.SCOOTER_ENGINE_SLICES[i-1].start
        if i == 5:
            assert spec.start >= 10.5 and end <= 14.6
    if spec.source == 'rev':
        assert end <= REV_DROP_START or spec.start >= REV_DROP_END, (i, spec.start, end)
    assert m.crossfade_plan(spec.length, spec.fade) == (spec.length + spec.fade, spec.length)
`,
    ],
    { encoding: "utf8" },
  );
});
