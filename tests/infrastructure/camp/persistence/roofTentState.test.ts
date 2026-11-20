import fc from "fast-check";
import { expect, it } from "vitest";
import { asPlayerId } from "../../../../src/domain/shared/ids";
import {
  decodeExit,
  decodeSpawnSetters,
  encodeExit,
  encodeSpawnSetters,
} from "../../../../src/infrastructure/camp/persistence/roofTentState";

it("round-trips finite saved exits and setter lists in their original order", () => {
  const coordinate = fc
    .double({ noNaN: true, noDefaultInfinity: true })
    .map((value) => (value === 0 ? 0 : value));
  fc.assert(
    fc.property(
      fc.record({ x: coordinate, y: coordinate, z: coordinate }),
      fc.array(fc.string().map(asPlayerId)),
      (exit, setters) => {
        expect(decodeExit(encodeExit(exit))).toEqual(exit);
        expect(decodeSpawnSetters(encodeSpawnSetters(setters))).toEqual(
          setters,
        );
      },
    ),
  );
});

it.each([
  undefined,
  42,
  "{malformed",
  "null",
  "[]",
  '{"x":1,"y":2}',
  '{"x":1,"y":"2","z":3}',
  '{"x":1,"y":2,"z":1e999}',
])("ignores invalid saved exits: %s", (raw) => {
  expect(decodeExit(raw)).toBeUndefined();
});

it.each([undefined, 42, "[malformed", "null", "{}", '["first",42]'])(
  "ignores invalid saved setters: %s",
  (raw) => {
    expect(decodeSpawnSetters(raw)).toEqual([]);
  },
);
