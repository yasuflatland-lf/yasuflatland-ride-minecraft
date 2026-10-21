import { expect, it } from "vitest";
import {
  CAMPER_FURNITURE,
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

it("puts every slot in its own furniture's cell, one slot per cell, with a unique id and a height from 0 to 15", () => {
  const ids: string[] = [];
  const cells: string[] = [];
  for (const row of CAMPER_FURNITURE)
    for (const slot of row.slots) {
      expect(row.cells).toContainEqual(slot.cell);
      expect(Number.isInteger(slot.height)).toBe(true);
      expect(slot.height).toBeGreaterThanOrEqual(0);
      expect(slot.height).toBeLessThanOrEqual(15);
      ids.push(slot.id);
      cells.push(key(slot.cell));
    }
  expect(new Set(ids).size).toBe(ids.length);
  expect(new Set(cells).size).toBe(cells.length);
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
