import {
  type Entity,
  EntityDamageCause,
  ItemStack,
  system,
  world,
} from "@minecraft/server";
import { normalizeYaw, type Vec3 } from "../../domain/shared/vec";
import { bladeColumns } from "../../domain/vehicle/kinds/bulldozer/blade";
import {
  BLADE_SWITCH_ITEM,
  ROAD_PAVER_SWITCH_ITEM,
  WIDE_BLADE_SWITCH_ITEM,
} from "../../domain/vehicle/kinds/bulldozer/monitor";
import {
  type BladeRule,
  BULLDOZER_SPEC,
  BULLDOZER_WIDE_BLADE,
} from "../../domain/vehicle/kinds/bulldozer/spec";
import { id } from "../../infrastructure/shared/identifiers";
import {
  ENTITY_TYPE,
  entityPropertyId,
  TEST_HELD_ITEM_EVENT,
  TEST_TOOL_EVENT,
} from "../../infrastructure/vehicle/bedrock/identifiers";
import { type Arena, drive, type Outcome, wait, withCar } from "../arena";
import { hitTick, judgeRam, PUSH_WINDOW, type RamSample } from "../ramJudge";
import { summonCow, ticksUntilForm, vehicleForm } from "./shared";

function withBulldozer<T>(
  a: Arena,
  x: number,
  z: number,
  yaw: number,
  run: (car: Entity) => Promise<T>,
): Promise<T> {
  return withCar(a, x, z, yaw, run, ENTITY_TYPE.bulldozer);
}
/** Sets a tool state through the server-only test hook. */
async function sendToolState(
  car: Entity,
  item: string,
  state: string,
): Promise<void> {
  await wait(2); // the main pack builds the aggregate of a freshly summoned bulldozer first
  system.sendScriptEvent(TEST_TOOL_EVENT, `${car.id},${item},${state}`);
}
/** Sets the blade through the server-only test hook and waits until it has finished moving (ADR 0138). */
async function setBlade(car: Entity, raised: boolean): Promise<void> {
  await sendToolState(car, BLADE_SWITCH_ITEM, raised ? "up" : "down");
  await wait(BULLDOZER_SPEC.bladeLiftTicks + 2);
  const lift = car.getProperty(entityPropertyId("blade"));
  const want = raised ? 1 : 0;
  if (lift !== want) throw new Error(`blade=${String(lift)} want ${want}`);
}
/** Sets the wide blade state through the server-only test hook and checks the saved property (ADR 0180). */
async function setWideBlade(car: Entity, wide: boolean): Promise<void> {
  await sendToolState(car, WIDE_BLADE_SWITCH_ITEM, wide ? "wide" : "normal");
  await wait(2);
  const shown = car.getProperty(entityPropertyId("wide_blade"));
  if (shown !== wide)
    throw new Error(`wide_blade=${String(shown)} want ${wide}`);
}
/** Checks the saved paver state after the server-only tool hook (ADR 0181). */
async function setRoadPaver(car: Entity, on: boolean): Promise<void> {
  await sendToolState(car, ROAD_PAVER_SWITCH_ITEM, on ? "on" : "off");
  await wait(2);
  const saved = car.getProperty(entityPropertyId("road_paver"));
  if (saved !== on) throw new Error(`road_paver=${String(saved)} want ${on}`);
}
/** The cells of the box from `min` to `max`, inclusive, that no longer hold stone. */
function missingStone(a: Arena, min: Vec3, max: Vec3): string[] {
  const missing: string[] = [];
  for (let x = min.x; x <= max.x; x++)
    for (let z = min.z; z <= max.z; z++)
      for (let y = min.y; y <= max.y; y++)
        if (a.dim.getBlock({ x, y, z })?.typeId !== "minecraft:stone")
          missing.push(`${x},${y},${z}`);
  return missing;
}
/** The block's type, with moving water as minecraft:flowing_water. */
function cellType(a: Arena, x: number, y: number, z: number) {
  const block = a.dim.getBlock({ x, y, z });
  // BDS 1.26.52.3 reports moving water as minecraft:water with a nonzero liquid_depth.
  return block?.typeId === "minecraft:water" &&
    Number(block.permutation.getState("liquid_depth")) > 0
    ? "minecraft:flowing_water"
    : block?.typeId;
}
function cleanup(a: Arena): void {
  a.dim.runCommand(`fill 96 ${a.gy} 78 112 ${a.gy + 6} 89 air`);
}
async function throughHill(
  car: Entity,
  beforeTick: () => void = () => {},
): Promise<void> {
  drive(car, 0, 1);
  for (let t = 0; t < 200; t++) {
    beforeTick();
    await wait(1);
    if (car.location.x >= 108) break;
  }
  drive(car, 0, 0);
  await wait(3);
}
async function doubleTap(car: Entity): Promise<void> {
  drive(car, 0, 0, true);
  await wait(2);
  drive(car, 0, 0);
  await wait(2);
  drive(car, 0, 0, true);
  await wait(1);
  drive(car, 0, 0);
}
interface ClearHillLayout {
  readonly rule: BladeRule;
  readonly wide: boolean;
  readonly hillMinZ: number;
  readonly centerZ: number;
  readonly clearMinX: number;
  readonly clearMinZ: number;
}
const CLEAR_HILL_LAYOUT: ClearHillLayout = {
  rule: BULLDOZER_SPEC.blade,
  wide: false,
  hillMinZ: 81,
  centerZ: 83,
  clearMinX: 96,
  clearMinZ: 78,
};
const WIDE_CLEAR_HILL_LAYOUT: ClearHillLayout = {
  rule: BULLDOZER_WIDE_BLADE,
  wide: true,
  hillMinZ: 75,
  centerZ: 80,
  clearMinX: 88,
  clearMinZ: 72,
};
export async function bulldozerClearHill(a: Arena): Promise<Outcome> {
  return clearHillScenario(a, CLEAR_HILL_LAYOUT);
}
export async function bulldozerWideClearHill(a: Arena): Promise<Outcome> {
  return clearHillScenario(a, WIDE_CLEAR_HILL_LAYOUT);
}
async function clearHillScenario(
  a: Arena,
  { rule, wide, hillMinZ, centerZ, clearMinX, clearMinZ }: ClearHillLayout,
): Promise<Outcome> {
  const { dim, gy } = a;
  const at = (x: number, y: number, z: number) => dim.getBlock({ x, y, z });
  const dropLines: string[] = [];
  const kept = [
    { x: 100, z: centerZ - 1, type: "minecraft:water" },
    { x: 101, z: centerZ - 1, type: "minecraft:chest" },
    { x: 102, z: centerZ - 1, type: "yasu_ride:deck_floor" },
    { x: 103, z: centerZ - 1, type: "yasu_ride:camper_wall" },
  ];
  let farthest = 0,
    spawns = 0;
  let boxes: ReturnType<typeof bladeColumns> = [];
  const observed = new Set<string>();
  const recordDrop = (entity: Entity) => {
    // Another pack may already have swept this drop.
    if (!entity.isValid) return;
    let typeId: string;
    let p: Entity["location"];
    try {
      typeId = entity.typeId;
      p = entity.location;
    } catch (e) {
      dropLines.push(`dropReadError=${String(e)}`);
      return;
    }
    if (typeId !== "minecraft:item" || observed.has(entity.id)) return;
    if (p.x < 96 || p.x > 112 || p.z < clearMinZ || p.z > 89) return;
    const distance = Math.min(
      ...boxes.map((c) =>
        Math.max(
          c.x - p.x,
          0,
          p.x - c.x - 1,
          c.bottom - p.y,
          p.y - (gy + 5),
          c.z - p.z,
          p.z - c.z - 1,
        ),
      ),
    );
    if (!Number.isFinite(distance)) return;
    observed.add(entity.id);
    farthest = Math.max(farthest, distance);
    spawns++;
    let item: string | undefined;
    try {
      item = entity.getComponent("minecraft:item")?.itemStack.typeId;
    } catch (e) {
      item = `error:${String(e)}`;
    }
    dropLines.push(
      `drop=${item} at=${p.x.toFixed(3)},${p.y.toFixed(3)},${p.z.toFixed(3)} d=${distance.toFixed(3)} boxX=${boxes[0]?.x}`,
    );
  };
  const listener = (ev: { entity: Entity }) => recordDrop(ev.entity);
  // The main pack sweeps a new drop before this pack's spawn callback; capture it while still valid.
  const removing = (ev: { removedEntity: Entity }) =>
    recordDrop(ev.removedEntity);
  try {
    dim.runCommand(`fill ${clearMinX} ${gy} ${clearMinZ} 112 ${gy + 6} 89 air`);
    dim.runCommand(`fill 100 ${gy} ${hillMinZ} 104 ${gy + 4} 85 stone`);
    for (const [i, type] of [
      "barrier",
      "command_block",
      "reinforced_deepslate",
    ].entries())
      at(100 + i, gy + 1, centerZ)?.setType(`minecraft:${type}`);
    for (const [i, type] of ["light_block_15", "bedrock"].entries())
      at(100 + i, gy + 2, centerZ + 1)?.setType(`minecraft:${type}`);
    for (const p of kept) at(p.x, gy + 3, p.z)?.setType(p.type);
    const chest = at(101, gy + 3, centerZ - 1)?.getComponent(
      "minecraft:inventory",
    )?.container;
    if (!chest) throw new Error("chest inventory missing");
    chest.setItem(0, new ItemStack("minecraft:diamond"));
    dim.runCommand(
      `fill 102 ${gy} ${hillMinZ - 1} 102 ${gy + 2} ${hillMinZ - 1} stone`,
    );
    dim.runCommand(
      `setblock 102 ${gy + 1} 86 torch ["torch_facing_direction"="north"]`,
    );
    await wait(2);
    if (at(102, gy + 1, 86)?.typeId !== "minecraft:torch")
      return { pass: false, detail: "torch not placed" };
    world.afterEvents.entitySpawn.subscribe(listener);
    world.beforeEvents.entityRemove.subscribe(removing);
    return await withBulldozer(a, 90.5, centerZ + 0.5, -90, async (car) => {
      await setBlade(car, false);
      if (wide) await setWideBlade(car, true);
      await throughHill(car, () => {
        boxes = bladeColumns(car.location, car.getRotation().y, rule, false);
      });
      const wrong: string[] = [];
      for (let x = 100; x <= 104; x++)
        for (let z = hillMinZ; z <= 85; z++)
          for (let y = gy; y <= gy + 4; y++) {
            const keep =
              y === gy + 3
                ? kept.find((p) => p.x === x && p.z === z)
                : undefined;
            const type = cellType(a, x, y, z);
            if (
              keep
                ? type !== keep.type
                : type !== "minecraft:air" && type !== "minecraft:flowing_water"
            )
              wrong.push(`${x},${y},${z}:${type}`);
          }
      let floor = true;
      for (let x = 100; x <= 104; x++)
        for (let z = hillMinZ; z <= 85; z++)
          floor &&= at(x, gy - 1, z)?.typeId === "minecraft:stone";
      const marker = [0, 1, 2].every(
        (dy) => at(102, gy + dy, hillMinZ - 1)?.typeId === "minecraft:stone",
      );
      const items = dim.getEntities({
        type: "minecraft:item",
        location: { x: 102, y: gy, z: centerZ },
        maxDistance: 8,
      }).length;
      const diamond = chest.getItem(0);
      return {
        pass:
          car.location.x >= 108 &&
          wrong.length === 0 &&
          at(100, gy + 3, centerZ - 1)?.permutation.getState("liquid_depth") ===
            0 &&
          floor &&
          marker &&
          items === 0 &&
          // The scenario measures the drop radius (ADR 0137), so it needs a drop.
          spawns > 0 &&
          diamond?.typeId === "minecraft:diamond" &&
          diamond.amount === 1,
        detail: `x=${car.location.x.toFixed(2)} wrong=${wrong.join(";")} floor=${floor} marker=${marker} items=${items} spawned=${spawns}`,
        lines: [
          `dropRadius=${farthest.toFixed(3)} spawned=${spawns}`,
          ...dropLines,
        ],
      };
    });
  } finally {
    world.afterEvents.entitySpawn.unsubscribe(listener);
    world.beforeEvents.entityRemove.unsubscribe(removing);
    dim.runCommand(
      `fill 96 ${gy} ${clearMinZ} 112 ${gy + 4} 89 air replace flowing_water`,
    );
    at(100, gy + 3, centerZ - 1)?.setType("minecraft:air");
    dim.runCommand(`fill ${clearMinX} ${gy} ${clearMinZ} 112 ${gy + 6} 89 air`);
  }
}
export async function bulldozerOverhang(a: Arena): Promise<Outcome> {
  try {
    cleanup(a);
    a.dim.runCommand(`fill 100 ${a.gy} 81 104 ${a.gy + 1} 85 stone`);
    a.dim.runCommand(`fill 100 ${a.gy + 3} 81 104 ${a.gy + 4} 85 stone`);
    return await withBulldozer(a, 90.5, 83.5, -90, async (car) => {
      await setBlade(car, false);
      await throughHill(car);
      let pass = car.location.x >= 108;
      for (let x = 100; x <= 104; x++)
        for (let z = 81; z <= 85; z++)
          for (const dy of [0, 1, 3, 4])
            pass &&=
              a.dim.getBlock({ x, y: a.gy + dy, z })?.typeId ===
              (dy < 2 ? "minecraft:air" : "minecraft:stone");
      return { pass, detail: `x=${car.location.x.toFixed(2)}` };
    });
  } finally {
    cleanup(a);
  }
}
export async function bulldozerDirtPath(a: Arena): Promise<Outcome> {
  const floor = `${a.gy - 1}`;
  const pathAt = (x: number, z: number) =>
    a.dim.getBlock({ x, y: a.gy - 1, z })?.typeId;
  try {
    cleanup(a);
    // Bedrock names the dirt path grass_path. Its top is 1/16 below a full block, so
    // the tracks stand inside its row.
    a.dim.runCommand(`fill 88 ${floor} 80 110 ${floor} 87 grass_path`);
    return await withBulldozer(a, 90.5, 83.5, -90, async (car) => {
      await setBlade(car, false);
      await throughHill(car);
      const missing: string[] = [];
      for (let x = 92; x <= 106; x++)
        for (let z = 81; z <= 86; z++)
          if (pathAt(x, z) !== "minecraft:grass_path")
            missing.push(`${x},${z}:${pathAt(x, z)}`);
      return {
        pass: car.location.x >= 108 && missing.length === 0,
        detail: `x=${car.location.x.toFixed(2)} y=${car.location.y.toFixed(4)} missing=${missing.join(";")}`,
      };
    });
  } finally {
    a.dim.runCommand(`fill 88 ${floor} 80 110 ${floor} 87 stone`);
    cleanup(a);
  }
}
export async function bulldozerFlightTunnel(a: Arena): Promise<Outcome> {
  try {
    cleanup(a);
    a.dim.runCommand(`fill 100 ${a.gy} 81 101 ${a.gy + 6} 85 stone`);
    return await withBulldozer(a, 90.5, 83.5, -90, async (car) => {
      await setBlade(car, false);
      await doubleTap(car);
      const hoverAt = await ticksUntilForm(
        car,
        "hover",
        BULLDOZER_SPEC.takeoffTicks + 15,
      );
      const y = car.location.y,
        bottom = Math.floor(y + 0.01),
        top = Math.ceil(y + BULLDOZER_SPEC.blade.bodyHeight);
      await throughHill(car);
      let pass = hoverAt >= 0 && car.location.x >= 108;
      const wrong: string[] = [];
      for (let x = 100; x <= 101; x++)
        for (let z = 81; z <= 85; z++)
          for (let h = a.gy; h <= a.gy + 6; h++) {
            const want =
              h >= bottom && h < top ? "minecraft:air" : "minecraft:stone";
            if (a.dim.getBlock({ x, y: h, z })?.typeId !== want) {
              pass = false;
              wrong.push(`${x},${h},${z}`);
            }
          }
      return {
        pass,
        detail: `hoverAt=${hoverAt} y=${y.toFixed(3)} bottom=${bottom} top=${top} wrong=${wrong.join(";")}`,
      };
    });
  } finally {
    cleanup(a);
  }
}
export async function bulldozerStep2Raised(a: Arena): Promise<Outcome> {
  const { dim, gy } = a;
  try {
    cleanup(a);
    // A 2-high step wider than the 4.64-block blade.
    dim.runCommand(`fill 100 ${gy} 79 108 ${gy + 1} 88 stone`);
    return await withBulldozer(a, 90.5, 83.5, -90, async (car) => {
      await setBlade(car, true);
      drive(car, 0, 1);
      let maxY = gy;
      for (let t = 0; t < 120; t++) {
        await wait(1);
        maxY = Math.max(maxY, car.location.y);
        if (car.location.x > 103) break;
      }
      drive(car, 0, 0);
      await wait(3);
      const wrong = missingStone(
        a,
        { x: 100, y: gy, z: 79 },
        { x: 108, y: gy + 1, z: 88 },
      );
      return {
        pass: maxY >= gy + 1.9 && wrong.length === 0,
        detail: `maxY=${(maxY - gy).toFixed(2)} x=${car.location.x.toFixed(2)} wrong=${wrong.join(";")}`,
      };
    });
  } finally {
    cleanup(a);
  }
}
export async function bulldozerRaisedNoCut(a: Arena): Promise<Outcome> {
  const { dim, gy } = a;
  try {
    cleanup(a);
    // The clear-hill block, 5 high, so it cannot be climbed.
    dim.runCommand(`fill 100 ${gy} 81 104 ${gy + 4} 85 stone`);
    return await withBulldozer(a, 90.5, 83.5, -90, async (car) => {
      await setBlade(car, true);
      drive(car, 0, 1);
      await wait(60);
      drive(car, 0, 0);
      await wait(3);
      const wrong = missingStone(
        a,
        { x: 100, y: gy, z: 81 },
        { x: 104, y: gy + 4, z: 85 },
      );
      const items = dim.getEntities({
        type: "minecraft:item",
        location: { x: 102, y: gy, z: 83 },
        maxDistance: 8,
      }).length;
      return {
        pass: wrong.length === 0 && car.location.x < 100 && items === 0,
        detail: `x=${car.location.x.toFixed(2)} wrong=${wrong.join(";")} items=${items}`,
      };
    });
  } finally {
    cleanup(a);
  }
}
export function bulldozerPivot(a: Arena): Promise<Outcome> {
  return withBulldozer(a, 92.5, 75.5, 0, async (car) => {
    const p = car.location,
      yaw = car.getRotation().y;
    drive(car, 1, 0);
    await wait(30);
    const moved = Math.hypot(car.location.x - p.x, car.location.z - p.z),
      turn = Math.abs(normalizeYaw(car.getRotation().y - yaw));
    return {
      pass: moved < 0.2 && turn >= 80 && turn <= 95,
      detail: `moved=${moved.toFixed(3)} turn=${turn}`,
    };
  });
}
export function bulldozerRamCow(a: Arena): Promise<Outcome> {
  return withBulldozer(a, 88.5, 72.5, -90, async (car) => {
    const cow = summonCow(a, 108.5, 72.5);
    if (!cow) return { pass: false, detail: "cow not found" };
    try {
      cow.addEffect("slowness", 600, { amplifier: 255, showParticles: false });
      cow.addEffect("resistance", 600, { amplifier: 2, showParticles: false });
      const health = () =>
        cow.getComponent("minecraft:health")?.currentValue ?? 0;
      const hp = health(),
        x = cow.location.x,
        samples: RamSample[] = [];
      drive(car, 0, 1);
      for (let t = 0; t < 120; t++) {
        await wait(1);
        const valid = cow.isValid;
        samples.push({
          valid,
          hp: valid ? health() : 0,
          x: valid ? cow.location.x : Number.NaN,
        });
        const hit = hitTick(hp, samples);
        if (hit >= 0 && car.isValid) car.remove();
        if (!valid || (hit >= 0 && samples.length > hit + PUSH_WINDOW)) break;
      }
      return judgeRam(hp, x, samples);
    } finally {
      if (cow.isValid) cow.remove();
    }
  });
}
export function bulldozerHopAndTakeoff(a: Arena): Promise<Outcome> {
  return withBulldozer(a, 92.5, 50.5, 0, async (car) => {
    drive(car, 0, 0, true);
    await wait(1);
    drive(car, 0, 0);
    let peak = 0,
      carForm = true;
    for (let t = 0; t < 20; t++) {
      await wait(1);
      peak = Math.max(peak, car.location.y - a.gy);
      carForm &&= vehicleForm(car) === "car";
    }
    const rest = car.location.y - a.gy;
    await doubleTap(car);
    const hoverAt = await ticksUntilForm(
      car,
      "hover",
      BULLDOZER_SPEC.takeoffTicks + 15,
    );
    const rise = car.location.y - a.gy;
    return {
      pass:
        peak >= 1 &&
        peak <= 1.8 &&
        carForm &&
        Math.abs(rest) < 0.1 &&
        hoverAt >= 0 &&
        rise >= 1.5 &&
        rise <= 3.5,
      detail: `peak=${peak.toFixed(3)} car=${carForm} rest=${rest.toFixed(3)} hoverAt=${hoverAt} rise=${rise.toFixed(3)}`,
    };
  });
}
export async function bulldozerDive(a: Arena): Promise<Outcome> {
  const { dim, gy } = a;
  try {
    dim.runCommand(`fill 100 ${gy} 61 118 ${gy + 4} 69 glass`);
    dim.runCommand(`fill 101 ${gy} 62 117 ${gy + 3} 68 water`);
    dim.runCommand(`fill 101 ${gy + 4} 62 117 ${gy + 4} 68 air`);
    return await withBulldozer(a, 109.5, 65.5, -90, async (car) => {
      const enteredAt = await ticksUntilForm(car, "submarine", 40);
      drive(car, 0, 0, true);
      const hoverAt = await ticksUntilForm(car, "hover", 80);
      return {
        pass: enteredAt >= 0 && hoverAt >= 0,
        detail: `enteredAt=${enteredAt} hoverAt=${hoverAt}`,
      };
    });
  } finally {
    dim.runCommand(`fill 100 ${gy} 61 118 ${gy + 4} 69 air`);
  }
}

