import { KEPT_BLOCKS } from "../../../shared/keptBlocks";
import { normalizeYaw, type Vec3 } from "../../../shared/vec";
import { rectCells } from "../../cutArea";
import type { Form } from "../../motion/forms";
import type { Pave } from "../../pave";
import { feetRow } from "./blade";
import { BULLDOZER_SPEC, type PaverRule } from "./spec";

export type CellClass = "solid" | "liquid" | "open";
interface RoadPick {
  readonly cell: Vec3;
  readonly over: "land" | "liquid";
}

/** The row the tracks stand on: a slab or dirt path is that row, as in bladeColumns (ADR 0181). */
export function referenceRow(feetY: number): number {
  return feetRow(feetY, true) - 1;
}

/** The row just below the body in flight. */
export function flightRow(feetY: number): number {
  return feetRow(feetY, false) - 1;
}

/** The road cell of one column on land, or undefined (ADR 0181 rule 6). */
export function roadPick(
  column: { x: number; z: number },
  ref: number,
  classAt: (row: number) => CellClass,
  rule: PaverRule,
): RoadPick | undefined {
  const at = (y: number, over: RoadPick["over"]): RoadPick => ({
    cell: { x: column.x, y, z: column.z },
    over,
  });
  const above = classAt(ref + 1);
  if (above === "solid")
    return classAt(ref + 2) === "solid" ? undefined : at(ref + 1, "land");
  const here = classAt(ref);
  if (here === "solid") return at(ref, "land");
  if (here === "liquid") return at(ref, "liquid");
  if (classAt(ref - 1) === "solid") return at(ref, "land");
  for (let depth = 1; depth <= rule.liquidSearchDepth; depth++) {
    const found = classAt(ref - depth);
    if (found === "open") continue;
    return found === "liquid" ? at(ref, "liquid") : undefined;
  }
  return undefined;
}

/** Blocks that fall, span several cells, need support, or cannot be placed as a cell. */
export const ROAD_REJECTED_BLOCKS: readonly string[] = [
  "minecraft:sand",
  "minecraft:red_sand",
  "minecraft:gravel",
  "minecraft:anvil",
  "minecraft:chipped_anvil",
  "minecraft:damaged_anvil",
  "minecraft:dragon_egg",
  "minecraft:pointed_dripstone",
  "minecraft:scaffolding",
  "minecraft:bed",
  "minecraft:tall_grass",
  "minecraft:large_fern",
  "minecraft:sunflower",
  "minecraft:lilac",
  "minecraft:rose_bush",
  "minecraft:peony",
  "minecraft:pitcher_plant",
  "minecraft:big_dripleaf",
  "minecraft:small_dripleaf_block",
  "minecraft:wheat",
  "minecraft:beetroot",
  "minecraft:nether_wart",
  "minecraft:kelp",
  "minecraft:bamboo",
  "minecraft:cactus",
  "minecraft:chorus_plant",
  "minecraft:chorus_flower",
  "minecraft:fire",
  "minecraft:soul_fire",
  "minecraft:portal",
  "minecraft:end_portal",
  "minecraft:bubble_column",
  "minecraft:piston_arm_collision",
  "minecraft:sticky_piston_arm_collision",
  "minecraft:structure_void",
  ...Array.from({ length: 16 }, (_, i) => `minecraft:light_block_${i}`),
];

const REJECTED_SUFFIXES = [
  "_door",
  "_bed",
  "_sign",
  "_hanging_sign",
  "_banner",
  "_concrete_powder",
];
const REJECTED_PREFIXES = ["yasu_ride:", "yasu_build:"];

/** Whether a held block may be laid as road (ADR 0181 rule 4). */
export function isRoadBlock(blockId: string): boolean {
  return !(
    KEPT_BLOCKS.includes(blockId) ||
    ROAD_REJECTED_BLOCKS.includes(blockId) ||
    REJECTED_PREFIXES.some((p) => blockId.startsWith(p)) ||
    REJECTED_SUFFIXES.some((s) => blockId.endsWith(s))
  );
}

interface PaveInput {
  /** Feet, before the move. */
  readonly location: Vec3;
  /** After the step, as the cut uses it. */
  readonly yaw: number;
  /** Signed. */
  readonly speed: number;
  readonly form: Form;
  readonly onGround: boolean;
  /** The current blade rule's. */
  readonly halfWidth: number;
  readonly block: string | undefined;
}

/** The road to lay this tick, or undefined (ADR 0181 rules 6 to 8). */
export function paveStep(
  input: PaveInput,
  classAt: (cell: Vec3) => CellClass,
  rule: PaverRule = BULLDOZER_SPEC.paver,
): Pave | undefined {
  const { location, speed, halfWidth, block } = input;
  if (block === undefined || !isRoadBlock(block)) return undefined;
  if (Math.abs(speed) <= rule.minSpeed) return undefined;
  const flying = input.form === "hover";
  if (!flying && !(input.form === "car" && input.onGround)) return undefined;
  const travelYaw = speed > 0 ? input.yaw : normalizeYaw(input.yaw + 180);
  const cells: Vec3[] = [];
  if (flying) {
    const y = flightRow(location.y);
    for (const { x, z } of rectCells(location, travelYaw, {
      near: -(rule.bodyHalf + rule.flightGap + rule.trail),
      far: -(rule.bodyHalf + rule.flightGap),
      halfWidth,
    })) {
      const cell = { x, y, z };
      if (classAt(cell) !== "solid") cells.push(cell);
    }
  } else {
    const ref = referenceRow(location.y);
    const pickIn = (near: number, far: number) =>
      rectCells(location, travelYaw, { near, far, halfWidth }).flatMap(
        (column) => {
          const pick = roadPick(
            column,
            ref,
            (row) => classAt({ x: column.x, y: row, z: column.z }),
            rule,
          );
          return pick === undefined ? [] : [pick];
        },
      );
    const taken = new Set<string>();
    const take = (pick: RoadPick) => {
      const key = `${pick.cell.x},${pick.cell.z}`;
      if (taken.has(key)) return;
      taken.add(key);
      cells.push(pick.cell);
    };
    for (const pick of pickIn(-(rule.bodyHalf + rule.trail), -rule.bodyHalf))
      take(pick);
    for (const pick of pickIn(-rule.bodyHalf, rule.bodyHalf + rule.lookAhead))
      if (pick.over === "liquid") take(pick);
  }
  return cells.length === 0 ? undefined : { block, cells };
}
