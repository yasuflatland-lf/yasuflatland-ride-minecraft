import fc from "fast-check";
import { expect, it } from "vitest";
import { asFirePitId, type FirePitId } from "../../../src/domain/camp/firePit";
import { TABLE_SPOTS } from "../../../src/domain/camp/spec";
import { asTableId, type TableId } from "../../../src/domain/camp/table";
import {
  decodeHost as decodeSharedHost,
  encodeHost,
  type Host,
} from "../../../src/domain/shared/hosted";
import { asVehicleId, type VehicleId } from "../../../src/domain/shared/ids";
import type { LocalPoint } from "../../../src/domain/shared/tableTop";

const ids = fc.oneof(
  fc.string({ minLength: 1 }),
  fc.tuple(fc.string(), fc.string()).map(([a, b]) => `${a}:\n${b}`),
);
const coordinate = fc.integer().map((value) => value / 100);
const hosts: fc.Arbitrary<Host> = fc.oneof(
  fc.constant({ kind: "ground" } as const),
  fc.record({
    kind: fc.constant("vehicle" as const),
    id: ids.map(asVehicleId),
  }),
  fc.record({
    kind: fc.constant("spot" as const),
    hostType: fc.constant("fire_pit" as const),
    id: ids.map(asFirePitId),
    spot: fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
  }),
  fc.record({
    kind: fc.constant("top" as const),
    hostType: fc.constant("camp_table" as const),
    id: ids.map(asTableId),
    at: fc.record({ x: coordinate, z: coordinate }),
  }),
);

it("round-trips hosts with hundredth coordinates and non-empty ids", () => {
  fc.assert(
    fc.property(hosts, (host) => {
      expect(decodeHost(encodeHost(host))).toEqual(host);
    }),
  );
  expect(encodeHost({ kind: "ground" })).toBe("");
  expect(decodeHost("")).toEqual({ kind: "ground" });
});

it("migrates only existing legacy table spots into fresh points", () => {
  fc.assert(
    fc.property(
      ids,
      fc.oneof(fc.constantFrom(0, 1, 2, -1), fc.integer()),
      (id, spot) => {
        const host = decodeHost(`camp_table:${id}:${spot}`);
        const at = TABLE_SPOTS[spot];
        expect(host).toEqual(
          at
            ? { kind: "top", hostType: "camp_table", id, at }
            : { kind: "ground" },
        );
        if (host.kind === "top" && host.hostType === "camp_table")
          expect(host.at).not.toBe(at);
      },
    ),
  );
});

it("accepts only complete valid markers and never throws for arbitrary strings", () => {
  fc.assert(
    fc.property(
      fc.oneof(
        fc.string(),
        fc
          .tuple(fc.constantFrom("camp_table", "fire_pit"), ids, fc.string())
          .map(([kind, id, suffix]) => `${kind}:${id}:${suffix}`),
      ),
      (text) => {
        const host = decodeHost(text);
        const separator = text.lastIndexOf(":");
        const prefix = text.slice(0, text.indexOf(":"));
        const id = text.slice(text.indexOf(":") + 1, separator);
        const suffix = text.slice(separator + 1);
        const integer = /^(0|[1-9][0-9]*)$/.exec(suffix);
        const decimal =
          /^@(-?[0-9]+(?:\.[0-9]+)?),(-?[0-9]+(?:\.[0-9]+)?)$/.exec(suffix);
        const validSpot =
          integer?.[0] === suffix && Number.isSafeInteger(Number(suffix));
        const validPoint =
          decimal?.[0] === suffix &&
          Number.isFinite(Number(decimal?.[1])) &&
          Number.isFinite(Number(decimal?.[2]));
        const valid =
          id.length > 0 &&
          ((prefix === "fire_pit" && validSpot) ||
            (prefix === "camp_table" &&
              (validPoint ||
                (validSpot && TABLE_SPOTS[Number(suffix)] !== undefined))));
        const validVehicle = text.startsWith("vehicle:") && text.length > 8;
        expect(host.kind !== "ground").toBe(Boolean(valid || validVehicle));
      },
    ),
  );
  for (const text of [
    "vehicle:",
    "vehicle",
    "vehicles:a",
    " vehicle:a",
    "camp_table:a:@NaN,1",
    "camp_table:a:@Infinity,0",
    "camp_table::@1,2",
    "camp_table:a:@1",
    "camp_table:a:@1,2\n",
    "camp_table:a:@1e2,0",
    `camp_table:a:@${"9".repeat(400)},0`,
    "fire_pit:a:-1",
    "fire_pit:a:1.5",
    "fire_pit::0",
    "fire_pit:a:0\n",
    "fire_pit:a:9007199254740992",
  ])
    expect(decodeHost(text)).toEqual({ kind: "ground" });
});

