import fc from "fast-check";
import { beforeEach, expect, it, vi } from "vitest";
import { toSnapshot } from "../../../src/domain/warp/snapshot";
import { emptyRegistry } from "../../../src/domain/warp/warpRegistry";
import { DynamicPropertyWarpRegistryStore } from "../../../src/infrastructure/warp/persistence/dynamicPropertyWarpRegistryStore";
import { point, registry } from "../../domain/warp/arbitraries";

const game = vi.hoisted(() => ({
  getDynamicProperty: vi.fn(),
  setDynamicProperty: vi.fn(),
}));
vi.mock("@minecraft/server", () => ({ world: game }));

const COUNT = "yasu_build:warp_registry:count";
const chunkKey = (index: number) => `yasu_build:warp_registry:${index}`;
const saved = new Map<string, unknown>();

beforeEach(() => {
  vi.resetAllMocks();
  saved.clear();
  game.getDynamicProperty.mockImplementation((key: string) => saved.get(key));
  game.setDynamicProperty.mockImplementation((key: string, value: unknown) => {
    if (value === undefined) saved.delete(key);
    else saved.set(key, value);
  });
});

it("reads lazily and reloads properties on every call", () => {
  const store = new DynamicPropertyWarpRegistryStore();
  expect(game.getDynamicProperty).not.toHaveBeenCalled();
  saved.set(chunkKey(0), "orphaned chunk");
  expect(store.load()).toEqual(emptyRegistry());
  expect(game.getDynamicProperty).toHaveBeenCalledExactlyOnceWith(COUNT);
  saved.set(COUNT, 1);
  expect(store.load()).toBeUndefined();
  saved.set(chunkKey(0), JSON.stringify(toSnapshot(emptyRegistry())));
  expect(store.load()).toEqual(emptyRegistry());
});

it("round trips registries through world properties", () => {
  fc.assert(
    fc.property(registry, (reg) => {
      const store = new DynamicPropertyWarpRegistryStore();
      store.save(reg);
      expect(new DynamicPropertyWarpRegistryStore().load()).toEqual(reg);
    }),
  );
});

it("rejects invalid counts, missing chunks, non-string chunks and invalid snapshots", () => {
  const store = new DynamicPropertyWarpRegistryStore();
  for (const count of ["1", true, -1, 0.5, NaN, Infinity, 2 ** 53]) {
    saved.set(COUNT, count);
    expect(store.load()).toBeUndefined();
  }
  saved.set(COUNT, 0);
  expect(store.load()).toBeUndefined();
  saved.set(COUNT, 1);
  for (const raw of [
    undefined,
    123,
    true,
    {},
    "{",
    "null",
    '{"version":2,"points":[]}',
  ]) {
    saved.set(chunkKey(0), raw);
    expect(store.load()).toBeUndefined();
  }
  saved.set(COUNT, 2);
  saved.set(chunkKey(0), JSON.stringify(toSnapshot(emptyRegistry())));
  expect(store.load()).toBeUndefined();
});

it("writes bounded chunks before the count and removes stale chunks afterwards", () => {
  fc.assert(
    fc.property(point, (p) => {
      saved.clear();
      game.setDynamicProperty.mockClear();
      const store = new DynamicPropertyWarpRegistryStore();
      const reg = { points: [{ ...p, owner: "\u0800".repeat(70_000) }] };
      store.save(reg);
      const calls = game.setDynamicProperty.mock.calls;
      const chunkCalls = calls.slice(0, -1);
      expect(chunkCalls.length).toBeGreaterThan(1);
      for (const [index, [key, value]] of chunkCalls.entries()) {
        expect(key).toBe(chunkKey(index));
        expect(typeof value).toBe("string");
        expect(value.length).toBeLessThan(30_000);
        expect(Buffer.byteLength(value, "utf8")).toBeLessThan(32_767);
      }
      expect(calls.at(-1)).toEqual([COUNT, chunkCalls.length]);
      expect(store.load()).toEqual(reg);
      game.setDynamicProperty.mockClear();
      store.save(emptyRegistry());
      expect(game.setDynamicProperty.mock.calls).toEqual([
        [chunkKey(0), JSON.stringify(toSnapshot(emptyRegistry()))],
        [COUNT, 1],
        ...Array.from({ length: chunkCalls.length - 1 }, (_, i) => [
          chunkKey(i + 1),
          undefined,
        ]),
      ]);
      expect(saved.size).toBe(2);
      expect(store.load()).toEqual(emptyRegistry());
    }),
    { numRuns: 10 },
  );
});

it("does not publish a count or delete stale chunks when a chunk write fails", () => {
  saved.set(COUNT, 3);
  saved.set(chunkKey(2), "stale");
  game.setDynamicProperty.mockImplementationOnce(() => {
    throw new Error("write failed");
  });
  expect(() =>
    new DynamicPropertyWarpRegistryStore().save(emptyRegistry()),
  ).toThrow("write failed");
  expect(game.setDynamicProperty).toHaveBeenCalledTimes(1);
  expect(saved.get(COUNT)).toBe(3);
  expect(saved.get(chunkKey(2))).toBe("stale");
});
