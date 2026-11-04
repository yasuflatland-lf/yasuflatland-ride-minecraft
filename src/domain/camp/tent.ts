// Where a pitched tent stands, which cells it lays, and when it may be pitched (ADR 0130, 0131).
import { type Cell, cellKey, cellOf } from "../shared/cells";
import { CLEARABLE_DECORATIONS } from "../shared/decorations";
import type { LaidCell } from "../shared/laidCells";
import {
  forward,
  leftOf,
  normalizeYaw,
  type Vec2,
  type Vec3,
} from "../shared/vec";
import { TENT_SPEC } from "./spec";
import {
  type FlapId,
  inTentLocalBox,
  type TentFace,
  type TentLayout,
  type TentLocalCell,
  TRAPEZOID_LAYOUT,
  tentCellKey,
} from "./tentLayout";

export type { FlapId, TentFace, TentLocalCell } from "./tentLayout";

/** The Entity.id of a pitched tent. */
export type TentId = string & { readonly __brand: "TentId" };

/** Brands an id that is known to belong to a tent. Called only in the infrastructure layer and in tests. */
export function asTentId(raw: string): TentId {
  return raw as TentId;
}

export type TentYaw = 0 | 90 | 180 | -90;

/** x, y, z: the world cell of local (0, 0, layer 0), integers. yaw: the way the tent's front faces. */
export interface TentPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: TentYaw;
}

export type TentBlock =
  | { readonly type: "wall"; readonly face: TentFace }
  | { readonly type: "ceiling" }
  | { readonly type: "flap"; readonly id: FlapId; readonly open: boolean }
  | { readonly type: "mattress"; readonly index: 0 | 1 }
  | { readonly type: "lantern"; readonly lit: boolean };

/** What can change on a pitched tent; tentCells lays the blocks that follow it. */
export interface TentState {
  readonly openFlaps: ReadonlySet<FlapId>;
  readonly lanternOn: boolean;
}

/** A tent as it is pitched: every flap closed and the lantern off. */
export const PITCHED_STATE: TentState = {
  openFlaps: new Set(),
  lanternOn: false,
};

const LAYOUT: TentLayout = TRAPEZOID_LAYOUT;
const AIR = "minecraft:air";

const range = (from: number, to: number): number[] =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

const rounded = (v: Vec2): Vec2 => ({
  x: Math.round(v.x) + 0,
  z: Math.round(v.z) + 0,
});

function axes(yaw: TentYaw): { f: Vec2; l: Vec2 } {
  const f = rounded(forward(yaw));
  return { f, l: rounded(leftOf(f)) };
}

/**
 * The block the tent rests on when `clicked` is pressed: a snow layer, a carpet,
 * or a plant covers the ground and takes the click, so the pitch steps down
 * through them and clears them with the rest of the footprint.
 */
export function tentGround(
  clicked: Vec3,
  typeIdAt: (at: Vec3) => string | undefined,
): Vec3 {
  let ground = clicked;
  for (let i = 0; i < LAYOUT.clear.layers; i++) {
    const typeId = typeIdAt(ground);
    if (typeId === undefined || !CLEARABLE_DECORATIONS.has(typeId)) break;
    ground = { x: ground.x, y: ground.y - 1, z: ground.z };
  }
  return ground;
}

/** The tent faces the player who pitches it, with its front edge on the clicked column. */
export function tentPose(clicked: Vec3, playerYaw: number): TentPose {
  const step = TENT_SPEC.yawStep;
  const yaw = (normalizeYaw(Math.round((playerYaw + 180) / step) * step) +
    0) as TentYaw;
  return { x: clicked.x, y: clicked.y + 1, z: clicked.z, yaw };
}

export function tentCellAt(pose: TentPose, local: TentLocalCell): Cell {
  const { f, l } = axes(pose.yaw);
  return {
    x: pose.x + local.x * l.x - local.depth * f.x + 0,
    y: pose.y + local.layer + 0,
    z: pose.z + local.x * l.z - local.depth * f.z + 0,
  };
}

function toLocal(pose: TentPose, cell: Cell): TentLocalCell {
  const { f, l } = axes(pose.yaw);
  const dx = cell.x - pose.x;
  const dz = cell.z - pose.z;
  return {
    x: dx * l.x + dz * l.z + 0,
    depth: -(dx * f.x + dz * f.z) + 0,
    layer: cell.y - pose.y + 0,
  };
}

