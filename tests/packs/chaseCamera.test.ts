import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHASE_CAMERAS } from "../../src/infrastructure/vehicle/bedrock/identifiers";

const PRESET = "packs/yasu_ride_bp/cameras/presets/yasu_ride/far_chase.json";

describe("far chase camera preset (ADR 0071)", () => {
  it("defines the preset the far chase camera sets, pulled back from the orbit camera", () => {
    const preset = JSON.parse(readFileSync(PRESET, "utf8"))[
      "minecraft:camera_preset"
    ];
    expect(preset.identifier).toBe(CHASE_CAMERAS.far);
    expect(preset.inherit_from).toBe("minecraft:follow_orbit");
    expect(preset.radius).toBe(12);
  });
});
