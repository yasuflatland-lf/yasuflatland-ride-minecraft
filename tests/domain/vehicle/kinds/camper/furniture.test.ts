import { expect, it } from "vitest";
import {
  CAMPER_FURNITURE,
  DECOR_SPOTS,
  type LocalCell,
} from "../../../../../src/domain/vehicle/kinds/camper/furniture";

const key = ({ x, z, layer }: LocalCell): string => `${x},${z},${layer}`;

it("keeps every furniture cell inside the room interior above the floor (ADR 0093)", () => {
  for (const row of CAMPER_FURNITURE)
    for (const { x, z, layer } of row.cells) {
      expect(Number.isInteger(x)).toBe(true);
      expect(Number.isInteger(z)).toBe(true);
      expect(Number.isInteger(layer)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(-1);
      expect(x).toBeLessThanOrEqual(1);
      expect(z).toBeGreaterThanOrEqual(-3);
      expect(z).toBeLessThanOrEqual(3);
      expect([1, 2]).toContain(layer);
    }
});

it("gives each cell to at most one furniture row", () => {
  const keys = CAMPER_FURNITURE.flatMap((row) => row.cells.map(key));
  expect(new Set(keys).size).toBe(keys.length);
});

it("puts every slot in its own furniture's cell, with a unique id, a height from 0 to 15, and a known spot (ADR 0107)", () => {
  const ids: string[] = [];
  const cells = new Map<string, Set<string>>();
  for (const row of CAMPER_FURNITURE)
    for (const slot of row.slots) {
      expect(row.cells).toContainEqual(slot.cell);
      expect(Number.isInteger(slot.height)).toBe(true);
      expect(slot.height).toBeGreaterThanOrEqual(0);
      expect(slot.height).toBeLessThanOrEqual(15);
      expect(DECOR_SPOTS[slot.spot ?? 0]).toBeDefined();
      ids.push(slot.id);
      const kinds = cells.get(key(slot.cell)) ?? new Set<string>();
      kinds.add(row.kind);
      cells.set(key(slot.cell), kinds);
    }
  expect(new Set(ids).size).toBe(ids.length);
  for (const kinds of cells.values()) expect(kinds.size).toBe(1);
});

it("keeps each spot within 8 px of its cell middle, so its point stays on its cell (ADR 0107)", () => {
  for (const { left, forward } of DECOR_SPOTS) {
    expect(Math.abs(left)).toBeLessThan(8);
    expect(Math.abs(forward)).toBeLessThan(8);
  }
});

it("keeps slots off furniture that lays a block", () => {
  for (const row of CAMPER_FURNITURE)
    if (row.block !== undefined) expect(row.slots).toHaveLength(0);
});

it("lays the bed block in the two cells under the model's bed (ADR 0092)", () => {
  expect(CAMPER_FURNITURE.filter((row) => row.kind === "bed")).toEqual([
    {
      kind: "bed",
      cells: [
        { x: 1, z: -2, layer: 1 },
        { x: 1, z: -3, layer: 1 },
      ],
      slots: [],
      block: { type: "bed" },
    },
  ]);
});

it("gives the shower-toilet its own block in both of its cells (ADR 0098)", () => {
  const row = CAMPER_FURNITURE.find((r) => r.kind === "shower_toilet");
  expect(row?.block).toEqual({ type: "showerToilet" });
  expect(row?.cells).toEqual([
    { x: -1, z: -3, layer: 1 },
    { x: -1, z: -3, layer: 2 },
  ]);
});

it("lists the nine furniture kinds once each, in order", () => {
  expect(CAMPER_FURNITURE.map((f) => f.kind)).toEqual([
    "dashboard",
    "table",
    "dinette_seat",
    "bed",
    "shelf",
    "stove",
    "counter",
    "ceiling_hook",
    "shower_toilet",
  ]);
});

it("keeps the saved slot ids, cells, and heights", () => {
  expect(
    CAMPER_FURNITURE.flatMap((f) =>
      f.slots.map((s) => [s.id, s.cell.x, s.cell.z, s.cell.layer, s.height]),
    ),
  ).toEqual([
    ["dashboard_center", 0, 3, 2, 3],
    ["dashboard_left", 1, 3, 2, 3],
    ["table", 1, 0, 1, 12],
    ["dinette_front", 1, 1, 1, 7],
    ["dinette_rear", 1, -1, 1, 7],
    ["shelf_low", -1, 1, 1, 10],
    ["shelf_high", -1, 1, 2, 4],
    ["stove", -1, -2, 1, 15],
    ["counter", -1, -1, 1, 14],
    ["ceiling_hook", 1, 0, 2, 6],
  ]);
});

it("marks only the ceiling hook as hanging (ADR 0102)", () => {
  expect(
    CAMPER_FURNITURE.flatMap((f) => f.slots)
      .filter((s) => s.hanging === true)
      .map((s) => s.id),
  ).toEqual(["ceiling_hook"]);
});

it("puts every slot in a cell of its own furniture, 0 to 15 px up", () => {
  for (const row of CAMPER_FURNITURE) {
    for (const slot of row.slots) {
      expect(row.cells).toContainEqual(slot.cell);
      expect(Number.isInteger(slot.height)).toBe(true);
      expect(slot.height).toBeGreaterThanOrEqual(0);
      expect(slot.height).toBeLessThanOrEqual(15);
    }
  }
});

it("keeps every furniture cell inside the interior, apart from the others, and off the cell inside the door", () => {
  const cells = new Set<string>();
  for (const row of CAMPER_FURNITURE) {
    expect(row.block !== undefined).toBe(
      row.kind === "bed" || row.kind === "shower_toilet",
    );
    for (const cell of row.cells) {
      expect(cell.x).toBeGreaterThanOrEqual(-1);
      expect(cell.x).toBeLessThanOrEqual(1);
      expect(cell.z).toBeGreaterThanOrEqual(-3);
      expect(cell.z).toBeLessThanOrEqual(3);
      expect([1, 2]).toContain(cell.layer);
      expect(cells.has(key(cell))).toBe(false);
      cells.add(key(cell));
      expect(cell.x === -1 && cell.z === 0).toBe(false);
    }
  }
});
