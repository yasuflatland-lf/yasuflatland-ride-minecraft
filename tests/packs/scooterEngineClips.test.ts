import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readOggInfo } from "../helpers/oggInfo";

interface EngineClip {
  index: number;
  seconds: number;
  clip_seconds: number;
  volume: number;
}
const { clips, overlap }: { clips: EngineClip[]; overlap: number } = JSON.parse(
  execFileSync(
    "python3",
    [
      "-I",
      "-c",
      "import sys, json; sys.path.insert(0, 'tools'); from tool_loader import load_tool; from dataclasses import asdict; m = load_tool('scooter_sound'); print(json.dumps({'clips': [asdict(clip) for clip in m.ENGINE_CLIPS], 'overlap': m.ENGINE_OVERLAP_SECONDS}))",
    ],
    { encoding: "utf8" },
  ),
);
const rp = "packs/yasu_ride_rp";
const definitions = JSON.parse(
  readFileSync(`${rp}/sounds/sound_definitions.json`, "utf8"),
).sound_definitions;
const animations = JSON.parse(
  readFileSync(`${rp}/animations/yasu_ride/scooter.anim.json`, "utf8"),
).animations;
const sounds = "packs/yasu_ride_rp/sounds/yasu_ride";

describe("recorded scooter engine clips", () => {
  it("preserves the approved idle clip bytes", () => {
    expect(
      createHash("sha256")
        .update(readFileSync(`${sounds}/scooter_engine_0.ogg`))
        .digest("hex"),
    ).toBe("d59d23f4e76c5939ef0a92a2f48effdd4a0243774517303acfca1216bc770605");
  });
  it.each(clips.filter(({ index }) => index > 0))(
    "keeps band $index on a 20-tick cycle with an overlapping Ogg",
    ({ index, seconds, clip_seconds }) => {
      const ticks = Math.round(seconds / 0.05);
      expect(Math.abs(seconds / 0.05 - ticks)).toBeLessThan(1e-9);
      expect(seconds).toBe(1);
      expect(ticks).toBe(20);
      const info = readOggInfo(`${sounds}/scooter_engine_${index}.ogg`);
      expect(info.sampleCount).toBe(Math.round(clip_seconds * 48000));
      expect(info.sampleCount - ticks * 2400).toBe(Math.round(overlap * 48000));
      expect(Math.abs(clip_seconds - seconds - overlap)).toBeLessThan(1e-9);
      expect(info.seconds).toBe(clip_seconds);
      expect(
        animations[`animation.yasu_ride.scooter.engine_sound_${index}`]
          .animation_length,
      ).toBe(seconds);
    },
  );
  it.each(clips)(
    "plays band $index from its own Ogg with matching duration and volume",
    ({ index, seconds, clip_seconds, volume }) => {
      const definition = definitions[`yasu_ride.scooter_engine_${index}`];
      expect(definition.sounds).toEqual([
        { name: `sounds/yasu_ride/scooter_engine_${index}`, volume },
      ]);
      const name = definition.sounds[0].name;
      expect(definition.category).toBe("neutral");
      expect(definition.min_distance).toBe(4);
      expect(definition.max_distance).toBe(24);
      expect(name).not.toMatch(/^sounds\/yasu_ride\/engine_\d+$/);
      expect(existsSync(`${rp}/${name}.ogg`)).toBe(true);
      expect(existsSync(`${rp}/${name}.wav`)).toBe(false);
      const info = readOggInfo(`${rp}/${name}.ogg`);
      expect(Math.abs(clip_seconds - info.seconds)).toBeLessThan(0.01);
      const animation =
        animations[`animation.yasu_ride.scooter.engine_sound_${index}`];
      expect(Math.abs(animation.animation_length - seconds)).toBeLessThan(0.01);
    },
  );

  it("keeps all six band volumes non-decreasing with idle quietest", () => {
    expect(clips.map(({ index }) => index)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(clips.map(({ volume }) => volume)).toEqual([
      0.5, 0.54, 0.58, 0.62, 0.66, 0.7,
    ]);
    for (let i = 1; i < clips.length; i++) {
      expect(clips[i]?.volume).toBeGreaterThanOrEqual(
        clips[i - 1]?.volume ?? 0,
      );
    }
  });

  it.each([0, 1, 2, 3, 4, 5])(
    "ships band %i as mono 48 kHz Vorbis with its declared clip duration",
    (band) => {
      const path = `${sounds}/scooter_engine_${band}.ogg`;
      expect(existsSync(path)).toBe(true);
      expect(readFileSync(path).subarray(0, 4).toString("ascii")).toBe("OggS");
      const info = readOggInfo(path);
      expect(info.channels).toBe(1);
      expect(info.sampleRate).toBe(48000);
      if (band === 0) {
        expect(info.seconds).toBeGreaterThanOrEqual(2);
        expect(info.seconds).toBeLessThanOrEqual(6);
      } else {
        expect(info.seconds).toBe(clips[band]?.clip_seconds);
        expect(info.sampleCount).toBeGreaterThan(48000);
      }
    },
  );
});

it("reads the existing five-second mono resort recording", () => {
  expect(readOggInfo(`${sounds}/toilet_flush.ogg`)).toEqual({
    channels: 1,
    sampleRate: 48000,
    sampleCount: 240000,
    seconds: 5,
  });
});

it("rejects non-Ogg, non-Vorbis and truncated streams", () => {
  const dir = mkdtempSync(join(tmpdir(), "ogg-info-"));
  const path = join(dir, "invalid.ogg");
  try {
    const original = readFileSync(`${sounds}/toilet_flush.ogg`);
    const nonVorbis = Buffer.from(original);
    nonVorbis.write("Opus!!", 29, "ascii");
    for (const bytes of [
      Buffer.from("not Ogg"),
      nonVorbis,
      original.subarray(0, 30),
    ]) {
      writeFileSync(path, bytes);
      expect(() => readOggInfo(path)).toThrow();
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// Header and metadata tests above remain usable without an audio decoder.
const hasFFmpeg =
  execFileSync(
    "python3",
    ["-I", "-c", "import shutil; print(bool(shutil.which('ffmpeg')))"],
    { encoding: "utf8" },
  ).trim() === "True";
it.skipIf(!hasFFmpeg).each([0, 1, 2, 3, 4, 5])(
  "keeps decoded band %i within the beat, pitch stability and loudness limits",
  (band) => {
    execFileSync(
      "python3",
      [
        "-I",
        "-c",
        `
import math, statistics, struct, subprocess
band = ${band}
pcm = subprocess.check_output([
    'ffmpeg', '-v', 'error', '-i',
    f'packs/yasu_ride_rp/sounds/yasu_ride/scooter_engine_{band}.ogg',
    '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1',
])
samples = struct.unpack(f'<{len(pcm) // 4}f', pcm)
rate = 48000
seconds = len(samples) / rate
# Three copies let centred windows and peak suppression see both sides of
# the wrap. 12 ms RMS windows, 2 ms hop, strongest peaks >=80 ms apart.
if band == 0:
    energy = [0.0]
    for value in samples * 3:
        energy.append(energy[-1] + value * value)
    envelope = [math.sqrt(max(0, energy[i + 288] - energy[i - 288]) / 576)
                for i in range(288, len(samples) * 3 - 288, 96)]
    candidates = [i for i in range(1, len(envelope) - 1)
                  if envelope[i] > envelope[i - 1] and envelope[i] >= envelope[i + 1]]
    selected = []
    for i in sorted(candidates, key=lambda i: (-envelope[i], i)):
        if all(abs(i - j) >= 40 for j in selected):
            selected.append(i)
    peaks = sorted((i * 96 + 288) / rate - seconds for i in selected
                   if seconds <= (i * 96 + 288) / rate < 2 * seconds)
    assert len(peaks) >= (15 if band == 0 else 8), peaks
    gaps = [b - a for a, b in zip(peaks, peaks[1:])]
    wrap = peaks[0] + seconds - peaks[-1]
    assert min(gaps) <= wrap <= max(gaps), (wrap, gaps)
    # The recording is weakly periodic: the spread alone admits the old stretched
    # seam beat. Also cap median error at 10 ms (five envelope hops, <1/10 beat).
    assert abs(wrap - statistics.median(gaps)) <= 0.010, (wrap, statistics.median(gaps))
rms_db = 20 * math.log10(math.sqrt(sum(v * v for v in samples) / len(samples)))
peak_db = 20 * math.log10(max(abs(v) for v in samples))
assert abs(rms_db - (-21 + 0.2 * band - (4.5 if band else 0))) < 0.15, (band, rms_db)
assert peak_db < -1, peak_db
if band:
    ticks = round(${clips[band]?.seconds} / 0.05)
    overlap_count = round(${overlap} * rate)
    assert len(samples) == ticks * 2400 + overlap_count, (band, len(samples), ticks)
    a, b = samples[:overlap_count], samples[ticks * 2400:]
    corr = sum(v*w for v,w in zip(a,b)) / math.sqrt(
        sum(v*v for v in a) * sum(v*v for v in b))
    assert corr > 0.85, (band, corr)
    summed = [v+w for v,w in zip(a,b)] + list(samples[overlap_count:ticks*2400])
    assert 20 * math.log10(max(abs(v) for v in summed)) < -1, band
    # Low-pass before decimation; correlate 0.5 s endpoint windows over the
    # measured 55–87 Hz fundamental range and interpolate the best lag.
    filtered = subprocess.check_output([
        'ffmpeg', '-v', 'error', '-i',
        f'packs/yasu_ride_rp/sounds/yasu_ride/scooter_engine_{band}.ogg',
        '-af', 'aformat=channel_layouts=mono,lowpass=f=1200,aresample=4000',
        '-f', 'f32le', 'pipe:1',
    ])
    signal = struct.unpack(f'<{len(filtered) // 4}f', filtered)
    def fundamental(frame):
        mean = statistics.mean(frame)
        frame = [v - mean for v in frame]
        corr = {}
        for lag in range(45, 75):
            a, b = frame[:-lag], frame[lag:]
            corr[lag] = sum(v*w for v,w in zip(a,b)) / math.sqrt(
                sum(v*v for v in a) * sum(v*v for v in b))
        lag = max(range(46, 74), key=corr.get)
        assert corr[lag] > 0.8, (band, corr[lag])
        delta = 0.5 * (corr[lag-1] - corr[lag+1]) / (
            corr[lag-1] - 2*corr[lag] + corr[lag+1])
        return 4000 / (lag + delta)
    start, end = fundamental(signal[:2000]), fundamental(signal[-2000:])
    assert abs(end - start) <= 3.0, (band, start, end)
    assert seconds == ${clips[band]?.clip_seconds}, (band, seconds)
    levels = [20 * math.log10(math.sqrt(
        sum(v*v for v in samples[i:i+4800]) / 4800))
        for i in range(0, len(samples)-4799, 4800)]
    assert max(levels) - min(levels) <= (3.2 if band == 1 else 2), (band, levels)

    if band > 1:
        previous_pcm = subprocess.check_output([
            'ffmpeg', '-v', 'error', '-i',
            f'packs/yasu_ride_rp/sounds/yasu_ride/scooter_engine_{band-1}.ogg',
            '-af', 'aformat=channel_layouts=mono,lowpass=f=1200,aresample=4000',
            '-f', 'f32le', 'pipe:1',
        ])
        previous = struct.unpack(f'<{len(previous_pcm) // 4}f', previous_pcm)
        def mean_fundamental(values):
            return statistics.mean(fundamental(values[i:i+2000])
                                   for i in range(0, len(values)-1999, 2000))
        assert mean_fundamental(previous) < mean_fundamental(signal), band


`,
      ],
      { encoding: "utf8" },
    );
  },
);
