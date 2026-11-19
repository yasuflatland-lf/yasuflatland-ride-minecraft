import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SCOOTER_SPEC } from "../../src/domain/vehicle/kinds/scooter/spec";

const read = (path: string) => JSON.parse(readFileSync(path, "utf8"));
const vanilla = read("tests/packs/fixtures/vanilla-player.ce.json");
const override = read("packs/yasu_ride_rp/entity/yasu_ride/player.ce.json");
const vanillaDescription = vanilla["minecraft:client_entity"].description;
const animationId = "animation.yasu_ride.player.lounge";
const firstPersonArmAngles = ["-85.0", "0.0", "0.0"] as const;
const emptyHandedScooterRider =
  "query.is_riding_any_entity_of_type('yasu_ride:scooter') && query.get_equipped_item_name(0, 1) == '' && query.get_equipped_item_name('off_hand') == ''";

const firstPersonId = "controller.render.player.first_person";
const scooterControllerId =
  "controller.render.yasu_ride.player.first_person_scooter";
const emptyHandedScooter =
  "query.is_riding_any_entity_of_type('yasu_ride:scooter') && query.get_equipped_item_name(0, 1) == '' && query.get_equipped_item_name('off_hand') == ''";

const driverNames = [
  "grip",
  ...["l", "r"].flatMap((side) =>
    SCOOTER_SPEC.rollLevelAngles.map((_, i) => `lean_${side}${i + 1}`),
  ),
];
const addedAnimations: Record<string, string> = {
  lounge: animationId,
  ...Object.fromEntries(
    driverNames.flatMap((name) => [
      [`scooter_${name}`, `animation.yasu_ride.player.scooter_${name}`],
      [
        `scooter_pillion_${name}`,
        `animation.yasu_ride.player.scooter_pillion_${name}`,
      ],
    ]),
  ),
};

describe("vanilla player override (ADR 0238)", () => {
  it("preserves vanilla except for the added rider animations and the first-person scooter controller switch", () => {
    const renderControllers = vanillaDescription.render_controllers.flatMap(
      (entry: Record<string, string>) => {
        const condition = entry[firstPersonId];
        if (!condition) return [entry];
        return [
          { [firstPersonId]: `${condition} && !(${emptyHandedScooter})` },
          { [scooterControllerId]: `${condition} && (${emptyHandedScooter})` },
        ];
      },
    );
    expect(override).toEqual({
      ...vanilla,
      "minecraft:client_entity": {
        ...vanilla["minecraft:client_entity"],
        description: {
          ...vanillaDescription,
          render_controllers: renderControllers,
          animations: { ...vanillaDescription.animations, ...addedAnimations },
        },
      },
    });
  });

  it("draws only both arms and sleeves with the vanilla first-person geometry, materials and textures", () => {
    const pack = read(
      "packs/yasu_ride_rp/render_controllers/yasu_ride/player.rc.json",
    );
    expect(pack.render_controllers[scooterControllerId]).toEqual({
      ...read("tests/packs/fixtures/vanilla-player-first-person.rc.json"),
      part_visibility: [
        { "*": false },
        { rightArm: true },
        { rightSleeve: true },
        { leftArm: true },
        { leftSleeve: true },
      ],
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

  it("loops scooter grip with forward arms and legs swung 35 degrees forward, and adds stepped root roll at the SCOOTER_SPEC angles", () => {
    const animations = read(
      "packs/yasu_ride_rp/animations/yasu_ride/player.anim.json",
    ).animations;
    const grip = animations["animation.yasu_ride.player.scooter_grip"];
    const armBranch = (firstPerson: string, thirdPerson: string) =>
      `variable.is_first_person ? ((${emptyHandedScooterRider}) ? ${firstPerson} : 0.0) : ${thirdPerson}`;
    const [pitch, yaw, roll] = firstPersonArmAngles;
    const arm = {
      rotation: [
        armBranch(`${pitch} - this`, "-70.0 - this"),
        armBranch(`${yaw} - this`, "-this"),
        armBranch(`${roll} - this`, "-this"),
      ],
      position: Array.from({ length: 3 }, () => armBranch("0.0 - this", "0.0")),
    };
    expect(grip).toEqual({
      loop: true,
      bones: {
        leftarm: arm,
        rightarm: arm,
        leftleg: { rotation: ["-35.0 - this", "-this", "-this"] },
        rightleg: { rotation: ["-35.0 - this", "-this", "-this"] },
      },
    });
    const angles = SCOOTER_SPEC.rollLevelAngles;
    for (const [side, rolls] of [
      ["l", angles],
      ["r", angles.map((angle) => -angle)],
    ] as const) {
      for (const [index, roll] of rolls.entries()) {
        const lean =
          animations[
            `animation.yasu_ride.player.scooter_lean_${side}${index + 1}`
          ];
        expect(lean).toEqual({
          loop: true,
          bones: { ...grip.bones, root: { rotation: [0, 0, roll] } },
        });
        expect(lean.bones).not.toHaveProperty("waist");
      }
    }
  });

  it("loops the pillion set with arms swung back and the driver's legs and root roll", () => {
    const animations = read(
      "packs/yasu_ride_rp/animations/yasu_ride/player.anim.json",
    ).animations;
    for (const name of driverNames) {
      const driver = animations[`animation.yasu_ride.player.scooter_${name}`];
      const pillion =
        animations[`animation.yasu_ride.player.scooter_pillion_${name}`];
      expect(pillion).toEqual({
        loop: true,
        bones: {
          ...driver.bones,
          leftarm: { rotation: ["20.0 - this", "-this", "-this"] },
          rightarm: { rotation: ["20.0 - this", "-this", "-this"] },
        },
      });
      expect(pillion.bones).not.toHaveProperty("waist");
    }
  });
});
