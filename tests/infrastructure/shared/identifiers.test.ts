import fc from "fast-check";
import { expect, it } from "vitest";
import { BUILD_NAMESPACE } from "../../../src/infrastructure/build/identifiers";
import {
  ROOF_TENT_STARTER_RECEIVED_PROPERTY,
  TENT_CELLS_PROPERTY,
  TENTS_PROPERTY,
} from "../../../src/infrastructure/camp/identifiers";
import { BEACH_PARASOL_STARTER_RECEIVED_PROPERTY } from "../../../src/infrastructure/resort/identifiers";
import {
  bareId,
  id,
  messageKey,
  NAMESPACE,
} from "../../../src/infrastructure/shared/identifiers";
import {
  DECK_CELLS_PROPERTY,
  DECK_SEAT_OF_PROPERTY,
  DECK_SEATS_PROPERTY,
  FLEET_PROPERTY,
  GIFT_RECEIVED_PROPERTY,
  LIT_CELLS_PROPERTY,
  OWNER_PROPERTY,
  STAND_IN_OF_PROPERTY,
  STAND_IN_PROPERTY,
  STARTER_RECEIVED_PROPERTY,
} from "../../../src/infrastructure/vehicle/bedrock/identifiers";
import { DECOR_PROPERTY } from "../../../src/infrastructure/vehicle/kinds/camper/identifiers";
import {
  WARP_REGISTRY_COUNT,
  warpRegistryChunkKey,
} from "../../../src/infrastructure/warp/identifiers";

it("persisted identifiers stay stable (ADR 0047)", () => {
  expect({
    namespaces: { ride: NAMESPACE, build: BUILD_NAMESPACE },
    starters: {
      ...STARTER_RECEIVED_PROPERTY,
      roofTent: ROOF_TENT_STARTER_RECEIVED_PROPERTY,
      beachParasol: BEACH_PARASOL_STARTER_RECEIVED_PROPERTY,
    },
    gifts: GIFT_RECEIVED_PROPERTY,
    world: {
      fleet: FLEET_PROPERTY,
      tents: TENTS_PROPERTY,
      warpCount: WARP_REGISTRY_COUNT,
      warpChunks: [warpRegistryChunkKey(0, 0), warpRegistryChunkKey(1, 0)],
    },
    entity: {
      owner: OWNER_PROPERTY,
      litCells: LIT_CELLS_PROPERTY,
      deckCells: DECK_CELLS_PROPERTY,
      deckSeats: DECK_SEATS_PROPERTY,
      deckSeatOf: DECK_SEAT_OF_PROPERTY,
      standIn: STAND_IN_PROPERTY,
      standInOf: STAND_IN_OF_PROPERTY,
      decor: DECOR_PROPERTY,
      tentCells: TENT_CELLS_PROPERTY,
    },
  }).toMatchInlineSnapshot(`
    {
      "entity": {
        "deckCells": "yasu_ride:deck_cells",
        "deckSeatOf": "yasu_ride:deck_seat_of",
        "deckSeats": "yasu_ride:deck_seats",
        "decor": "yasu_ride:decor",
        "litCells": "yasu_ride:lit_cells",
        "owner": "yasu_ride:owner",
        "standIn": "yasu_ride:stand_in",
        "standInOf": "yasu_ride:stand_in_of",
        "tentCells": "yasu_ride:tent_cells",
      },
      "gifts": {
        "camping_gear_box": "yasu_ride:camping_gear_given",
        "sportsboat_equipment_box": "yasu_ride:sportsboat_equipment_given",
      },
      "namespaces": {
        "build": "yasu_build",
        "ride": "yasu_ride",
      },
      "starters": {
        "beachParasol": "yasu_ride:beach_parasol_starter_received",
        "bulldozer": "yasu_ride:bulldozer_starter_received",
        "roofTent": "yasu_ride:roof_tent_starter_received",
        "suv": "yasu_ride:starter_received",
      },
      "world": {
        "fleet": "yasu_ride:fleet",
        "tents": "yasu_ride:tents",
        "warpChunks": [
          "yasu_build:warp_registry:0:0",
          "yasu_build:warp_registry:1:0",
        ],
        "warpCount": "yasu_build:warp_registry:count",
      },
    }
  `);
});

it("builds an action bar message key for any name", () => {
  fc.assert(
    fc.property(fc.string(), (name) => {
      expect(messageKey(name)).toBe(`yasu_ride.message.${name}`);
    }),
  );
});

it("recovers bare snake_case names from add-on ids", () => {
  fc.assert(
    fc.property(fc.stringMatching(/^[a-z]+(_[a-z]+)*$/), (name) => {
      expect(bareId(id(name))).toBe(name);
    }),
  );
});

it("rejects vanilla ids", () => {
  expect(bareId("minecraft:stone")).toBeUndefined();
});