function faceToward(v: Vec2): TentFace {
  if (v.z !== 0) return v.z < 0 ? 0 : 1;
  return v.x < 0 ? 2 : 3;
}

const scaled = (v: Vec2, k: number): Vec2 => ({ x: v.x * k, z: v.z * k });

export function lanternCell(pose: TentPose): Cell {
  return tentCellAt(pose, LAYOUT.lantern);
}

export function tentCells(
  pose: TentPose,
  state: TentState,
): LaidCell<TentBlock>[] {
  const { f, l } = axes(pose.yaw);
  const cells: LaidCell<TentBlock>[] = [];
  const lay = (local: TentLocalCell, block: TentBlock) => {
    const flap =
      block.type === "wall" ? FLAP_BY_LOCAL.get(tentCellKey(local)) : undefined;
    cells.push({
      ...tentCellAt(pose, local),
      block:
        flap === undefined
          ? block
          : { type: "flap", id: flap, open: state.openFlaps.has(flap) },
    });
  };
  const directions: Record<TentFace, Vec2> = {
    0: scaled(f, -1),
    1: f,
    2: scaled(l, -1),
    3: l,
  };
  for (const { cell, face } of LAYOUT.walls)
    lay(cell, { type: "wall", face: faceToward(directions[face]) });
  const lanternKey = tentCellKey(LAYOUT.lantern);
  for (const cell of LAYOUT.ceilings)
    lay(
      cell,
      tentCellKey(cell) === lanternKey
        ? { type: "lantern", lit: state.lanternOn }
        : { type: "ceiling" },
    );
  for (const index of [0, 1] as const)
    for (const local of LAYOUT.mattresses[index])
      lay(local, { type: "mattress", index });
  return cells;
}

/** The block tentCells lays at `cell`, if any; answers owner lookups before any cell is laid. */
export function tentBlockAt(pose: TentPose, cell: Cell): TentBlock | undefined {
  const key = cellKey(cell);
  return tentCells(pose, PITCHED_STATE).find((c) => cellKey(c) === key)?.block;
}

/** The flap whose cell `cell` is, at the pose's yaw; undefined for any other cell. */
export function flapAt(pose: TentPose, cell: Cell): FlapId | undefined {
  const block = tentBlockAt(pose, cell);
  return block?.type === "flap" ? block.id : undefined;
}

/** Every cell of one flap, in tentCells order. */
export function flapCells(pose: TentPose, flap: FlapId): Cell[] {
  return tentCells(pose, PITCHED_STATE)
    .filter((c) => c.block.type === "flap" && c.block.id === flap)
    .map(({ x, y, z }) => ({ x, y, z }));
}

function footprintCells(pose: TentPose, layers: number[]): Cell[] {
  const cells: Cell[] = [];
  for (const x of range(-LAYOUT.clear.halfWidth, LAYOUT.clear.halfWidth))
    for (const depth of range(0, LAYOUT.clear.depth - 1))
      for (const layer of layers)
        cells.push(tentCellAt(pose, { x, depth, layer }));
  return cells;
}

/** Every cell in the layout's clear box, in the order x, depth, layer. */
export function tentClearCells(pose: TentPose): Cell[] {
  return footprintCells(pose, range(0, LAYOUT.clear.layers - 1));
}

/** The ground under each footprint column, in the order of tentClearCells. */
export function tentGroundCells(pose: TentPose): Cell[] {
  return footprintCells(pose, [-1]);
}

export function inTentFootprint(pose: TentPose, cell: Cell): boolean {
  return inTentLocalBox(toLocal(pose, cell), LAYOUT.clearBox);
}

/** The world box of tentClearCells in blocks, from its lowest corner. */
export function tentFootprintBox(pose: TentPose): { min: Vec3; size: Vec3 } {
  const cells = tentClearCells(pose);
  const lo = (k: keyof Vec3) => Math.min(...cells.map((c) => c[k]));
  const hi = (k: keyof Vec3) => Math.max(...cells.map((c) => c[k]));
  return {
    min: { x: lo("x"), y: lo("y"), z: lo("z") },
    size: {
      x: hi("x") - lo("x") + 1,
      y: hi("y") - lo("y") + 1,
      z: hi("z") - lo("z") + 1,
    },
  };
}