/**
 * A lowered submarine bulldozer tunnels through a stone and bedrock wall in a
 * 4-deep water box; the water, a water cell in the wall, and a chest stay
 * (ADR 0155). The detail records what the cut cells hold afterwards.
 */
export async function bulldozerSeaCut(a: Arena): Promise<Outcome> {
  const { dim, gy } = a;
  const at = (x: number, y: number, z: number) => dim.getBlock({ x, y, z });
  // The body coasts about 7 blocks after the throttle is released, so the wall
  // stands far enough from the box's glass end at x = 118 that the blade stops
  // short of it.
  const wallX = [96, 97];
  // The 4.64-block blade strip around z = 65.5. Its edge rows, z 63 and 67,
  // lie outside the 2.4-block collision box, so a kept block there does not
  // stop the body.
  const strip = { minZ: 63, maxZ: 67 };
  const bedrock = [
    { x: 96, dy: 1, z: 65 },
    { x: 97, dy: 2, z: 65 },
  ];
  const isCell =
    (x: number, y: number, z: number) =>
    (p: { x: number; dy: number; z: number }) =>
      p.x === x && gy + p.dy === y && p.z === z;
  const kept = [
    { x: 96, dy: 1, z: 63, type: "minecraft:chest" },
    { x: 97, dy: 1, z: 67, type: "minecraft:water" },
  ];
  try {
    dim.runCommand(`fill 84 ${gy} 61 118 ${gy + 4} 69 glass`);
    dim.runCommand(`fill 85 ${gy} 62 117 ${gy + 3} 68 water`);
    dim.runCommand(`fill 85 ${gy + 4} 62 117 ${gy + 4} 68 air`);
    dim.runCommand(`fill 96 ${gy} 62 97 ${gy + 3} 68 stone`);
    for (const p of bedrock)
      at(p.x, gy + p.dy, p.z)?.setType("minecraft:bedrock");
    for (const p of kept) at(p.x, gy + p.dy, p.z)?.setType(p.type);
    const chest = at(96, gy + 1, 63)?.getComponent(
      "minecraft:inventory",
    )?.container;
    if (!chest) throw new Error("chest inventory missing");
    chest.setItem(0, new ItemStack("minecraft:diamond"));
    return await withBulldozer(a, 87.5, 65.5, -90, async (car) => {
      await setBlade(car, false);
      const enteredAt = await ticksUntilForm(car, "submarine", 40);
      // Sink onto the bed so the tunnel reaches the wall's bottom row.
      drive(car, 0, -1);
      await wait(20);
      drive(car, 0, 1);
      let minY = Number.POSITIVE_INFINITY,
        maxY = Number.NEGATIVE_INFINITY;
      const forms: string[] = [];
      for (let t = 0; t < 120 && car.location.x < 100; t++) {
        await wait(1);
        // A conservative start: the strip, 1.0 to 2.9 ahead, first touches the
        // wall's west face at x = 96 once the body passes about x = 93.1.
        if (car.location.x < 92) continue;
        minY = Math.min(minY, car.location.y);
        maxY = Math.max(maxY, car.location.y);
        const form = String(vehicleForm(car));
        if (forms.at(-1) !== form) forms.push(form);
      }
      drive(car, 0, 0);
      // Water spreads one block per 5 ticks; give it time to reach the cut cells.
      await wait(20);
      const { bodyHeight } = BULLDOZER_SPEC.blade;
      // Rows cut wherever the body was while it crossed the wall, and rows
      // no position could reach. Resting on the bed, the cut starts at
      // ceil(y - 0.01), never below floor(y + 0.01) (ADR 0155).
      const surely = (y: number) =>
        y >= Math.ceil(maxY - 0.01) && y < Math.ceil(minY + bodyHeight);
      const never = (y: number) =>
        y < Math.floor(minY + 0.01) || y >= Math.ceil(maxY + bodyHeight);
      const wrong: string[] = [];
      const cut: Record<string, number> = {};
      for (const x of wallX)
        for (let z = 62; z <= 68; z++)
          for (let y = gy; y <= gy + 3; y++) {
            const type = cellType(a, x, y, z);
            const keep = kept.find(isCell(x, y, z));
            const inStrip = z >= strip.minZ && z <= strip.maxZ;
            const original = bedrock.some(isCell(x, y, z))
              ? "minecraft:bedrock"
              : "minecraft:stone";
            if (keep) {
              if (type !== keep.type) wrong.push(`${x},${y},${z}:${type}`);
            } else if (inStrip && surely(y)) {
              const key = String(type);
              cut[key] = (cut[key] ?? 0) + 1;
              if (
                type !== "minecraft:air" &&
                type !== "minecraft:water" &&
                type !== "minecraft:flowing_water"
              )
                wrong.push(`${x},${y},${z}:${type}`);
            } else if ((!inStrip || never(y)) && type !== original)
              wrong.push(`${x},${y},${z}:${type}`);
          }
      const dried: string[] = [];
      for (let x = 85; x <= 117; x++)
        for (let z = 62; z <= 68; z++)
          for (let y = gy; y <= gy + 3; y++)
            if (
              !wallX.includes(x) &&
              cellType(a, x, y, z) !== "minecraft:water"
            )
              dried.push(`${x},${y},${z}`);
      // A blade that reached the glass end would let the water out.
      for (let z = strip.minZ; z <= strip.maxZ; z++)
        for (let y = gy; y <= gy + 3; y++)
          if (at(118, y, z)?.typeId !== "minecraft:glass")
            dried.push(`118,${y},${z}`);
      const diamond = chest.getItem(0);
      const cutCells = Object.entries(cut)
        .map(([type, n]) => `${type.replace("minecraft:", "")}:${n}`)
        .join(",");
      return {
        pass:
          enteredAt >= 0 &&
          forms.join(">") === "submarine" &&
          car.location.x >= 100 &&
          Object.keys(cut).length > 0 &&
          wrong.length === 0 &&
          dried.length === 0 &&
          diamond?.typeId === "minecraft:diamond" &&
          diamond.amount === 1,
        detail: `enteredAt=${enteredAt} forms=${forms.join(">")} x=${car.location.x.toFixed(2)} y=${(minY - gy).toFixed(3)}..${(maxY - gy).toFixed(3)} cutCells=${cutCells} wrong=${wrong.join(";")} dried=${dried.join(";")}`,
      };
    });
  } finally {
    dim.runCommand(`fill 84 ${gy} 61 118 ${gy + 4} 69 air`);
  }
}

