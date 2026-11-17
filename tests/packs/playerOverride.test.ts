import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const vanilla = read("tests/packs/fixtures/vanilla-player.ce.json");
const override = read("packs/yasu_ride_rp/entity/yasu_ride/player.ce.json");
const vanillaDescription = vanilla["minecraft:client_entity"].description;
const description = override["minecraft:client_entity"].description;
const animationId = "animation.yasu_ride.player.lounge";

const addedAnimations = {
  lounge: animationId,
  scooter_grip: "animation.yasu_ride.player.scooter_grip",
  scooter_lean_l1: "animation.yasu_ride.player.scooter_lean_l1",
  scooter_lean_l2: "animation.yasu_ride.player.scooter_lean_l2",
  scooter_lean_l3: "animation.yasu_ride.player.scooter_lean_l3",
  scooter_lean_r1: "animation.yasu_ride.player.scooter_lean_r1",
  scooter_lean_r2: "animation.yasu_ride.player.scooter_lean_r2",
  scooter_lean_r3: "animation.yasu_ride.player.scooter_lean_r3",
};

describe("vanilla player override (ADR 0238)", () => {
  it("preserves the entire vanilla definition with only lounge and scooter animations added", () => {
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
      ...addedAnimations,
    });
    expect(override).toEqual({
      ...vanilla,
      "minecraft:client_entity": {
        ...vanilla["minecraft:client_entity"],
        description: {
          ...vanillaDescription,
          animations: { ...vanillaDescription.animations, ...addedAnimations },
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

  it("loops scooter grip with forward arms and straight legs, and adds stepped waist roll", () => {
    const animations = read(
      "packs/yasu_ride_rp/animations/yasu_ride/player.anim.json",
    ).animations;
    const grip = animations[addedAnimations.scooter_grip];
    expect(grip).toEqual({
      loop: true,
      bones: {
        leftarm: { rotation: ["-70.0 - this", "-this", "-this"] },
        rightarm: { rotation: ["-70.0 - this", "-this", "-this"] },
        leftleg: { rotation: ["-this", "-this", "-this"] },
        rightleg: { rotation: ["-this", "-this", "-this"] },
      },
    });
    for (const [side, rolls] of [
      ["l", [8, 16, 24]],
      ["r", [-8, -16, -24]],
    ] as const) {
      for (const [index, roll] of rolls.entries()) {
        expect(
          animations[
            `animation.yasu_ride.player.scooter_lean_${side}${index + 1}`
          ],
        ).toEqual({
          loop: true,
          bones: { ...grip.bones, waist: { rotation: [0, 0, roll] } },
        });
      }
    }
  });
});
