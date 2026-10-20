import { describe, expect, expectTypeOf, it } from "vitest";
import {
  CORE_EVENT_PREFIXES,
  CORE_PROPERTY_NAMES,
  commandsFor,
  HEADLIGHTS_PROPERTY_NAME,
  type PropertyValue,
  paintEventName,
  type RestoredOf,
} from "../../../src/domain/vehicle/entityContract";
import type { CAMPER_ENTITY } from "../../../src/domain/vehicle/kinds/camper/entity";
import type { SPORTSBOAT_ENTITY } from "../../../src/domain/vehicle/kinds/sportsboat/entity";
import {
  TRANSFORMING_EVENTS,
  transformingProperties,
} from "../../../src/domain/vehicle/motion/transformingEntity";
import { PAINTS } from "../../../src/domain/vehicle/paint";

const TRANSFORMING = {
  properties: transformingProperties(10),
  events: TRANSFORMING_EVENTS,
};

describe("entity contract types (ADR 0055)", () => {
  it("maps each property spec to the value type it accepts", () => {
    expectTypeOf<
      PropertyValue<{ type: "float"; range: readonly [0, 1] }>
    >().toEqualTypeOf<number>();
    expectTypeOf<PropertyValue<{ type: "bool" }>>().toEqualTypeOf<boolean>();
    expectTypeOf<
      PropertyValue<{ type: "enum"; values: readonly ["a", "b"] }>
    >().toEqualTypeOf<"a" | "b">();
  });

  it("rejects a value that does not match the property spec", () => {
    const t = commandsFor<typeof TRANSFORMING>();
    // @ts-expect-error bank is a float
    t.property("bank", true);
    // @ts-expect-error gear_down is a bool
    t.property("gear_down", "car");
    // @ts-expect-error not a form
    t.property("form", "boat");
    const b = commandsFor<typeof SPORTSBOAT_ENTITY>();
    // @ts-expect-error docked is a bool
    b.property("docked", 0.5);
    // @ts-expect-error unknown event
    b.event("gravity_on");
    // @ts-expect-error not declared
    b.property("headlights", true);
  });

  it("accepts only the restored keys of a kind plus the dock keys", () => {
    const r: RestoredOf<typeof CAMPER_ENTITY> = {};
    // @ts-expect-error misspelt key
    expect(r.dokced).toBeUndefined();
    // @ts-expect-error not in the camper's list
    const bad: RestoredOf<typeof CAMPER_ENTITY> = { trim: 1 };
    expect(bad).toEqual({ trim: 1 });
    const good: RestoredOf<typeof CAMPER_ENTITY> = {
      form: "car",
      docked: true,
      door: 1,
      dockLaid: true,
      dockDoorOpen: false,
    };
    expect(good.door).toBe(1);
  });

  it("builds the commands a contract declares", () => {
    const camper = commandsFor<typeof CAMPER_ENTITY>();
    expect(camper.property("door", 0.5)).toEqual({
      type: "setProperty",
      name: "door",
      value: 0.5,
    });
    expect(camper.event("dock")).toEqual({
      type: "triggerEvent",
      name: "dock",
    });
  });
});

describe("reserved core names (ADR 0055)", () => {
  it("reserves the headlights property", () => {
    expect(CORE_PROPERTY_NAMES).toEqual([HEADLIGHTS_PROPERTY_NAME]);
  });

  it.each(PAINTS)(
    "names the paint event of %s under a core prefix",
    (paint) => {
      const name = paintEventName(paint);
      expect(
        CORE_EVENT_PREFIXES.some((prefix) => name.startsWith(prefix)),
      ).toBe(true);
      expect(name.endsWith(paint)).toBe(true);
    },
  );
});