/**
 * A lowered bulldozer that takes off and climbs with Jump from a pocket under
 * a stone roof digs a shaft over its footprint plus BULLDOZER_SPEC.shaft.margin
 * on each side, from its top up through the roof (ADR 0155).
 */
export async function bulldozerRiseShaft(a: Arena): Promise<Outcome> {
  const { dim, gy } = a;
  const cx = 110.5,
    cz = 42.5,
    roofTop = gy + 6;
  const clear = () => dim.runCommand(`fill 104 ${gy} 36 116 ${roofTop} 48 air`);
  try {
    dim.runCommand(`fill 104 ${gy} 36 116 ${roofTop} 48 stone`);
    // The pocket fits the 2.4-block collision box and the 2.9-block body.
    dim.runCommand(`fill 108 ${gy} 40 112 ${gy + 2} 44 air`);
    return await withBulldozer(a, cx, cz, 0, async (car) => {
      await setBlade(car, false);
      await doubleTap(car);
      const hoverAt = await ticksUntilForm(
        car,
        "hover",
        BULLDOZER_SPEC.takeoffTicks + 15,
      );
      // Climb until the body's top is above the roof.
      const clearY = roofTop + 1 - BULLDOZER_SPEC.carHeight;
      drive(car, 0, 0, true);
      for (let t = 0; t < 60 && car.location.y < clearY + 0.1; t++)
        await wait(1);
      drive(car, 0, 0);
      await wait(3);
      const rise = car.location.y - gy;
      const half = BULLDOZER_SPEC.footprint / 2 + BULLDOZER_SPEC.shaft.margin;
      const inShaft = (c: number, center: number) =>
        c + 1 > center - half && c < center + half;
      const shaftBottom = Math.floor(gy + BULLDOZER_SPEC.carHeight);
      const wrong: string[] = [];
      for (let x = 104; x <= 116; x++)
        for (let z = 36; z <= 48; z++)
          for (let y = gy; y <= roofTop; y++) {
            const pocket =
              x >= 108 && x <= 112 && z >= 40 && z <= 44 && y <= gy + 2;
            const shaft = inShaft(x, cx) && inShaft(z, cz) && y >= shaftBottom;
            const want = pocket || shaft ? "minecraft:air" : "minecraft:stone";
            const type = dim.getBlock({ x, y, z })?.typeId;
            if (type !== want) wrong.push(`${x},${y},${z}:${type}`);
          }
      return {
        pass: hoverAt >= 0 && car.location.y >= clearY && wrong.length === 0,
        detail: `hoverAt=${hoverAt} rise=${rise.toFixed(3)} wrong=${wrong.join(";")}`,
      };
    });
  } finally {
    clear();
  }
}