it("writes finite doubles as decimal coordinates rounded to at most two places", () => {
  const finite = fc.oneof(
    fc.double({ noNaN: true, noDefaultInfinity: true }),
    fc.constantFrom(-0, -0.001, 1e21, -1e21, Number.MAX_VALUE),
  );
  fc.assert(
    fc.property(finite, finite, (x, z) => {
      const encoded = encodeHost({
        kind: "top",
        hostType: "camp_table",
        id: asTableId("a"),
        at: { x, z },
      });
      expect(encoded).toMatch(
        /^camp_table:a:@-?[0-9]+(?:\.[0-9]{1,2})?,-?[0-9]+(?:\.[0-9]{1,2})?$/,
      );
      const rounded = (value: number) => Number(value.toFixed(2)) || 0;
      expect(decodeHost(encoded)).toEqual({
        kind: "top",
        hostType: "camp_table",
        id: asTableId("a"),
        at: { x: rounded(x), z: rounded(z) },
      });
      expect(encodeHost(decodeHost(encoded))).toBe(encoded);
    }),
  );
});

it("preserves all characters after the vehicle prefix", () => {
  fc.assert(
    fc.property(ids, (id) => {
      expect(encodeHost({ kind: "vehicle", id: asVehicleId(id) })).toBe(
        `vehicle:${id}`,
      );
      expect(decodeHost(`vehicle:${id}`)).toEqual({
        kind: "vehicle",
        id: asVehicleId(id),
      });
    }),
  );
  expect(decodeHost("vehicle:a:b\nc")).toEqual({
    kind: "vehicle",
    id: asVehicleId("a:b\nc"),
  });
});

function decodeHost(text: string) {
  return decodeSharedHost(text, (type, spot) =>
    type === "camp_table" ? TABLE_SPOTS[spot] : undefined,
  );
}

// Frozen pre-refactor codec: saved-marker compatibility must not follow the new implementation.
type OldHost =
  | { readonly kind: "ground" }
  | { readonly kind: "vehicle"; readonly id: VehicleId }
  | { readonly kind: "fire_pit"; readonly id: FirePitId; readonly spot: number }
  | {
      readonly kind: "camp_table";
      readonly id: TableId;
      readonly at: LocalPoint;
    };

// The `s` flag lets `.+` cross newlines, so an id may hold any character and
// the last colon always separates it from the position.
const TABLE_POINT_MARKER =
  /^camp_table:(.+):@(-?[0-9]+(?:\.[0-9]+)?),(-?[0-9]+(?:\.[0-9]+)?)$/s;
const SPOT_MARKER = /^(fire_pit|camp_table):(.+):(0|[1-9][0-9]*)$/s;

// Number#toString switches to exponent notation from 1e21, which the decoder
// does not accept, so the exponent is expanded back into plain digits.
function encodeCoordinate(value: number): string {
  const rounded = Number(value.toFixed(2)).toString();
  const [coefficient, exponent] = rounded.split("e+");
  if (coefficient === undefined || exponent === undefined) return rounded;
  const [whole, fraction = ""] = coefficient.split(".");
  return `${whole}${fraction}${"0".repeat(Number(exponent) - fraction.length)}`;
}

function withoutNegativeZero(value: number): number {
  return value === 0 ? 0 : value;
}

function oldEncodeHost(host: OldHost): string {
  switch (host.kind) {
    case "ground":
      return "";
    case "vehicle":
      return `vehicle:${host.id}`;
    case "fire_pit":
      return `fire_pit:${host.id}:${host.spot}`;
    case "camp_table":
      return `camp_table:${host.id}:@${encodeCoordinate(host.at.x)},${encodeCoordinate(host.at.z)}`;
  }
}

