import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  CORE_PROPERTY_NAMES,
  HEADLIGHTS_PROPERTY_NAME,
  paintEventName,
} from "../../../../src/domain/vehicle/entityContract";
import { VEHICLE_KINDS } from "../../../../src/domain/vehicle/kind";
import { PAINTS } from "../../../../src/domain/vehicle/paint";
import { NAMESPACE } from "../../../../src/infrastructure/shared/identifiers";
import {
  DECK_SEAT_TYPE,
  ENTITY_TYPE,
  entityEventId,
  entityPropertyId,
  FLEET_PROPERTY,
  fleetEntryOf,
  HEADLIGHT_SWITCH_TYPE,
  HEADLIGHTS_PROPERTY,
  ITEM_TYPE,
  isVehicleEntity,
  kindOfEntity,
  kindOfItem,
  LIT_CELLS_PROPERTY,
  OWNER_PROPERTY,
  paintEvent,
  ramMountOf,
  STARTER_RECEIVED_PROPERTY,
  TEST_INPUT_EVENT,
} from "../../../../src/infrastructure/vehicle/bedrock/identifiers";

describe("identifiers (ADR 0047)", () => {
  it("reserves the property identifiers the core writes (ADR 0055)", () => {
    expect(HEADLIGHTS_PROPERTY).toBe(
      entityPropertyId(HEADLIGHTS_PROPERTY_NAME),
    );
    for (const name of CORE_PROPERTY_NAMES)
      expect(entityPropertyId(name)).toBe(HEADLIGHTS_PROPERTY);
  });

  it.each(PAINTS)(
    "reserves the core paint event prefix for %s (ADR 0055)",
    (paint) => {
      expect(paintEvent(paint)).toBe(entityEventId(paintEventName(paint)));
    },
  );

  it.each(VEHICLE_KINDS)(
    "round-trips the entity and item IDs of %s",
    (kind) => {
      expect(kindOfEntity(ENTITY_TYPE[kind])).toBe(kind);
      expect(isVehicleEntity(ENTITY_TYPE[kind])).toBe(true);
      expect(kindOfItem(ITEM_TYPE[kind])).toBe(kind);
    },
  );

  it.each([undefined, "minecraft:cow", "yasu_ride:unknown", "toString"])(
    "does not recognize an unrelated type %s",
    (typeId) => {
      expect(kindOfEntity(typeId)).toBeUndefined();
      expect(isVehicleEntity(typeId)).toBe(false);
      expect(kindOfItem(typeId)).toBeUndefined();
    },
  );

  it("does not confuse entity and item IDs", () => {
    for (const kind of VEHICLE_KINDS) {
      expect(kindOfEntity(ITEM_TYPE[kind])).toBeUndefined();
      expect(isVehicleEntity(ITEM_TYPE[kind])).toBe(false);
      expect(kindOfItem(ENTITY_TYPE[kind])).toBeUndefined();
    }
  });

  it("recognizes exactly the vehicle entity types", () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.string(), fc.constantFrom(...Object.values(ENTITY_TYPE))),
        (typeId) => {
          expect(isVehicleEntity(typeId)).toBe(
            Object.values(ENTITY_TYPE).includes(typeId),
          );
        },
      ),
    );
  });

  it("maps a ridden entity type to the ram mount (ADR 0006)", () => {
    for (const kind of VEHICLE_KINDS)
      expect(ramMountOf(ENTITY_TYPE[kind])).toBe("vehicle");
    expect(ramMountOf(DECK_SEAT_TYPE)).toBe("deckSeat");
    for (const typeId of [
      undefined,
      "minecraft:boat",
      "minecraft:horse",
      ITEM_TYPE.suv,
    ])
      expect(ramMountOf(typeId)).toBeUndefined();
  });

  it("gives a ram mount only to vehicle entities and deck seats", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          fc.constantFrom(...Object.values(ENTITY_TYPE), DECK_SEAT_TYPE),
        ),
        (typeId) => {
          const expected = Object.values(ENTITY_TYPE).includes(typeId)
            ? "vehicle"
            : typeId === DECK_SEAT_TYPE
              ? "deckSeat"
              : undefined;
          expect(ramMountOf(typeId)).toBe(expected);
        },
      ),
    );
  });

  it("gives every listed add-on identifier its own snake_case name in the add-on namespace", () => {
    expect(NAMESPACE).toMatch(/^[a-z][a-z0-9_]*$/);
    const ids = [
      ...Object.values(ENTITY_TYPE),
      ...Object.values(ITEM_TYPE),
      STARTER_RECEIVED_PROPERTY,
      FLEET_PROPERTY,
      OWNER_PROPERTY,
      HEADLIGHT_SWITCH_TYPE,
      HEADLIGHTS_PROPERTY,
      LIT_CELLS_PROPERTY,
      TEST_INPUT_EVENT,
      ...["form", "bank", "gear_down"].map(entityPropertyId),
      ...["gravity_on", "gravity_off"].map(entityEventId),
      ...PAINTS.map(paintEvent),
    ];
    for (const id of ids) {
      expect(id).toMatch(new RegExp(`^${NAMESPACE}:[a-z][a-z0-9_]*$`));
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
  it.each(VEHICLE_KINDS)(
    "reads the fleet entry and ownership of %s (ADR 0066)",
    (kind) => {
      for (const owner of ["player", undefined, "", 42, false, null]) {
        const entity = {
          id: "vehicle",
          typeId: ENTITY_TYPE[kind],
          getDynamicProperty: (key: string) => {
            expect(key).toBe(OWNER_PROPERTY);
            return owner;
          },
        };
        expect(fleetEntryOf(entity)).toEqual({
          id: entity.id,
          kind,
          owner: owner === "player" ? owner : undefined,
        });
      }
    },
  );

  it("does not read ownership for a non-vehicle entity", () => {
    expect(
      fleetEntryOf({
        id: "cow",
        typeId: "minecraft:cow",
        getDynamicProperty: () => {
          throw new Error("must not read");
        },
      }),
    ).toBeUndefined();
  });
});
