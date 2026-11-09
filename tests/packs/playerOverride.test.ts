import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const vanilla = read("tests/packs/fixtures/vanilla-player.ce.json");
const override = read("packs/yasu_ride_rp/entity/yasu_ride/player.ce.json");
const vanillaDescription = vanilla["minecraft:client_entity"].description;
const description = override["minecraft:client_entity"].description;
const animationId = "animation.yasu_ride.player.lounge";

describe("vanilla player override (ADR 0238)", () => {
  it("preserves the entire vanilla definition with only the lounge animation added", () => {
    expect(override.format_version).toBe(vanilla.format_version);
    expect(Object.keys(description).sort()).toEqual(
      Object.keys(vanillaDescription).sort(),
    );
    for (const key of Object.keys(vanillaDescription)) {
      if (key !== "animations")
        expect(description[key], key).toEqual(vanillaDescription[key]);
    }
    expect(vanillaDescription.animations).not.toHaveProperty("lounge");
    expect(description.animations).toEqual({
      ...vanillaDescription.animations,
      lounge: animationId,
    });
    expect(override).toEqual({
      ...vanilla,
      "minecraft:client_entity": {
        ...vanilla["minecraft:client_entity"],
        description: {
          ...vanillaDescription,
          animations: { ...vanillaDescription.animations, lounge: animationId },
        },
      },
    });
  });

  it("loops with straight forward legs and a torso leaning back around the hip", () => {
    const animation = read(
      "packs/yasu_ride_rp/animations/yasu_ride/player.anim.json",
    ).animations[animationId];
    expect(animation.loop).toBe(true);
    expect(animation.bones).toEqual({
      leftleg: { rotation: ["-90.0 - this", "-this", "-this"] },
      rightleg: { rotation: ["-90.0 - this", "-this", "-this"] },
      waist: { rotation: [-55, 0, 0] },
    });
  });
});
