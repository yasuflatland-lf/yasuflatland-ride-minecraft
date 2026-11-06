import { MinecraftBlockTypes } from "@minecraft/vanilla-data";
import fc from "fast-check";
import { expect, it } from "vitest";
import { blockStateOf } from "../../../src/domain/build/blockState";
import { SCAN_STEP } from "../../../src/domain/build/edit/change";
import {
  isFillMaterial,
  UNSTABLE_MATERIALS,
} from "../../../src/domain/build/edit/guard";
import { planFillBelow } from "../../../src/domain/build/edit/plan";
import { terrainAreaOf } from "../../../src/domain/build/terrain/area";
import { type Cell, cellKey } from "../../../src/domain/shared/cells";

const stone = blockStateOf("minecraft:stone");

it("fills exactly the top-connected open cells, reads once, and budgets every read", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 1, max: 6 }),
      fc.integer({ min: 1, max: 6 }),
      fc.integer({ min: 1, max: 6 }),
      fc.array(fc.boolean(), { minLength: 216, maxLength: 216 }),
      fc.record({
        x: fc.integer({ min: -20, max: 20 }),
        y: fc.integer({ min: -64, max: 20 }),
        z: fc.integer({ min: -20, max: 20 }),
      }),
      (w, h, d, flags, origin) => {
        const cells: Cell[] = [];
        const open = new Set<string>();
        for (let y = 0; y < h; y++)
          for (let z = 0; z < d; z++)
            for (let x = 0; x < w; x++) {
              const cell = {
                x: origin.x + x,
                y: origin.y + y,
                z: origin.z + z,
              };
              if (flags[cells.length]) open.add(cellKey(cell));
              cells.push(cell);
            }
        // Independent fixed-point connectivity oracle, without traversal indices.
        const reachable = new Set(
          cells
            .filter((c) => c.y === origin.y + h - 1 && open.has(cellKey(c)))
            .map(cellKey),
        );
        let previous = -1;
        while (previous !== reachable.size) {
          previous = reachable.size;
          for (const c of cells)
            if (
              open.has(cellKey(c)) &&
              cells.some(
                (n) =>
                  reachable.has(cellKey(n)) &&
                  Math.abs(c.x - n.x) +
                    Math.abs(c.y - n.y) +
                    Math.abs(c.z - n.z) ===
                    1,
              )
            )
              reachable.add(cellKey(c));
        }
        const reads = new Set<string>();
        const written = new Set<string>();
        let scans = 0;
        const area = terrainAreaOf(origin, {
          x: origin.x + w - 1,
          y: origin.y + h - 1,
          z: origin.z + d - 1,
        });
        for (const step of planFillBelow(
          area,
          stone,
          (c) => {
            const key = cellKey(c);
            expect(reads.has(key)).toBe(false);
            expect(cells.some((n) => cellKey(n) === key)).toBe(true);
            reads.add(key);
            return open.has(key) && !written.has(key);
          },
          origin.y,
        )) {
          if (step === SCAN_STEP) {
            scans++;
            continue;
          }
          expect(open.has(cellKey(step.cell))).toBe(true);
          expect(written.has(cellKey(step.cell))).toBe(false);
          expect(step.after).toEqual(stone);
          written.add(cellKey(step.cell));
        }
        expect(written).toEqual(reachable);
        expect(scans).toBe(reads.size);
      },
    ),
  );
});

it.each([
  ["slope", 6, 5, (x: number, y: number) => y >= x, 15],
  [
    "large cavern with a narrow opening",
    8,
    6,
    (x: number, y: number) => y < 4 || x === 0,
    34,
  ],
  [
    "shaft with a long side passage",
    20,
    6,
    (x: number, y: number) => x === 0 || y === 1,
    25,
  ],
  [
    "upward pocket behind an overhang",
    6,
    6,
    (x: number, y: number) => x === 0 || y === 0 || (x >= 3 && y < 5),
    23,
  ],
] as const)("fills a %s", (_name, w, h, open, count) => {
  const area = terrainAreaOf(
    { x: 0, y: 0, z: 0 },
    { x: w - 1, y: h - 1, z: 0 },
  );
  const writes = [
    ...planFillBelow(area, stone, (c) => open(c.x, c.y), 0),
  ].filter((s) => s !== SCAN_STEP);
  expect(writes).toHaveLength(count);
});

