import { type Entity, system } from "@minecraft/server";
import {
  BULLDOZER_SPEC,
  BULLDOZER_WIDE_BLADE,
} from "../../domain/vehicle/kinds/bulldozer/spec";
import { BUILD_TOOL_TYPE } from "../../infrastructure/build/identifiers";
import { TEST_HELD_ITEM_EVENT } from "../../infrastructure/vehicle/bedrock/identifiers";
import { type Arena, drive, type Outcome, wait } from "../arena";
import {
  doubleTap,
  setRoadPaver,
  setWideBlade,
  withBulldozer,
} from "./bulldozer";
import { ticksUntilForm, vehicleForm } from "./shared";

const PLANKS = "minecraft:oak_planks";
const START_X = 90.5;
const CENTER_Z = 82.5;
const END_X = 112;
// The lowest block row of the overworld.
const WORLD_MIN_Y = -64;
const LANE = { minX: 86, maxX: 116, minZ: 74, maxZ: 90 } as const;
const NORMAL_HALF = BULLDOZER_SPEC.blade.halfWidth;
const HOLE_Z = 82;
const WIDE_HALF = BULLDOZER_WIDE_BLADE.halfWidth;

/** Sends the held item through the same derivation as a real player (ADR 0181). */
function setHeldItem(car: Entity, typeId: string | undefined): void {
  system.sendScriptEvent(
    TEST_HELD_ITEM_EVENT,
    `${car.id},${typeId ?? "clear"}`,
  );
}

function fillBox(
  a: Arena,
  [x0, x1]: readonly [number, number],
  [y0, y1]: readonly [number, number],
  [z0, z1]: readonly [number, number],
  block: string,
): void {
  a.dim.runCommand(`fill ${x0} ${y0} ${z0} ${x1} ${y1} ${z1} ${block}`);
}

function cleanLane(a: Arena): void {
  const x = [LANE.minX, LANE.maxX] as const;
  const z = [LANE.minZ, LANE.maxZ] as const;
  fillBox(a, x, [a.gy, a.gy + 8], z, "air");
  fillBox(a, x, [Math.max(WORLD_MIN_Y, a.gy - 8), a.gy - 1], z, "stone");
}

function typeAt(a: Arena, x: number, y: number, z: number): string | undefined {
  return a.dim.getBlock({ x, y, z })?.typeId;
}

function planksIn(
  a: Arena,
  xs: readonly [number, number],
  y: number,
  zs: readonly [number, number],
): { planks: number; total: number } {
  let planks = 0;
  let total = 0;
  for (let x = xs[0]; x <= xs[1]; x++)
    for (let z = zs[0]; z <= zs[1]; z++) {
      total++;
      if (typeAt(a, x, y, z) === PLANKS) planks++;
    }
  return { planks, total };
}

interface Run {
  readonly wide?: boolean;
  readonly held?: string | undefined;
  readonly until?: number;
  readonly watch?: (car: Entity) => void;
}

/** Drives the lane from its start with the paver on and the given item held. */
async function paveRun(
  a: Arena,
  run: Run,
  after: (car: Entity) => Outcome,
): Promise<Outcome> {
  return withBulldozer(a, START_X, CENTER_Z, -90, async (car) => {
    await wait(2);
    await setWideBlade(car, run.wide ?? false);
    await setRoadPaver(car, true);
    setHeldItem(car, "held" in run ? run.held : PLANKS);
    await wait(2);
    drive(car, 0, 1);
    for (let t = 0; t < 400 && car.location.x < (run.until ?? END_X); t++) {
      await wait(1);
      run.watch?.(car);
    }
    drive(car, 0, 0);
    await wait(5);
    return after(car);
  });
}

async function onLane(
  a: Arena,
  body: () => Promise<Outcome>,
): Promise<Outcome> {
  try {
    cleanLane(a);
    return await body();
  } finally {
    cleanLane(a);
  }
}

function rowOf(a: Arena): number {
  return a.gy - 1;
}

/** The columns the road touches at a heading along x: a cell counts when the strip overlaps any of it (ADR 0136). */
function roadColumns(half: number): readonly [number, number] {
  return [Math.floor(CENTER_Z - half), Math.floor(CENTER_Z + half)];
}

