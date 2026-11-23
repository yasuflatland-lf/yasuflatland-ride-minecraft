import fc from "fast-check";
import { expect, it } from "vitest";
import { CAMPER_ENTITY } from "../../../../src/domain/vehicle/kinds/camper/entity";
import { SPORTSBOAT_ENTITY } from "../../../../src/domain/vehicle/kinds/sportsboat/entity";
import {
  DOCK_EVENTS,
  DOCK_PROPERTIES,
  DockedResend,
  dockCommands,
  undockCommands,
} from "../../../../src/domain/vehicle/motion/dockEntity";

it("resends once after resync when a drive has held and the step keeps its held state", () => {
  const action = fc.oneof(
    fc.constant("resync" as const),
    fc.record({ wasHeld: fc.boolean(), held: fc.boolean() }),
  );
  fc.assert(
    fc.property(fc.array(action), (actions) => {
      const resend = new DockedResend();
      let heldOnce = false;
      let resendDocked = false;
      let sends = 0;
      for (const action of actions) {
        if (action === "resync") {
          resend.resync();
          resendDocked = heldOnce;
          sends = 0;
          continue;
        }
        const { wasHeld, held } = action;
        const command = resend.next(wasHeld, held);
        heldOnce ||= wasHeld || held;
        expect(command).toStrictEqual(
          resendDocked && held === wasHeld
            ? { type: "setProperty", name: "docked", value: held }
            : undefined,
        );
        resendDocked = false;
        if (!heldOnce || held !== wasHeld) expect(command).toBeUndefined();
        if (command !== undefined) sends++;
        expect(sends).toBeLessThanOrEqual(1);
      }
    }),
  );
});

it("resends docked false after a failed send on the first step out of a restored hold", () => {
  fc.assert(
    fc.property(fc.integer({ min: 1, max: 20 }), (failedSends) => {
      const resend = new DockedResend();
      expect(resend.next(true, false)).toBeUndefined();
      for (let i = 0; i < failedSends; i++) {
        resend.resync();
        expect(resend.next(false, false)).toStrictEqual({
          type: "setProperty",
          name: "docked",
          value: false,
        });
      }
      expect(resend.next(false, false)).toBeUndefined();
    }),
  );
});

it("triggers dock before recording the docked state", () => {
  expect(dockCommands()).toStrictEqual([
    { type: "triggerEvent", name: "dock" },
    { type: "setProperty", name: "docked", value: true },
  ]);
});

it("triggers undock before clearing the docked state", () => {
  expect(undockCommands()).toStrictEqual([
    { type: "triggerEvent", name: "undock" },
    { type: "setProperty", name: "docked", value: false },
  ]);
});

it("is shared by every kind that docks", () => {
  for (const contract of [SPORTSBOAT_ENTITY, CAMPER_ENTITY]) {
    expect(contract.properties.docked).toEqual(DOCK_PROPERTIES.docked);
    for (const name of DOCK_EVENTS) expect(contract.events).toContain(name);
  }
});