export async function bulldozerSpawnsRaised(a: Arena): Promise<Outcome> {
  const { dim, gy } = a;
  try {
    cleanup(a);
    dim.runCommand(`fill 100 ${gy} 81 104 ${gy} 85 stone`);
    return await withBulldozer(a, 90.5, 83.5, -90, async (car) => {
      await wait(2);
      const blade = car.getProperty(entityPropertyId("blade"));
      await throughHill(car);
      const removed = missingStone(
        a,
        { x: 100, y: gy, z: 81 },
        { x: 104, y: gy, z: 85 },
      ).length;
      return {
        pass: blade === 1 && car.location.x >= 108 && removed === 0,
        detail: `blade=${String(blade)} x=${car.location.x.toFixed(2)} removed=${removed}`,
      };
    });
  } finally {
    cleanup(a);
  }
}

/** The cab monitor shows the held blade switch's state and blanks for any other item or none (ADR 0139). */
export async function bulldozerMonitor(a: Arena): Promise<Outcome> {
  return withBulldozer(a, 20.5, 20.5, 0, async (car) => {
    const screen = (): number =>
      Number(car.getProperty(entityPropertyId("monitor")));
    const hold = (item: string): void =>
      system.sendScriptEvent(
        TEST_HELD_ITEM_EVENT,
        `${car.id},${item === "clear" ? item : id(item)}`,
      );
    const holdAndRead = async (item: string): Promise<number> => {
      hold(item);
      await wait(2);
      return screen();
    };
    await wait(2);
    const up = await holdAndRead(BLADE_SWITCH_ITEM);
    await setBlade(car, false);
    const down = screen();
    const norm = await holdAndRead(WIDE_BLADE_SWITCH_ITEM);
    await setWideBlade(car, true);
    const wide = screen();
    const off = await holdAndRead(ROAD_PAVER_SWITCH_ITEM);
    await setRoadPaver(car, true);
    const on = screen();
    const other = await holdAndRead("stone");
    hold(BLADE_SWITCH_ITEM);
    const cleared = await holdAndRead("clear");
    return {
      pass:
        up === 2 &&
        down === 1 &&
        norm === 3 &&
        wide === 4 &&
        off === 5 &&
        on === 6 &&
        other === 0 &&
        cleared === 0,
      detail: `up=${up} down=${down} norm=${norm} wide=${wide} off=${off} on=${on} other=${other} cleared=${cleared}`,
    };
  });
}

