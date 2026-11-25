import { readFileSync } from "node:fs";
import fc from "fast-check";
import { expect, it } from "vitest";
import { DriveVehicles } from "../../../src/application/vehicle/driveVehicles";
import { RiderEffects } from "../../../src/application/vehicle/riderEffects";
import { SwitchEquipment } from "../../../src/application/vehicle/switchEquipment";
import { SwitchFeedback } from "../../../src/application/vehicle/switchFeedback";
import { SwitchHeadlights } from "../../../src/application/vehicle/switchHeadlights";
import { asPlayerId, asVehicleId } from "../../../src/domain/shared/ids";
import type { SwitchMessages } from "../../../src/domain/vehicle/equipment/equipment";
import { VEHICLE_KINDS } from "../../../src/domain/vehicle/kind";
import {
  BLADE_SWITCH,
  ROAD_PAVER_SWITCH,
  WIDE_BLADE_SWITCH,
} from "../../../src/domain/vehicle/kinds/bulldozer/equipment";
import { profileOf } from "../../../src/domain/vehicle/kinds/index";
import { ICEBREAKER_SWITCH } from "../../../src/domain/vehicle/kinds/sportsboat/equipment";
import { HEADLIGHT_MESSAGES } from "../../../src/domain/vehicle/lighting/headlights";
import { readLang } from "../../support/lang";
import { riderView } from "../../support/riders";
import { FakeClock, FakeWorld, InMemoryRepo, snapshot } from "./fakes";

const cases: readonly [SwitchMessages, string, string][] = [
  [BLADE_SWITCH, "down", "blade_down"],
  [BLADE_SWITCH, "up", "blade_up"],
  [WIDE_BLADE_SWITCH, "normal", "wide_blade_normal"],
  [WIDE_BLADE_SWITCH, "wide", "wide_blade_wide"],
  [ROAD_PAVER_SWITCH, "off", "road_paver_off"],
  [ROAD_PAVER_SWITCH, "on", "road_paver_on"],
  [ICEBREAKER_SWITCH, "off", "icebreaker_off"],
  [ICEBREAKER_SWITCH, "on", "icebreaker_on"],
  [HEADLIGHT_MESSAGES, "off", "headlights_off"],
  [HEADLIGHT_MESSAGES, "on", "headlights_on"],
];

it.each(cases)(
  "maps a switch state to its fixed message (%#)",
  (source, state, expected) => {
    expect(source.messageFor(state)).toBe(expected);
  },
);

it("maps each new state to a translated message only in the chase camera", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...cases),
      fc.boolean(),
      ([source, state, key], thirdPerson) => {
        const messages: string[] = [];
        const playerId = asPlayerId("driver");
        const feedback = new SwitchFeedback(
          {
            showMessage: (id, name) => {
              expect(id).toBe(playerId);
              messages.push(name);
            },
          },
          { isThirdPerson: () => thirdPerson },
        );
        feedback.show(playerId, source, state);
        expect(messages).toEqual(thirdPerson ? [key] : []);
      },
    ),
  );
});

const texts = "packs/yasu_ride_rp/texts";
const locales: string[] = JSON.parse(
  readFileSync(`${texts}/languages.json`, "utf8"),
);

it.each(locales)(
  "translates every declared tool state and headlight message in %s",
  (locale) => {
    const lang = readLang(`${texts}/${locale}.lang`);
    for (const kind of VEHICLE_KINDS) {
      for (const equipmentSwitch of profileOf(kind).equipment?.switches ?? []) {
        for (const state of equipmentSwitch.states) {
          const message = equipmentSwitch.messageFor(state);
          expect(cases).toContainEqual([equipmentSwitch, state, message]);
          expect(lang.get(`yasu_ride.message.${message}`)).toBeTruthy();
        }
      }
    }
    for (const [, , key] of cases) {
      expect(lang.get(`yasu_ride.message.${key}`)).toBeTruthy();
    }
  },
);

it("ignores undefined and unsupported states, including inherited object keys", () => {
  fc.assert(
    fc.property(fc.constantFrom(...cases), fc.string(), ([source], state) => {
      fc.pre(
        !cases.some(
          ([candidate, valid]) => candidate === source && valid === state,
        ),
      );
      const messages: string[] = [];
      const feedback = new SwitchFeedback(
        { showMessage: (_, name) => messages.push(name) },
        { isThirdPerson: () => true },
      );
      for (const unknown of [
        undefined,
        state,
        "constructor",
        "toString",
        "__proto__",
      ]) {
        feedback.show(asPlayerId("driver"), source, unknown);
      }
      expect(messages).toEqual([]);
    }),
  );
});

it("uses the same applied camera state for driving and switch feedback", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("suv", "camper", "bulldozer"),
      fc.constantFrom("car", "hover", "submarine"),
      (kind, form) => {
        const world = new FakeWorld();
        const repo = new InMemoryRepo();
        const riders = new RiderEffects(world, { warn: () => {} });
        const feedback = new SwitchFeedback(world, riders);
        const clock = new FakeClock();
        const drive = new DriveVehicles(
          world,
          repo,
          { warn: () => {} },
          riders,
        );
        const driver = riderView("driver");
        world.snapshots = [
          snapshot("a", {
            kind,
            riders: [driver],
            onGround: form === "car",
            waterDepth: form === "submarine" ? 10 : 0,
            restored: () => ({ form }),
          }),
        ];
        world.headlights.set("a", false);
        drive.execute(0);
        expect(riders.isThirdPerson(driver.id)).toBe(form !== "car");
        const cmd = { playerId: driver.id, vehicleId: asVehicleId("a") };
        expect(
          new SwitchHeadlights(world, repo, clock, feedback).execute(cmd),
        ).toBe(true);
        const toolSucceeded = new SwitchEquipment(
          repo,
          clock,
          feedback,
        ).execute({
          ...cmd,
          switch: WIDE_BLADE_SWITCH,
        });
        expect(toolSucceeded).toBe(kind === "bulldozer");
        expect(world.messages.map(({ name }) => name)).toEqual(
          form === "car"
            ? []
            : kind === "bulldozer"
              ? ["headlights_on", "wide_blade_wide"]
              : ["headlights_on"],
        );
        world.snapshots = [];
        drive.execute(1);
        expect(riders.isThirdPerson(driver.id)).toBe(false);
        feedback.show(driver.id, HEADLIGHT_MESSAGES, "off");
        expect(world.messages).toHaveLength(
          form === "car" ? 0 : kind === "bulldozer" ? 2 : 1,
        );
      },
    ),
  );
});
