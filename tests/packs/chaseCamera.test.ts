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

it("uses the existing eight-block mid preset for bulldozer and SUV, keeping camper far", async () => {
  const { profileOf } = await import("../../src/domain/vehicle/kinds/index");
  expect(profileOf("bulldozer").chaseCamera).toBe("mid");
  expect(profileOf("suv").chaseCamera).toBe("mid");
  expect(profileOf("camper").chaseCamera).toBe("far");
  const preset = JSON.parse(
    readFileSync(
      "packs/yasu_ride_bp/cameras/presets/yasu_ride/mid_chase.json",
      "utf8",
    ),
  )["minecraft:camera_preset"];
  expect(preset).toMatchObject({
    identifier: CHASE_CAMERAS.mid,
    inherit_from: "minecraft:follow_orbit",
    radius: 8,
  });
});
