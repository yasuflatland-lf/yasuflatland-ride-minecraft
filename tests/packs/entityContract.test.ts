import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
import { VEHICLE_KINDS } from "../../src/domain/vehicle/kind";
import {
  entityContractOf,
  profileOf,
} from "../../src/domain/vehicle/kinds/index";
import { SPORTSBOAT_SPEC } from "../../src/domain/vehicle/kinds/sportsboat/spec";
import { DRIVER_SEAT } from "../../src/domain/vehicle/seats";
import {
  ENTITY_TYPE,
  entityAnimationId,
  entityEventId,
  entityPropertyId,
} from "../../src/infrastructure/vehicle/bedrock/identifiers";
import {
  CORE_EVENT_PREFIXES,
  CORE_PROPERTY_NAMES,
} from "../support/coreContract";
import { defined } from "../support/defined";
import { expectPackProperty } from "../support/entityContract";
import { jsonFiles } from "../support/packFiles";
import { SEAT_FILLER_FAMILY } from "../support/packIdentifiers";

const MAX_ENTITY_PROPERTIES = 32;

const animations = new Set(
  jsonFiles("packs/yasu_ride_rp/animations").flatMap((file) =>
    Object.keys(file.animations ?? {}),
  ),
);

function expectNotReserved(name: string): void {
  expect(CORE_PROPERTY_NAMES).not.toContain(name);
  expect(CORE_EVENT_PREFIXES.some((prefix) => name.startsWith(prefix))).toBe(
    false,
  );
}

it.each(VEHICLE_KINDS)(
  "matches the %s entity contract to its packs and reserves core names",
  (kind) => {
    const contract = entityContractOf(kind);
    const entity = JSON.parse(
      readFileSync(
        `packs/yasu_ride_bp/entities/yasu_ride/${kind}.se.json`,
        "utf8",
      ),
    )["minecraft:entity"];
    for (const [name, spec] of Object.entries(contract.properties)) {
      const definition = entity.description.properties[entityPropertyId(name)];
      expect(definition).toMatchObject(spec);
      expect(Object.keys(definition).sort()).toEqual(
        [...Object.keys(spec), "default", "client_sync"].sort(),
      );
      expectPackProperty(definition, spec);
      expectNotReserved(name);
    }
    for (const name of contract.events) {
      expect(entity.events).toHaveProperty(entityEventId(name));
      expectNotReserved(name);
    }
    for (const name of contract.animations) {
      expect(animations).toContain(entityAnimationId(ENTITY_TYPE[kind], name));
      expectNotReserved(name);
    }
    for (const name of contract.restored)
      expect(contract.properties).toHaveProperty(name);
    // An entity declares at most 32 properties; the drawer properties take the camper to 15 (ADR 0114).
    expect(
      Object.keys(entity.description.properties).length,
    ).toBeLessThanOrEqual(MAX_ENTITY_PROPERTIES);
  },
);

interface Rideable {
  seat_count: number;
  controlling_seat: number;
  family_types: string[];
  crouching_skip_interact: boolean;
  seats: { position: [number, number, number]; lock_rider_rotation?: number }[];
}

it("covers all five vehicle kinds for seat contracts", () => {
  expect(VEHICLE_KINDS.length).toBeGreaterThanOrEqual(5);
});

it.each(VEHICLE_KINDS)(
  "matches the %s seat positions and driver slot to its profile",
  (kind) => {
    const entity = JSON.parse(
      readFileSync(
        `packs/yasu_ride_bp/entities/yasu_ride/${kind}.se.json`,
        "utf8",
      ),
    )["minecraft:entity"];
    const rideable: Rideable = entity.components["minecraft:rideable"];
    const profile = profileOf(kind);
    expect(rideable.seat_count).toBe(profile.seats.positions.length);
    expect(rideable.seats.map(({ position: [x, , z] }) => ({ x, z }))).toEqual(
      profile.seats.positions,
    );
    expect(rideable.controlling_seat).toBe(DRIVER_SEAT);
    expect(rideable.seats[DRIVER_SEAT]?.lock_rider_rotation).toBe(90);
    expect(rideable.crouching_skip_interact).toBe(true);
    expect(rideable.family_types).toEqual(
      profile.boarding.order === "chosen"
        ? ["player", SEAT_FILLER_FAMILY]
        : ["player"],
    );

    if (kind === "sportsboat") {
      // The boarding ray aims at the riders' height and halfway to the next seat.
      expect(SPORTSBOAT_SPEC.seatAimHeight).toBe(0.52);
      expect(rideable.seats.map(({ position }) => position[1])).toEqual(
        profile.seats.positions.map(() => SPORTSBOAT_SPEC.seatAimHeight),
      );
      const [left, right] = profile.seats.positions;
      expect(SPORTSBOAT_SPEC.seatAimRadius).toBeCloseTo(
        Math.abs(
          defined(left, "port seat").x - defined(right, "starboard seat").x,
        ) / 2,
        9,
      );
    }
    if (kind === "scooter") {
      const [geometry] = JSON.parse(
        readFileSync(
          "packs/yasu_ride_rp/models/entity/yasu_ride/scooter.geo.json",
          "utf8",
        ),
      )["minecraft:geometry"];
      for (const [index, seat] of rideable.seats.entries()) {
        const locator = defined(
          geometry.bones.find(
            (bone: { name: string; pivot: number[] }) =>
              bone.name === `seat_${index}`,
          ),
          `scooter seat_${index} locator`,
        ) as { pivot: [number, number, number] };
        expect(seat.position[1]).toBe(locator.pivot[1] / 16);
      }
    }
    if (kind === "bulldozer")
      expect(rideable.seats[DRIVER_SEAT]?.position[1]).toBe(1.4);
  },
);