async function paveFlatCase(a: Arena, wide: boolean): Promise<Outcome> {
  return onLane(a, () =>
    paveRun(a, { wide }, () => {
      const row = rowOf(a);
      const [z0, z1] = roadColumns(wide ? WIDE_HALF : NORMAL_HALF);
      const road = planksIn(a, [93, 98], row, [z0, z1]);
      const edges =
        planksIn(a, [93, 98], row, [z0 - 1, z0 - 1]).planks +
        planksIn(a, [93, 98], row, [z1 + 1, z1 + 1]).planks;
      const above = planksIn(a, [93, 98], a.gy, [z0 - 1, z1 + 1]);
      return {
        pass: road.planks === road.total && edges === 0 && above.planks === 0,
        detail: `wide=${wide} z=${z0}..${z1} road=${road.planks}/${road.total} beyondEdges=${edges} above=${above.planks}`,
      };
    }),
  );
}

export function bulldozerPaveFlat(a: Arena): Promise<Outcome> {
  return paveFlatCase(a, false);
}

export function bulldozerPaveWide(a: Arena): Promise<Outcome> {
  return paveFlatCase(a, true);
}

export function bulldozerPaveHole(a: Arena): Promise<Outcome> {
  return onLane(a, () => {
    const row = rowOf(a);
    fillBox(a, [100, 100], [row, row], [HOLE_Z, HOLE_Z], "air");
    return paveRun(a, {}, () => {
      const hole = planksIn(a, [100, 100], row, [HOLE_Z, HOLE_Z]);
      return {
        pass: hole.planks === hole.total,
        detail: `hole=${hole.planks}/${hole.total}`,
      };
    });
  });
}

export function bulldozerPaveStepDown(a: Arena): Promise<Outcome> {
  return onLane(a, () => {
    const row = rowOf(a);
    fillBox(a, [100, LANE.maxX], [row, row], [LANE.minZ, LANE.maxZ], "air");
    return paveRun(a, { until: 114 }, () => {
      const lower = planksIn(a, [106, 108], row - 1, [81, 84]);
      return {
        pass: lower.planks === lower.total,
        detail: `lower=${lower.planks}/${lower.total}`,
      };
    });
  });
}

export function bulldozerPaveCliff(a: Arena): Promise<Outcome> {
  return onLane(a, () => {
    const row = rowOf(a);
    // Inside the paved width (z 80..84), so the roadPick rule for a deep dry drop is what keeps it empty.
    const drop = [84, 85] as const;
    fillBox(a, [92, 110], [row - 2, row], drop, "air");
    return paveRun(a, {}, () => {
      let inCliff = 0;
      for (let y = row - 2; y <= row; y++)
        inCliff += planksIn(a, [92, 110], y, drop).planks;
      const lane = planksIn(a, [93, 110], row, [80, 83]);
      return {
        pass: inCliff === 0 && lane.planks === lane.total,
        detail: `planksInCliff=${inCliff} lane=${lane.planks}/${lane.total}`,
      };
    });
  });
}

export function bulldozerPaveWater(a: Arena): Promise<Outcome> {
  return onLane(a, () => {
    const row = rowOf(a);
    fillBox(a, [96, 104], [row - 2, row], [76, 88], "water");
    fillBox(a, [106, 110], [row - 1, row], [76, 88], "air");
    fillBox(
      a,
      [106, 110],
      [Math.max(WORLD_MIN_Y, row - 3), row - 2],
      [76, 88],
      "water",
    );
    let lowest = Number.POSITIVE_INFINITY;
    let sawOtherForm = false;
    return paveRun(
      a,
      {
        until: 114,
        watch: (car) => {
          lowest = Math.min(lowest, car.location.y);
          sawOtherForm ||= vehicleForm(car) !== "car";
        },
      },
      (car) => {
        const pool = planksIn(a, [98, 102], row, [81, 84]);
        const river = planksIn(a, [107, 109], row, [81, 84]);
        const below = planksIn(a, [107, 109], row - 1, [81, 84]);
        return {
          pass:
            pool.planks === pool.total &&
            river.planks === river.total &&
            below.planks === 0 &&
            !sawOtherForm &&
            lowest >= a.gy - 0.1,
          detail: `x=${car.location.x.toFixed(2)} pool=${pool.planks}/${pool.total} river=${river.planks}/${river.total} below=${below.planks} otherForm=${sawOtherForm} lowest=${lowest.toFixed(2)}`,
        };
      },
    );
  });
}

