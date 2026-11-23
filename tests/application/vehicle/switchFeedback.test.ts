import { readFileSync } from "node:fs";
import fc from "fast-check";
import { expect, it } from "vitest";
import { DriveVehicles } from "../../../src/application/vehicle/driveVehicles";
import { RiderEffects } from "../../../src/application/vehicle/riderEffects";
import { SwitchFeedback } from "../../../src/application/vehicle/switchFeedback";
import { SwitchHeadlights } from "../../../src/application/vehicle/switchHeadlights";
import { SwitchTool } from "../../../src/application/vehicle/switchTool";
import { asPlayerId, asVehicleId } from "../../../src/domain/shared/ids";
import { riderView } from "../../support/riders";
import { FakeClock, FakeWorld, InMemoryRepo, snapshot } from "./fakes";

const cases = [
  ["blade_switch", "down", "blade_down"],
  ["blade_switch", "up", "blade_up"],
  ["wide_blade_switch", "normal", "wide_blade_normal"],
  ["wide_blade_switch", "wide", "wide_blade_wide"],
  ["road_paver_switch", "off", "road_paver_off"],
  ["road_paver_switch", "on", "road_paver_on"],
  ["headlight_switch", "off", "headlights_off"],
  ["headlight_switch", "on", "headlights_on"],
] as const;

it("maps each new state to a translated message only in the chase camera", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(...cases),
      fc.boolean(),
      ([item, state, key], thirdPerson) => {
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
        feedback.show(playerId, item, state);
        expect(messages).toEqual(thirdPerson ? [key] : []);
      },
    ),
  );
});

it("has translations for every switch message", () => {
  const langs = ["en_US", "ja_JP"].map((locale) =>
    readFileSync(`packs/yasu_ride_rp/texts/${locale}.lang`, "utf8"),
  );
  for (const [, , key] of cases) {
    for (const lang of langs) {
      expect(
        lang
          .split("\n")
          .some((line) => line.startsWith(`yasu_ride.message.${key}=`)),
      ).toBe(true);
    }
  }
});

it("ignores unsupported items and states, including inherited object keys", () => {
  fc.assert(
    fc.property(
      fc.string(),
      fc.option(fc.string(), { nil: undefined }),
      (item, state) => {
        fc.pre(
          !cases.some(
            ([knownItem, knownState]) =>
              knownItem === item && knownState === state,
          ),
        );
        const messages: string[] = [];
        const feedback = new SwitchFeedback(
          { showMessage: (_, name) => messages.push(name) },
          { isThirdPerson: () => true },
        );
        feedback.show(asPlayerId("driver"), item, state);
        feedback.show(asPlayerId("driver"), "constructor", "name");
        feedback.show(asPlayerId("driver"), "blade_switch", "toString");
        expect(messages).toEqual([]);
      },
    ),
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
        const toolSucceeded = new SwitchTool(repo, clock, feedback).execute({
          ...cmd,
          item: "wide_blade_switch",
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
        feedback.show(driver.id, "headlight_switch", "off");
        expect(world.messages).toHaveLength(
          form === "car" ? 0 : kind === "bulldozer" ? 2 : 1,
        );
      },
    ),
  );
});
