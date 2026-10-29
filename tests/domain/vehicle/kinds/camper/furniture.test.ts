import { expect, it } from "vitest";
import {
  CAMPER_FURNITURE,
  DECOR_SPOTS,
  type LocalCell,
  SLEEP_BLOCKS,
  STORAGE_DOORS,
} from "../../../../../src/domain/vehicle/kinds/camper/furniture";

const key = ({ x, z, layer }: LocalCell): string => `${x},${z},${layer}`;

// The wall cabinet hangs under the ceiling plate, in the ceiling layer (ADR 0103, 0114).
const layersOf = (kind: string): number[] =>
  kind === "wall_cabinet" ? [3] : [1, 2];

it("keeps every furniture cell inside the room interior above the floor, the wall cabinet in the ceiling layer (ADR 0093, 0114)", () => {
  for (const row of CAMPER_FURNITURE)
    for (const { x, z, layer } of row.cells) {
      expect(Number.isInteger(x)).toBe(true);
      expect(Number.isInteger(z)).toBe(true);
      expect(Number.isInteger(layer)).toBe(true);
      expect(x).toBeGreaterThanOrEqual(-1);
      expect(x).toBeLessThanOrEqual(1);
      expect(z).toBeGreaterThanOrEqual(-3);
      expect(z).toBeLessThanOrEqual(3);
      expect(layersOf(row.kind)).toContain(layer);
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
      spawn: { x: 0, z: -2, layer: 1 },
    },
  ]);
});

it("lays the bunk block in the two cells over the bed, with its own aisle spawn one cell back (ADR 0182)", () => {
  expect(CAMPER_FURNITURE.filter((row) => row.kind === "bunk")).toEqual([
    {
      kind: "bunk",
      cells: [
        { x: 1, z: -2, layer: 2 },
        { x: 1, z: -3, layer: 2 },
      ],
      slots: [],
      block: { type: "bunk" },
      spawn: { x: 0, z: -3, layer: 1 },
    },
  ]);
});

it("gives every sleepable row its own spawn cell in the aisle, apart from the other beds' (ADR 0182)", () => {
  const sleepers = CAMPER_FURNITURE.filter(
    (row) => row.block !== undefined && SLEEP_BLOCKS.has(row.block.type),
  );
  expect(sleepers.map((row) => row.kind)).toEqual(["bed", "bunk"]);
  const spawns = sleepers.map((row) => row.spawn);
  for (const spawn of spawns) expect(spawn?.x).toBe(0);
  expect(new Set(spawns.map((s) => (s ? key(s) : undefined))).size).toBe(
    sleepers.length,
  );
});

it("gives the shower-toilet its own block in both of its cells (ADR 0098)", () => {
  const row = CAMPER_FURNITURE.find((r) => r.kind === "shower_toilet");
  expect(row?.block).toEqual({ type: "showerToilet" });
  expect(row?.cells).toEqual([
    { x: -1, z: -3, layer: 1 },
    { x: -1, z: -3, layer: 2 },
  ]);
});

it("lists the eleven furniture kinds once each, in order, the storage last: the wall cabinet, then the fridge (ADR 0114, 0121, 0123)", () => {
  expect(CAMPER_FURNITURE.map((f) => f.kind)).toEqual([
    "dashboard",
    "table",
    "dinette_seat",
    "bed",
    "bunk",
    "stove",
    "counter",
    "ceiling_hook",
    "shower_toilet",
    "wall_cabinet",
    "fridge",
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
    ["table_aisle", 1, 0, 1, 12],
    ["dinette_front", 1, 1, 1, 7],
    ["dinette_rear", 1, -1, 1, 7],
    ["stove", -1, -2, 1, 15],
    ["counter", -1, -1, 1, 14],
    ["ceiling_hook", 1, 0, 2, 6],
    ["cabinet_sink_rear", -1, -1, 3, 3],
    ["cabinet_sink_front", -1, -1, 3, 3],
    ["cabinet_stove_rear", -1, -2, 3, 3],
    ["cabinet_stove_front", -1, -2, 3, 3],
    ["fridge_bottom_rear", -1, 1, 1, 3],
    ["fridge_bottom_front", -1, 1, 1, 3],
    ["fridge_top_rear", -1, 1, 2, 4],
    ["fridge_top_front", -1, 1, 2, 4],
  ]);
});

it("puts two slots behind each storage door, at the shelf boards' end spots, and no other slot behind a door (ADR 0114, 0123)", () => {
  const slots = CAMPER_FURNITURE.flatMap((f) => f.slots);
  for (const { id: door, compartment: cell, unit } of STORAGE_DOORS) {
    const behind = slots.filter((s) => s.door === door);
    expect(behind.map((s) => s.spot)).toEqual([5, 6]);
    expect(behind.map((s) => s.pair)).toEqual([
      { kind: unit.pairKind, end: 0 },
      { kind: unit.pairKind, end: 1 },
    ]);
    for (const s of behind) expect(s.cell).toEqual(cell);
  }
  expect(slots.filter((s) => s.door !== undefined)).toHaveLength(8);
});

it("swings each cabinet door into the aisle cell beside its compartment, hinged at the cabinet's outer ends, and both fridge doors into the aisle cell beside the fridge, hinged at its front end (ADR 0114, 0123)", () => {
  expect(
    STORAGE_DOORS.map(({ id, compartment, plate, hinge }) => ({
      id,
      compartment,
      plate,
      hinge,
    })),
  ).toEqual([
    {
      id: "sink",
      compartment: { x: -1, z: -1, layer: 3 },
      plate: { x: 0, z: -1, layer: 3 },
      hinge: 1,
    },
    {
      id: "stove",
      compartment: { x: -1, z: -2, layer: 3 },
      plate: { x: 0, z: -2, layer: 3 },
      hinge: -1,
    },
    {
      id: "fridge_bottom",
      compartment: { x: -1, z: 1, layer: 1 },
      plate: { x: 0, z: 1, layer: 1 },
      hinge: 1,
    },
    {
      id: "fridge_top",
      compartment: { x: -1, z: 1, layer: 2 },
      plate: { x: 0, z: 1, layer: 2 },
      hinge: 1,
    },
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
      row.kind === "bed" || row.kind === "bunk" || row.kind === "shower_toilet",
    );
    for (const cell of row.cells) {
      expect(cell.x).toBeGreaterThanOrEqual(-1);
      expect(cell.x).toBeLessThanOrEqual(1);
      expect(cell.z).toBeGreaterThanOrEqual(-3);
      expect(cell.z).toBeLessThanOrEqual(3);
      expect(layersOf(row.kind)).toContain(cell.layer);
      expect(cells.has(key(cell))).toBe(false);
      cells.add(key(cell));
      expect(cell.x === -1 && cell.z === 0).toBe(false);
    }
  }
});