/** The wide blade switch toggles the saved wide_blade property, independent of the blade height (ADR 0180). */
export async function bulldozerWideBladeToggle(a: Arena): Promise<Outcome> {
  return withBulldozer(a, 20.5, 20.5, 0, async (car) => {
    const wideNow = () => car.getProperty(entityPropertyId("wide_blade"));
    await wait(2);
    const spawn = wideNow();
    await setWideBlade(car, true);
    const wide = wideNow();
    await setBlade(car, false);
    const lowered = wideNow();
    await setBlade(car, true);
    const raised = wideNow();
    await setWideBlade(car, false);
    const normal = wideNow();
    return {
      pass:
        spawn === false &&
        wide === true &&
        lowered === true &&
        raised === true &&
        normal === false,
      detail: `spawn=${String(spawn)} wide=${String(wide)} lowered=${String(lowered)} raised=${String(raised)} normal=${String(normal)}`,
    };
  });
}

/** A bulldozer dropped from 40 blocks takes no damage, like the other vehicles (ADR 0006). */
export async function bulldozerFallSurvives(a: Arena): Promise<Outcome> {
  const { gy } = a;
  return withBulldozer(a, 20.5, 20.5, 0, async (car) => {
    await wait(2);
    car.teleport({ x: 20.5, y: gy + 40, z: 20.5 });
    let ticks = 0;
    // isOnGround still reads true for a few ticks after the teleport, so wait on the height
    while (ticks < 200 && car.isValid && car.location.y > gy + 0.5) {
      await wait(1);
      ticks++;
    }
    await wait(5);
    if (!car.isValid)
      return { pass: false, detail: `gone after ${ticks} ticks` };
    const health = car.getComponent("minecraft:health")?.currentValue;
    // The damage sensor also has to refuse a lethal fall hit at rest
    const hurt = car.applyDamage(100, { cause: EntityDamageCause.fall });
    return {
      pass: health === 20 && !hurt && car.isValid,
      detail: `ticks=${ticks} y=${car.location.y.toFixed(2)} health=${health} hurt=${hurt}`,
    };
  });
}

