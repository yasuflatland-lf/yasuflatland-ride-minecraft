import fc from "fast-check";
import { expect, it } from "vitest";
import { navMapReply } from "../../../../src/infrastructure/vehicle/testHooks/navMapReply";

it("round-trips delivery observations and error text with the player request key", () => {
  const playerId = fc.bigInt().map(String);
  const count = fc.option(fc.nat(), { nil: undefined });
  const reply = fc.oneof(
    fc.record({ playerId, error: fc.string() }),
    fc.record({
      playerId,
      result: fc.constantFrom(
        "given" as const,
        "nothing" as const,
        "unknown" as const,
      ),
      path: fc.constantFrom("give" as const, "spawn" as const),
      before: count,
      after: count,
      observedBefore: count,
      observedAfter: count,
    }),
  );
  fc.assert(
    fc.property(reply, (value) => {
      expect(navMapReply.parse(navMapReply.format(value))).toStrictEqual({
        ...value,
      });
    }),
  );
});