it("refuses falling and supported materials while accepting stable full blocks", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(
        "sand",
        "red_sand",
        "gravel",
        "suspicious_sand",
        "suspicious_gravel",
        "anvil",
        "chipped_anvil",
        "damaged_anvil",
        "dragon_egg",
        "pointed_dripstone",
        "scaffolding",
        "snow_layer",
        "torch",
        "soul_torch",
        "poppy",
        "oak_sapling",
        "short_grass",
        "redstone_wire",
        "rail",
        "wooden_door",
        "moss_carpet",
      ),
      (name) => {
        expect(isFillMaterial(blockStateOf(`minecraft:${name}`))).toBe(false);
      },
    ),
  );
  for (const color of [
    "white",
    "orange",
    "magenta",
    "light_blue",
    "yellow",
    "lime",
    "pink",
    "gray",
    "light_gray",
    "cyan",
    "purple",
    "blue",
    "brown",
    "green",
    "red",
    "black",
  ]) {
    expect(
      isFillMaterial(blockStateOf(`minecraft:${color}_concrete_powder`)),
    ).toBe(false);
    expect(isFillMaterial(blockStateOf(`minecraft:${color}_carpet`))).toBe(
      false,
    );
  }
  for (const name of [
    "stone",
    "dirt",
    "glass",
    "oak_planks",
    "tube_coral_block",
    "sea_lantern",
    "packed_ice",
    "blue_ice",
  ])
    expect(isFillMaterial(blockStateOf(`minecraft:${name}`))).toBe(true);
});

it("uses only vanilla block IDs in the unstable material list", () => {
  const vanilla = new Set<string>(Object.values(MinecraftBlockTypes));
  expect([...UNSTABLE_MATERIALS].filter((id) => !vanilla.has(id))).toEqual([]);
});

it("refuses vanilla support-dependent families and Bedrock-specific IDs", () => {
  const ids = Object.values(MinecraftBlockTypes).filter((id) =>
    /(?:_candle(?:_cake)?|:candle(?:_cake)?|:cake|:bed|:straw_bed|_banner|:cave_vines.*|:chorus_.*|_coral(?:_wall)?_fan|_coral|copper_(?:torch|lantern)|:colored_torch_.*|:poplar_(?:door|button|pressure_plate|sapling)|:wooden_(?:door|button|pressure_plate)|:trip_wire|:portal|:bubble_column|:(?:frosted_)?ice|:(?:sticky_)?piston_arm_collision|_leaves(?:_flowered)?)$/.test(
      id,
    ),
  );
  for (const id of ids)
    expect(isFillMaterial(blockStateOf(id)), id).toBe(false);
});

it.each([
  "portal",
  "bubble_column",
  "ice",
  "frosted_ice",
  "piston_arm_collision",
  "sticky_piston_arm_collision",
  "oak_leaves",
  "azalea_leaves_flowered",
  "wooden_button",
  "wooden_pressure_plate",
  "trip_wire",
  "copper_torch",
  "colored_torch_red",
  "colored_torch_blue",
  "colored_torch_green",
  "colored_torch_purple",
  "poplar_door",
  "poplar_button",
  "poplar_pressure_plate",
  "poplar_sapling",
  "golden_dandelion",
  "amethyst_cluster",
  "small_amethyst_bud",
  "medium_amethyst_bud",
  "large_amethyst_bud",
  "resin_clump",
  "sculk_vein",
  "flower_pot",
  "frog_spawn",
  "turtle_egg",
  "sniffer_egg",
  "bell",
  "sulfur_spike",
  "shelf_mushroom",
  "red_shrub",
  "ice_crystal",
  "icicle",
  "pale_hanging_moss",
  "fire",
  "soul_fire",
  "poplar_standing_sign",
  "poplar_wall_sign",
  "poplar_hanging_sign",
])("refuses the vanilla material minecraft:%s", (name) => {
  const id = `minecraft:${name}`;
  expect(Object.values(MinecraftBlockTypes)).toContain(id);
  expect(isFillMaterial(blockStateOf(id))).toBe(false);
});
