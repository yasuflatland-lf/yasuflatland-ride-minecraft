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
const chunkKey = (bank: number, index: number) =>
  `yasu_build:warp_registry:${bank}:${index}`;
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
  saved.set(chunkKey(0, 0), "orphaned chunk");
  expect(store.load()).toEqual(emptyRegistry());
  expect(game.getDynamicProperty).toHaveBeenCalledExactlyOnceWith(COUNT);
  saved.set(COUNT, "0:1");
  expect(store.load()).toBeUndefined();
  saved.set(chunkKey(0, 0), JSON.stringify(toSnapshot(emptyRegistry())));
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
  for (const count of [
    1,
    "1",
    "2:1",
    "0:-1",
    "0:01",
    "0:1.5",
    "0:",
    true,
    -1,
    NaN,
    `0:${2 ** 53}`,
  ]) {
    saved.set(COUNT, count);
    expect(store.load()).toBeUndefined();
  }
  saved.set(COUNT, "0:1");
  for (const raw of [
    undefined,
    123,
    true,
    {},
    "{",
    "null",
    '{"version":2,"points":[]}',
  ]) {
    saved.set(chunkKey(0, 0), raw);
    expect(store.load()).toBeUndefined();
  }
  saved.set(COUNT, "1:2");
  saved.set(chunkKey(1, 0), JSON.stringify(toSnapshot(emptyRegistry())));
  expect(store.load()).toBeUndefined();
});

it("writes bounded chunks before the count and removes the old bank afterwards", () => {
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
        expect(key).toBe(chunkKey(0, index));
        expect(typeof value).toBe("string");
        expect(value.length).toBeLessThan(30_000);
        expect(Buffer.byteLength(value, "utf8")).toBeLessThan(32_767);
      }
      expect(calls.at(-1)).toEqual([COUNT, `0:${chunkCalls.length}`]);
      expect(store.load()).toEqual(reg);
      game.setDynamicProperty.mockClear();
      store.save(emptyRegistry());
      expect(game.setDynamicProperty.mock.calls).toEqual([
        [chunkKey(1, 0), JSON.stringify(toSnapshot(emptyRegistry()))],
        [COUNT, "1:1"],
        ...Array.from({ length: chunkCalls.length }, (_, i) => [
          chunkKey(0, i),
          undefined,
        ]),
      ]);
      expect(saved.size).toBe(2);
      expect(store.load()).toEqual(emptyRegistry());
    }),
    { numRuns: 10 },
  );
});

it("does not publish a count or delete the old bank when the first chunk write fails", () => {
  saved.set(COUNT, "0:1");
  saved.set(chunkKey(0, 0), JSON.stringify(toSnapshot(emptyRegistry())));
  game.setDynamicProperty.mockImplementationOnce(() => {
    throw new Error("write failed");
  });
  expect(() =>
    new DynamicPropertyWarpRegistryStore().save(emptyRegistry()),
  ).toThrow("write failed");
  expect(game.setDynamicProperty).toHaveBeenCalledTimes(1);
  expect(saved.get(COUNT)).toBe("0:1");
  expect(new DynamicPropertyWarpRegistryStore().load()).toEqual(
    emptyRegistry(),
  );
});

it("keeps the old multi-chunk registry readable when an overwrite fails after the first chunk", () => {
  const store = new DynamicPropertyWarpRegistryStore();
  const [base] = fc.sample(point, 1);
  if (!base) throw new Error("no sample");
  const big = (owner: string) => ({
    points: [{ ...base, owner: owner.repeat(70_000) }],
  });
  const old = big("\u0800");
  store.save(old);
  expect(saved.get(COUNT)).toMatch(/^0:[2-9]/);
  let writes = 0;
  game.setDynamicProperty.mockImplementation((key: string, value: unknown) => {
    if (++writes === 2) throw new Error("write failed");
    if (value === undefined) saved.delete(key);
    else saved.set(key, value);
  });
  expect(() => store.save(big("\u0801"))).toThrow("write failed");
  expect(new DynamicPropertyWarpRegistryStore().load()).toEqual(old);
  writes = -1000;
  store.save(big("\u0801"));
  expect(store.load()).toEqual(big("\u0801"));
});
