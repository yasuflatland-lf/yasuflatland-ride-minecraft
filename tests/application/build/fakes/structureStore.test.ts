import { expect, it } from "vitest";
import { boxOf } from "../../../../src/domain/build/box";
import { asDimensionId, asPlayerId } from "../../../../src/domain/shared/ids";
import { FakeStructureStore } from "./structureStore";

const dim = asDimensionId("minecraft:overworld");
const owner = asPlayerId("p1");
const box = boxOf({ x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 2 });
const anchor = { x: 5, y: 5, z: 5 };

it("captures, places, and discards while recording every call", () => {
  const store = new FakeStructureStore();
  const handle = store.capture(dim, box, owner);
  expect(handle).not.toBe("tooLarge");
  expect(handle).not.toBe("unreadable");
  if (handle === "tooLarge" || handle === "unreadable") return;
  expect(store.place(handle, dim, anchor)).toBe(true);
  store.discard(handle);
  store.discard(handle);
  expect(store.place(handle, dim, anchor)).toBe(false);
  expect(store.live.size).toBe(0);
  expect(store.calls.map((call) => call.kind)).toEqual([
    "capture",
    "place",
    "discard",
    "discard",
    "place",
  ]);
});

it("returns the configured refusal and saves nothing", () => {
  const store = new FakeStructureStore();
  store.captureRefusal = "tooLarge";
  expect(store.capture(dim, box, owner)).toBe("tooLarge");
  expect(store.live.size).toBe(0);
});

it("records clears and reports the configured result", () => {
  const store = new FakeStructureStore();
  store.clearBlocksSucceeds = false;
  store.clearEntities(dim, box);
  expect(store.clearBlocks(dim, box)).toBe(false);
  expect(store.calls.map((call) => call.kind)).toEqual([
    "clearEntities",
    "clearBlocks",
  ]);
});

it.each([undefined, 0, 1, 2, 3] as const)(
  "records turn %s with a zero default",
  (turn) => {
    const store = new FakeStructureStore();
    const handle = store.capture(dim, box, owner);
    if (handle === "tooLarge" || handle === "unreadable")
      throw new Error(handle);
    expect(store.place(handle, dim, anchor, turn)).toBe(true);
    expect(store.calls.at(-1)).toEqual({
      kind: "place",
      handle,
      dimensionId: dim,
      anchor,
      turn: turn ?? 0,
    });
  },
);
