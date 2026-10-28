import fc from "fast-check";
import { expect, it } from "vitest";
import { asPlayerId, asVehicleId } from "../../../../../src/domain/shared/ids";
import type { TickContext } from "../../../../../src/domain/vehicle/drive";
import { SportsboatDrive } from "../../../../../src/domain/vehicle/kinds/sportsboat/drive";
import { ICEBREAKER_SWITCH_ITEM as ITEM } from "../../../../../src/domain/vehicle/kinds/sportsboat/equipment";
import { SPORTSBOAT_PROFILE } from "../../../../../src/domain/vehicle/kinds/sportsboat/profile";
import { SPEC } from "../../../../../src/domain/vehicle/spec";
import { Vehicle } from "../../../../../src/domain/vehicle/vehicle";
import { defined } from "../../../../support/defined";

const ctx: TickContext = {
  tick: 0,
  location: { x: 0, y: 64, z: 0 },
  velocity: { x: 0, y: 0, z: 0 },
  deckSeatInputs: [],
  onGround: false,
  waterAt: () => true,
  solidAt: () => false,
  blockTypes: () => [],
};
const step = (drive: SportsboatDrive) =>
  drive
    .step(undefined, ctx)
    .commands.filter(
      (c) => c.type === "setProperty" && c.name === "icebreaker",
    );

it("restores only literal true and round trips state changes with one command per change", () => {
  fc.assert(
    fc.property(
      fc.oneof(fc.boolean(), fc.string(), fc.integer(), fc.constant(undefined)),
      fc.array(fc.boolean(), { minLength: 1, maxLength: 60 }),
      fc.boolean(),
      (restored, changes, docked) => {
        const drive = new SportsboatDrive(0, { icebreaker: restored, docked });
        let previous = restored === true;
        expect(drive.toolState(ITEM)).toBe(previous ? "on" : "off");
        expect(step(drive)).toEqual([]);
        for (const on of changes) {
          expect(drive.setToolState(ITEM, on ? "on" : "off")).toBe(true);
          expect(drive.toolState(ITEM)).toBe(on ? "on" : "off");
          expect(step(drive)).toEqual(
            on === previous
              ? []
              : [{ type: "setProperty", name: "icebreaker", value: on }],
          );
          expect(step(drive)).toEqual([]);
          drive.resync();
          expect(step(drive)).toEqual([
            { type: "setProperty", name: "icebreaker", value: on },
          ]);
          expect(step(drive)).toEqual([]);
          previous = on;
        }
      },
    ),
  );
});

it("rejects unrelated items and invalid states without changing the mode", () => {
  fc.assert(
    fc.property(fc.string(), fc.string(), fc.boolean(), (item, state, on) => {
      fc.pre(item !== ITEM || (state !== "off" && state !== "on"));
      const drive = new SportsboatDrive(0, { icebreaker: on });
      expect(drive.setToolState(item, state)).toBe(false);
      if (item !== ITEM) expect(drive.toolState(item)).toBeUndefined();
      expect(drive.toolState(ITEM)).toBe(on ? "on" : "off");
      expect(step(drive)).toEqual([]);
    }),
  );
});

it("lets only the boat driver toggle through off, on and off", () => {
  fc.assert(
    fc.property(fc.integer({ min: 0, max: 10000 }), (tick) => {
      const drive = new SportsboatDrive(0, {});
      const riders = SPORTSBOAT_PROFILE.seats.positions
        .slice(0, 2)
        .map((offset, i) => ({
          id: asPlayerId(`rider_${i}`),
          offset,
          yaw: 0,
          raw: { moveX: 0, moveY: 0, jump: false },
        }));
      const driver = defined(riders[0], "driver");
      const passenger = defined(riders[1], "passenger");
      const vehicle = Vehicle.withRidersAboard(
        asVehicleId("boat"),
        SPORTSBOAT_PROFILE,
        drive,
        riders,
        0,
      );
      expect(drive.toolState(ITEM)).toBe("off");
      for (const state of ["on", "off"]) {
        expect(vehicle.switchTool(passenger.id, ITEM, tick)).toBe(false);
        expect(vehicle.switchTool(driver.id, ITEM, tick)).toBe(true);
        expect(drive.toolState(ITEM)).toBe(state);
        tick += SPEC.toolSwitchCooldown + 1;
      }
    }),
  );
});
