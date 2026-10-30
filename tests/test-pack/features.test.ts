import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  covers,
  FEATURE_TAGS,
  isFeatureTag,
} from "../../src/test-pack/features";

const tag = fc.constantFrom(...FEATURE_TAGS);
const kind = fc.constantFrom(
  ...FEATURE_TAGS.filter((t) => t.startsWith("vehicle:")),
);

describe("feature tags", () => {
  it("recognizes exactly the declared tags", () => {
    fc.assert(
      fc.property(fc.oneof(tag, fc.string()), (text) => {
        expect(isFeatureTag(text)).toBe(FEATURE_TAGS.some((t) => t === text));
      }),
    );
  });

  it("covers itself", () => {
    fc.assert(
      fc.property(tag, (t) => {
        expect(covers(t, t)).toBe(true);
      }),
    );
  });

  it("lets vehicle cover every kind, without the reverse coverage", () => {
    fc.assert(
      fc.property(kind, (t) => {
        expect(covers("vehicle", t)).toBe(true);
        expect(covers(t, "vehicle")).toBe(false);
      }),
    );
  });

  it("keeps different kinds separate", () => {
    fc.assert(
      fc.property(kind, kind, (a, b) => {
        expect(covers(a, b)).toBe(a === b);
      }),
    );
  });

  it("lets camp and build cover only themselves", () => {
    fc.assert(
      fc.property(fc.constantFrom("camp", "build"), tag, (a, b) => {
        expect(covers(a, b)).toBe(a === b);
      }),
    );
  });
});
