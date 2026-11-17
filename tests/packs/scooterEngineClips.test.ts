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

const sounds = "packs/yasu_ride_rp/sounds/yasu_ride";

describe("recorded scooter engine clips", () => {
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