export async function bulldozerWideRam(a: Arena): Promise<Outcome> {
  const results: Outcome[] = [];
  for (const wide of [true, false]) {
    results.push(
      await withBulldozer(a, 88.5, 72.5, -90, async (car) => {
        await setWideBlade(car, wide);
        const cow = summonCow(a, 108.5, 76);
        if (!cow) return { pass: false, detail: "cow not found" };
        try {
          cow.addEffect("slowness", 600, {
            amplifier: 255,
            showParticles: false,
          });
          cow.addEffect("resistance", 600, {
            amplifier: 2,
            showParticles: false,
          });
          const health = () =>
            cow.getComponent("minecraft:health")?.currentValue ?? 0;
          const hp = health();
          let hit = false;
          drive(car, 0, 1);
          for (let t = 0; t < 100; t++) {
            await wait(1);
            if (!cow.isValid)
              return { pass: false, detail: `wide=${wide}: cow vanished` };
            hit ||= health() < hp;
            if (hit || car.location.x >= 112) break;
          }
          return {
            pass: hit === wide && (wide || car.location.x >= 112),
            detail: `wide=${wide} hit=${hit} hp=${hp}->${health()} x=${car.location.x.toFixed(2)}`,
          };
        } finally {
          if (cow.isValid) cow.remove();
        }
      }),
    );
  }
  return {
    pass: results.every((r) => r.pass),
    detail: results.map((r) => r.detail).join("; "),
  };
}