function oldDecodeHost(text: string): OldHost {
  if (text.startsWith("vehicle:") && text.length > "vehicle:".length)
    return { kind: "vehicle", id: asVehicleId(text.slice("vehicle:".length)) };

  const point = TABLE_POINT_MARKER.exec(text);
  if (point) {
    const [, id, rawX, rawZ] = point;
    const x = Number(rawX);
    const z = Number(rawZ);
    if (!id || !Number.isFinite(x) || !Number.isFinite(z))
      return { kind: "ground" };
    return {
      kind: "camp_table",
      id: asTableId(id),
      at: { x: withoutNegativeZero(x), z: withoutNegativeZero(z) },
    };
  }

  const marker = SPOT_MARKER.exec(text);
  if (!marker) return { kind: "ground" };
  const [, kind, id, rawSpot] = marker;
  const spot = Number(rawSpot);
  if (!id || !Number.isSafeInteger(spot)) return { kind: "ground" };
  if (kind === "fire_pit") return { kind, id: asFirePitId(id), spot };
  // A legacy table marker stores an index into TABLE_SPOTS instead of a point.
  const at = TABLE_SPOTS[spot];
  return at
    ? { kind: "camp_table", id: asTableId(id), at: { ...at } }
    : { kind: "ground" };
}

function sharedMeaning(host: OldHost): Host {
  switch (host.kind) {
    case "camp_table":
      return { kind: "top", hostType: "camp_table", id: host.id, at: host.at };
    case "fire_pit":
      return {
        kind: "spot",
        hostType: "fire_pit",
        id: host.id,
        spot: host.spot,
      };
    default:
      return host;
  }
}

it("preserves the meaning and exact bytes of markers written by the old codec", () => {
  const finite = fc.oneof(
    fc.double({ noNaN: true, noDefaultInfinity: true }),
    fc.constantFrom(-0, -0.001, 1e21, -1e21, Number.MAX_VALUE),
  );
  const oldHosts: fc.Arbitrary<OldHost> = fc.oneof(
    fc.record({
      kind: fc.constant("camp_table" as const),
      id: ids.map(asTableId),
      at: fc.record({ x: finite, z: finite }),
    }),
    fc.record({
      kind: fc.constant("fire_pit" as const),
      id: ids.map(asFirePitId),
      spot: fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER }),
    }),
    fc.record({
      kind: fc.constant("vehicle" as const),
      id: ids.map(asVehicleId),
    }),
  );
  fc.assert(
    fc.property(oldHosts, (host) => {
      const marker = oldEncodeHost(host);
      const decoded = decodeHost(marker);
      expect(decoded).toEqual(sharedMeaning(oldDecodeHost(marker)));
      expect(encodeHost(decoded)).toBe(marker);
    }),
  );
});

it("migrates legacy table markers with the same meaning and canonical bytes as the old codec", () => {
  fc.assert(
    fc.property(
      ids,
      fc.oneof(fc.constantFrom(0, 1, 2, -1), fc.integer()),
      (id, spot) => {
        const marker = `camp_table:${id}:${spot}`;
        const old = oldDecodeHost(marker);
        const decoded = decodeHost(marker);
        expect(decoded).toEqual(sharedMeaning(old));
        expect(encodeHost(decoded)).toBe(oldEncodeHost(old));
      },
    ),
  );
});

it("round-trips top host types without a camp dependency or a legacy resolver", () => {
  fc.assert(
    fc.property(
      fc
        .stringMatching(/^[a-z_]+$/)
        .filter((type) => type !== "vehicle" && type !== "fire_pit"),
      ids,
      coordinate,
      coordinate,
      (hostType, id, x, z) => {
        const host: Host = { kind: "top", hostType, id, at: { x, z } };
        expect(decodeSharedHost(encodeHost(host))).toEqual(host);
      },
    ),
  );
});

it("rejects invalid top host type prefixes and reserved fire pit point markers", () => {
  fc.assert(
    fc.property(
      fc.constantFrom("top1", "Top", "top-host", "top host", "fire_pit"),
      ids,
      coordinate,
      coordinate,
      (hostType, id, x, z) => {
        expect(decodeSharedHost(`${hostType}:${id}:@${x},${z}`)).toEqual({
          kind: "ground",
        });
      },
    ),
  );
});