/**
 * Whether feet stand in either room, the inner wall and the mattresses
 * included. The outer wall cells are outside: their plates sit on the room
 * side, so only a player outside can stand in one. Sheltered tarp columns
 * count as the front room; ceiling-free edge columns and the roof stay outside.
 */
export function insideTent(pose: TentPose, feet: Vec3): boolean {
  const cell = cellOf(feet);
  const local = toLocal(pose, cell);
  return LAYOUT.rooms.some((room) => inTentLocalBox(local, room));
}

/**
 * The bottom middle of the rear wall's middle cell, the model origin (ADR 0130):
 * that cell always holds a tent_wall, so the entity's box never blocks a block.
 */
export function tentEntityLocation(pose: TentPose): Vec3 {
  const c = tentCellAt(pose, LAYOUT.anchor);
  return { x: c.x + 0.5, y: c.y, z: c.z + 0.5 };
}

/** The wall cells each flap takes; tentCells lays them as flap cells (ADR 0132). */
export const TENT_FLAPS = LAYOUT.flaps;

const FLAP_BY_LOCAL: ReadonlyMap<string, FlapId> = new Map(
  (Object.keys(TENT_FLAPS) as FlapId[]).flatMap((id) =>
    TENT_FLAPS[id].map((c) => [tentCellKey(c), id] as const),
  ),
);

/** The bedroom cells of each mattress, laid last by tentCells whatever the state; x 0 stays free as the walkway from the bedroom flap. */
export const TENT_MATTRESSES = LAYOUT.mattresses;

export interface GroundReading {
  readonly typeId: string;
  readonly liquid: boolean;
}

export interface PitchSurvey {
  /** Type of each tentClearCells(pose) cell in that order; a light block reads "minecraft:air"; undefined when unreadable (unloaded, outside the world). */
  readonly clear: readonly (string | undefined)[];
  /** Each tentGroundCells(pose) cell in that order; undefined when unreadable. */
  readonly ground: readonly (GroundReading | undefined)[];
  /** Whether any tentClearCells(pose) cell is vehicle space (isVehicleSpace from bootstrap). */
  readonly vehicleSpace: boolean;
  /** Whether any tentClearCells(pose) cell is another pitched tent's camp space. */
  readonly campSpace: boolean;
  /** Players, mobs, Low Chairs and other entities with health whose boxes meet tentFootprintBox. */
  readonly occupants: number;
  /** Tents in the registry, all dimensions. */
  readonly tents: number;
}

export type PitchRefusal =
  | "limit"
  | "vehicle"
  | "crowded"
  | "blocked"
  | "ground";

type PitchPlan =
  | { readonly ok: true; readonly clearTopFirst: readonly Cell[] }
  | { readonly ok: false; readonly reason: PitchRefusal };

const isClear = (t: string | undefined): boolean =>
  t !== undefined && (t === AIR || CLEARABLE_DECORATIONS.has(t));

// A slab or another block that is not full still counts as ground: the stable
// API has no Block.isSolid (ADR 0131).
const isGround = (g: GroundReading | undefined): boolean =>
  g !== undefined &&
  g.typeId !== AIR &&
  !g.liquid &&
  !CLEARABLE_DECORATIONS.has(g.typeId);

export function planPitch(pose: TentPose, survey: PitchSurvey): PitchPlan {
  if (survey.tents >= TENT_SPEC.maxTents) return { ok: false, reason: "limit" };
  if (survey.vehicleSpace) return { ok: false, reason: "vehicle" };
  if (survey.occupants > 0) return { ok: false, reason: "crowded" };
  // Another tent's corner columns and the air above its tarp read as air, so
  // the clear rule alone would let two tents overlap there.
  if (survey.campSpace) return { ok: false, reason: "blocked" };
  const cells = tentClearCells(pose);
  if (cells.some((_, i) => !isClear(survey.clear[i])))
    return { ok: false, reason: "blocked" };
  if (tentGroundCells(pose).some((_, i) => !isGround(survey.ground[i])))
    return { ok: false, reason: "ground" };
  const clearTopFirst = cells
    .filter((_, i) => survey.clear[i] !== AIR)
    .sort((a, b) => b.y - a.y);
  return { ok: true, clearTopFirst };
}
