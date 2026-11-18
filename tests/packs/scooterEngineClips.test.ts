import { execFileSync } from "node:child_process";
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
  volume: number;
}
const clips: EngineClip[] = JSON.parse(
  execFileSync(
    "python3",
    [
      "-I",
      "-c",
      "import sys, json; sys.path.insert(0, 'tools'); from tool_loader import load_tool; from dataclasses import asdict; print(json.dumps([asdict(clip) for clip in load_tool('scooter_sound').ENGINE_CLIPS]))",
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
  it.each(clips)(
    "plays band $index from its own Ogg with matching duration and volume",
    ({ index, seconds, volume }) => {
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
      expect(Math.abs(seconds - info.seconds)).toBeLessThan(0.01);
      const animation =
        animations[`animation.yasu_ride.scooter.engine_sound_${index}`];
      expect(Math.abs(animation.animation_length - info.seconds)).toBeLessThan(
        0.01,
      );
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
    "ships band %i as mono 48 kHz Vorbis lasting 2–6 seconds",
    (band) => {
      const path = `${sounds}/scooter_engine_${band}.ogg`;
      expect(existsSync(path)).toBe(true);
      expect(readFileSync(path).subarray(0, 4).toString("ascii")).toBe("OggS");
      const info = readOggInfo(path);
      expect(info.channels).toBe(1);
      expect(info.sampleRate).toBe(48000);
      expect(info.seconds).toBeGreaterThanOrEqual(2);
      expect(info.seconds).toBeLessThanOrEqual(6);
    },
  );
});

it("reads the existing five-second mono resort recording", () => {
  expect(readOggInfo(`${sounds}/toilet_flush.ogg`)).toEqual({
    channels: 1,
    sampleRate: 48000,
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
it.skipIf(!hasFFmpeg)(
  "keeps the decoded idle wrap beat within the internal gap spread and 10 ms of its median",
  () => {
    execFileSync(
      "python3",
      [
        "-I",
        "-c",
        `
import math, statistics, struct, subprocess
pcm = subprocess.check_output([
    'ffmpeg', '-v', 'error', '-i',
    'packs/yasu_ride_rp/sounds/yasu_ride/scooter_engine_0.ogg',
    '-ac', '1', '-ar', '48000', '-f', 'f32le', 'pipe:1',
])
samples = struct.unpack(f'<{len(pcm) // 4}f', pcm)
rate = 48000
seconds = len(samples) / rate
# Three copies let centred windows and peak suppression see both sides of
# the wrap. 12 ms RMS windows, 2 ms hop, strongest peaks >=80 ms apart.
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
assert len(peaks) >= 15, peaks
gaps = [b - a for a, b in zip(peaks, peaks[1:])]
wrap = peaks[0] + seconds - peaks[-1]
assert min(gaps) <= wrap <= max(gaps), (wrap, gaps)
# The recording is weakly periodic: the spread alone admits the old stretched
# seam beat. Also cap median error at 10 ms (five envelope hops, <1/10 beat).
assert abs(wrap - statistics.median(gaps)) <= 0.010, (wrap, statistics.median(gaps))
rms_db = 20 * math.log10(math.sqrt(sum(v * v for v in samples) / len(samples)))
peak_db = 20 * math.log10(max(abs(v) for v in samples))
assert abs(rms_db - (-21)) < 0.15, rms_db
assert peak_db < -1, peak_db
`,
      ],
      { encoding: "utf8" },
    );
  },
);
