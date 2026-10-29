import { describe, expect, it, vi } from "vitest";
import { asTentId } from "../../../src/domain/camp/tent";
import { TentFlapStore } from "../../../src/infrastructure/camp/bedrock/tentFlapStore";
import { TENT_FLAP_PROPERTY } from "../../../src/infrastructure/camp/identifiers";

vi.mock("@minecraft/server", () => ({}));

const tent = (id: string, props: Record<string, unknown> = {}) => ({
  id,
  getProperty: vi.fn((name: string) => props[name]),
});

describe("TentFlapStore (ADR 0132)", () => {
  it("reads the four flap properties once per tent", () => {
    const store = new TentFlapStore();
    const a = tent("a");
    const flaps = store.flapsOf(a as never);
    expect(store.flapsOf(a as never)).toBe(flaps);
    expect(a.getProperty.mock.calls.map((c) => c[0])).toEqual([
      TENT_FLAP_PROPERTY.front,
      TENT_FLAP_PROPERTY.left,
      TENT_FLAP_PROPERTY.right,
      TENT_FLAP_PROPERTY.bedroom,
    ]);
  });

  it("restores an open flap after a reload, which builds a new store", () => {
    const saved = tent("a", { [TENT_FLAP_PROPERTY.right]: 1 });
    const flaps = new TentFlapStore().flapsOf(saved as never);
    expect(flaps.open()).toEqual(new Set(["right"]));
  });

  it("forgets one tent, and every tent not live", () => {
    const store = new TentFlapStore();
    const a = tent("a");
    const b = tent("b");
    const c = tent("c");
    const fa = store.flapsOf(a as never);
    const fb = store.flapsOf(b as never);
    const fc = store.flapsOf(c as never);
    store.forget(asTentId("a"));
    expect(store.flapsOf(a as never)).not.toBe(fa);
    store.forgetGone(new Set([asTentId("b")]));
    expect(store.flapsOf(b as never)).toBe(fb);
    expect(store.flapsOf(c as never)).not.toBe(fc);
  });
});
