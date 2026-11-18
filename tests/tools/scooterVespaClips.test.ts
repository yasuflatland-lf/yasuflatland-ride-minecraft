import { execFileSync } from "node:child_process";
import { it } from "vitest";

it("plans overlapping one-second rev cycles and rejects invalid seam fades without FFmpeg", () => {
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
sound = load_tool('scooter_sound')
clips = sound.ENGINE_CLIPS
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
    assert spec.start >= 0
    assert 0 <= spec.fade <= spec.length / 2
    end = spec.start + clips[i].clip_seconds + spec.fade
    assert end <= SOURCE_SECONDS[spec.source], (i, end)
    if i == 0:
        assert 2 <= spec.length <= 6
        assert 2.0 <= spec.length <= 2.4
        assert 0.02 <= spec.fade <= 0.05
        assert clips[i].clip_seconds == spec.length
        assert spec.start >= 4.0 and end <= 8.0
    else:
        ticks = spec.length / 0.05
        assert abs(ticks - round(ticks)) < 1e-9
        assert spec.length == 1.0
        assert round(ticks) == 20
        assert round(spec.length * m.RATE) == 48000
        assert round(spec.length * m.RATE) == round(ticks) * 2400
        assert spec.length == clips[i].seconds
        assert spec.fade == 0
        assert clips[i].clip_seconds == spec.length + sound.ENGINE_OVERLAP_SECONDS
        assert 0 < sound.ENGINE_OVERLAP_SECONDS <= 0.05
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

const hasFFmpeg =
  execFileSync(
    "python3",
    ["-I", "-c", "import shutil; print(bool(shutil.which('ffmpeg')))"],
    {
      encoding: "utf8",
    },
  ).trim() === "True";

it.skipIf(!hasFFmpeg)(
  "preserves raw rev waveform and edge gain through encoding",
  () => {
    execFileSync(
      "python3",
      [
        "-I",
        "-c",
        `
import math, shutil, struct, sys, tempfile, wave
from pathlib import Path
sys.path.insert(0, 'tools')
from tool_loader import load_tool
m = load_tool('scooter_vespa_clips')
with tempfile.TemporaryDirectory() as directory:
    source, out = Path(directory) / 'source.wav', Path(directory) / 'clip.ogg'
    original = [round(12000 * (math.sin(i*2*math.pi*61.7/m.RATE)
                + 0.2*math.sin(i*2*math.pi*197.3/m.RATE))) for i in range(96000)]
    with wave.open(str(source), 'wb') as wav:
        wav.setparams((1, 2, m.RATE, 0, 'NONE', 'not compressed'))
        wav.writeframes(struct.pack(f'<{len(original)}h', *original))
    m.write_clip(shutil.which('ffmpeg'), source, out, 1, m.SliceSpec('rev', 0.137, 1, 0))
    pcm = m.run_ffmpeg(shutil.which('ffmpeg'), ['-i', str(out), '-f', 'f32le', 'pipe:1'])
    decoded = struct.unpack(f'<{len(pcm)//4}f', pcm)
    count = round((1 + m.sound.ENGINE_OVERLAP_SECONDS)*m.RATE)
    assert len(decoded) == count
    start = round(0.137*m.RATE)
    expected = original[start:start+count]
    def gain(a,b):
        return sum(x*y for x,y in zip(a,b))/sum(x*x for x in a)
    middle_gain = gain(expected[4800:-4800], decoded[4800:-4800])
    for a,b in ((expected[:240], decoded[:240]), (expected[-240:], decoded[-240:])):
        assert 0.8 < gain(a,b)/middle_gain < 1.2
    corr = sum(x*y for x,y in zip(expected,decoded))/math.sqrt(
        sum(x*x for x in expected)*sum(y*y for y in decoded))
    assert corr > 0.99, corr
`,
      ],
      { encoding: "utf8" },
    );
  },
);