export function bulldozerPaveFlight(a: Arena): Promise<Outcome> {
  return onLane(a, () => {
    const row = rowOf(a);
    const ravineBottom = Math.max(WORLD_MIN_Y, row - 5);
    const ravine = [98, 114] as const;
    fillBox(a, ravine, [ravineBottom, row], [LANE.minZ, LANE.maxZ], "air");
    return withBulldozer(a, START_X, CENTER_Z, -90, async (car) => {
      await wait(2);
      await doubleTap(car);
      const hoverAt = await ticksUntilForm(
        car,
        "hover",
        BULLDOZER_SPEC.takeoffTicks + 15,
      );
      await setWideBlade(car, true);
      await setRoadPaver(car, true);
      setHeldItem(car, PLANKS);
      await wait(2);
      // Wide blade over the ravine is the worst case for the per-tick probes (ADR 0181).
      let last = Date.now();
      let slowestTickMs = 0;
      const timer = system.runInterval(() => {
        const now = Date.now();
        slowestTickMs = Math.max(slowestTickMs, now - last);
        last = now;
      }, 1);
      drive(car, 0, 1);
      for (let t = 0; t < 400 && car.location.x < 108; t++) await wait(1);
      drive(car, 0, 0);
      system.clearRun(timer);
      await wait(5);
      const { x, y } = car.location;
      let behind = 0;
      let ahead = 0;
      let high = 0;
      for (let h = ravineBottom; h <= a.gy + 12; h++) {
        behind += planksIn(
          a,
          [ravine[0], Math.floor(x) - 1],
          h,
          [78, 87],
        ).planks;
        ahead += planksIn(
          a,
          [Math.floor(x) + 1, ravine[1]],
          h,
          [74, 90],
        ).planks;
        if (h >= Math.floor(y)) high += planksIn(a, ravine, h, [74, 90]).planks;
      }
      return {
        pass:
          hoverAt >= 0 &&
          vehicleForm(car) === "hover" &&
          behind > 0 &&
          ahead === 0 &&
          high === 0,
        detail: `hoverAt=${hoverAt} form=${String(vehicleForm(car))} x=${x.toFixed(2)} y=${y.toFixed(2)} behind=${behind} ahead=${ahead} atOrAboveBody=${high} slowestTickMs=${slowestTickMs}`,
      };
    });
  });
}

export function bulldozerPaveKept(a: Arena): Promise<Outcome> {
  return onLane(a, () => {
    const row = rowOf(a);
    a.dim.runCommand(`setblock 96 ${row} 82 chest`);
    return paveRun(a, {}, () => {
      const type = typeAt(a, 96, row, 82);
      return {
        pass: type === "minecraft:chest",
        detail: `block=${String(type)}`,
      };
    });
  });
}

/** Cells in the lane whose block is not the expected one: stone at the reference row, air above. */
function disturbed(a: Arena, xs: readonly [number, number]): number {
  let n = 0;
  for (let x = xs[0]; x <= xs[1]; x++)
    for (let z = LANE.minZ; z <= LANE.maxZ; z++) {
      if (typeAt(a, x, rowOf(a), z) !== "minecraft:stone") n++;
      for (let y = a.gy; y <= a.gy + 2; y++)
        if (typeAt(a, x, y, z) !== "minecraft:air") n++;
    }
  return n;
}

export async function bulldozerPaveNoBlock(a: Arena): Promise<Outcome> {
  const cases: (string | undefined)[] = [
    undefined,
    "minecraft:wooden_door",
    "minecraft:bed",
    BUILD_TOOL_TYPE,
  ];
  const details: string[] = [];
  let pass = true;
  for (const held of cases) {
    const result = await onLane(a, () =>
      paveRun(a, { held, until: 100 }, () => {
        const changed = disturbed(a, [LANE.minX, 100]);
        return {
          pass: changed === 0,
          detail: `${String(held)} changed=${changed}`,
        };
      }),
    );
    pass &&= result.pass;
    details.push(result.detail);
  }
  return { pass, detail: details.join("; ") };
}