/** Paver state persists independently of both blade switches (ADR 0181). */
export async function bulldozerRoadPaverToggle(a: Arena): Promise<Outcome> {
  return withBulldozer(a, 20.5, 20.5, 0, async (car) => {
    const paverNow = () => car.getProperty(entityPropertyId("road_paver"));
    await wait(2);
    const spawn = paverNow();
    await setRoadPaver(car, true);
    const on = paverNow();
    await setBlade(car, false);
    const lowered = paverNow();
    await setWideBlade(car, true);
    const wide = paverNow();
    await setRoadPaver(car, false);
    const off = paverNow();
    const blade = car.getProperty(entityPropertyId("blade"));
    const wideBlade = car.getProperty(entityPropertyId("wide_blade"));
    await setBlade(car, true);
    await setWideBlade(car, false);
    const reset = paverNow();
    return {
      pass:
        spawn === false &&
        on === true &&
        lowered === true &&
        wide === true &&
        off === false &&
        blade === 0 &&
        wideBlade === true &&
        reset === false,
      detail: `spawn=${String(spawn)} on=${String(on)} lowered=${String(lowered)} wide=${String(wide)} off=${String(off)} blade=${String(blade)} wideBlade=${String(wideBlade)} reset=${String(reset)}`,
    };
  });
}
