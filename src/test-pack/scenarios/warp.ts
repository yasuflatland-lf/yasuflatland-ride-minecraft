import { type Entity, type Vector3, world } from "@minecraft/server";
import { asDimensionId } from "../../domain/shared/ids";
import { asWarpPointId } from "../../domain/warp/ids";
import { chooseLanding, landingCandidates } from "../../domain/warp/landing";
import { toSnapshot } from "../../domain/warp/snapshot";
import { parseWarpName } from "../../domain/warp/warpName";
import type { WarpPoint } from "../../domain/warp/warpPoint";
import { BedrockWarpWorld } from "../../infrastructure/warp/bedrock/bedrockWarpWorld";
import {
  WARP_BLOCK_TYPE,
  WARP_REGISTRY_COUNT,
  warpRegistryChunkKey,
} from "../../infrastructure/warp/identifiers";
import { DynamicPropertyWarpRegistryStore } from "../../infrastructure/warp/persistence/dynamicPropertyWarpRegistryStore";
import { type Arena, blockLoaded, wait, waitUntil } from "../arena";
import type { Outcome } from "../outcome";

export function checkWarp(ok: boolean, detail: string): asserts ok {
  if (!ok) throw new Error(detail);
}

export function warpPoint(a: Arena): WarpPoint {
  const name = parseWarpName("Warp fixture");
  if (!name) throw new Error("invalid fixture name");
  return {
    id: asWarpPointId("warp-fixture"),
    name,
    owner: "Warp probe",
    dimension: asDimensionId(a.dim.id),
    cell: a.at(24, a.gy, 24),
  };
}

// Properties belong to this test pack, not the production pack (ADR 0010).
// Preserve raw keys, including unreadable data and unpublished chunks.
export async function withWarpRegistry(
  run: (store: DynamicPropertyWarpRegistryStore) => Promise<Outcome>,
): Promise<Outcome> {
  const prefix = WARP_REGISTRY_COUNT.slice(0, -"count".length);
  const keys = () =>
    world.getDynamicPropertyIds().filter((key) => key.startsWith(prefix));
  const original = new Map(
    keys().map((key) => [key, world.getDynamicProperty(key)]),
  );
  try {
    for (const key of keys()) world.setDynamicProperty(key, undefined);
    return await run(new DynamicPropertyWarpRegistryStore());
  } finally {
    for (const key of keys()) world.setDynamicProperty(key, undefined);
    for (const [key, value] of original) world.setDynamicProperty(key, value);
    checkWarp(
      keys().length === original.size &&
        keys().every(
          (key) =>
            JSON.stringify(world.getDynamicProperty(key)) ===
            JSON.stringify(original.get(key)),
        ),
      "registry restoration failed",
    );
  }
}

export async function warpRegistryStore(a: Arena): Promise<Outcome> {
  return withWarpRegistry(async (store) => {
    const small = { points: [warpPoint(a)] };
    const name = parseWarpName("N".repeat(32));
    if (!name) throw new Error("invalid large fixture name");
    const large = {
      points: Array.from({ length: 64 }, (_, i) => ({
        ...warpPoint(a),
        id: asWarpPointId(`warp-round-trip-${i}`),
        name,
        owner: "Registry round trip owner",
        cell: a.at(20 + i, a.gy, 20),
      })),
    };
    const length = JSON.stringify(toSnapshot(large)).length;
    checkWarp(length > 10_000, `fixture must span chunks: ${length}`);
    let previous: { bank: 0 | 1; count: number } | undefined;
    const measurements: string[] = [];
    for (const registry of [small, large, small]) {
      store.save(registry);
      checkWarp(
        JSON.stringify(store.load()) === JSON.stringify(registry),
        "registry round trip differs",
      );
      const published = world.getDynamicProperty(WARP_REGISTRY_COUNT);
      const count = Math.ceil(
        JSON.stringify(toSnapshot(registry)).length / 10_000,
      );
      const bank = previous?.bank === 0 ? 1 : 0;
      checkWarp(published === `${bank}:${count}`, `published=${published}`);
      for (let i = 0; i < count; i++) {
        const chunk = world.getDynamicProperty(warpRegistryChunkKey(bank, i));
        checkWarp(
          typeof chunk === "string" && chunk.length <= 10_000,
          `chunk ${i} invalid`,
        );
      }
      if (previous)
        for (let i = 0; i < previous.count; i++)
          checkWarp(
            world.getDynamicProperty(warpRegistryChunkKey(previous.bank, i)) ===
              undefined,
            `old chunk ${i} remains`,
          );
      measurements.push(String(published));
      previous = { bank, count };
    }
    return {
      pass: true,
      detail: `small/large/small=${measurements.join(",")}; large_utf16=${length}; old banks deleted`,
    };
  });
}

export function sameWarpPosition(a: Vector3, b: Vector3): boolean {
  return (
    Math.abs(a.x - b.x) < 0.01 &&
    Math.abs(a.y - b.y) < 0.01 &&
    Math.abs(a.z - b.z) < 0.01
  );
}

function summon(a: Arena): Entity {
  const location = a.at(22.5, a.gy, 22.5);
  const before = new Set(
    a.dim.getEntities({ type: "minecraft:armor_stand" }).map((e) => e.id),
  );
  a.dim.runCommand(
    `summon minecraft:armor_stand ${location.x} ${location.y} ${location.z}`,
  );
  const entity = a.dim
    .getEntities({ type: "minecraft:armor_stand", location, maxDistance: 2 })
    .find((e) => !before.has(e.id));
  if (!entity) throw new Error("missing summoned armor stand");
  return entity;
}

function farPoint(a: Arena): WarpPoint {
  return {
    ...warpPoint(a),
    cell: { x: 1_000_000 + a.lane.index * 1024, y: a.gy, z: 1_000_000 },
  };
}

export async function warpWorld(a: Arena): Promise<Outcome> {
  const adapter = new BedrockWarpWorld();
  const point = warpPoint(a);
  let entity: Entity | undefined;
  const clear = () =>
    a.dim.runCommand(`fill ${a.box(23, a.gy, 23, 25, a.gy + 3, 25)} air`);
  try {
    clear();
    a.dim.runCommand(`fill ${a.box(23, a.gy - 1, 23, 25, a.gy - 1, 25)} stone`);
    a.dim.getBlock(point.cell)?.setType(WARP_BLOCK_TYPE);
    checkWarp(adapter.presence(point) === "present", "warp block not present");
    const pick = () =>
      chooseLanding(point.cell, (cell) =>
        adapter.isStandable(point.dimension, cell),
      );
    const top = { ...point.cell, y: point.cell.y + 1 };
    checkWarp(
      adapter.isStandable(point.dimension, top) &&
        sameWarpPosition(pick(), top),
      "clear top landing",
    );
    a.dim.getBlock(top)?.setType("minecraft:stone");
    checkWarp(
      sameWarpPosition(pick(), { ...point.cell, x: point.cell.x + 1 }),
      "blocked top must choose east side",
    );
    a.dim.runCommand(`fill ${a.box(23, a.gy, 23, 25, a.gy + 3, 25)} stone`);
    checkWarp(
      landingCandidates(point.cell).every(
        (cell) => !adapter.isStandable(point.dimension, cell),
      ),
      "fallback fixture has a standable cell",
    );
    checkWarp(sameWarpPosition(pick(), top), "fallback must be top");
    checkWarp(adapter.presence(point) === "gone", "stone must be gone");
    checkWarp(
      adapter.presence(farPoint(a)) === "unloaded",
      "far fixture is loaded",
    );
    clear();
    a.dim.getBlock(point.cell)?.setType(WARP_BLOCK_TYPE);
    entity = summon(a);
    entity.setRotation({ x: 0, y: 37 });
    const rotation = entity.getRotation();
    const feet = pick();
    const target = { x: feet.x + 0.5, y: feet.y, z: feet.z + 0.5 };
    // The adapter accepts players only; this headless check measures the engine call.
    entity.teleport(target, { dimension: a.dim });
    checkWarp(
      sameWarpPosition(entity.location, target),
      "entity teleport location",
    );
    checkWarp(
      Math.abs(entity.getRotation().y - rotation.y) < 0.01 &&
        Math.abs(entity.getRotation().x - rotation.x) < 0.01,
      "entity teleport rotation",
    );
    return {
      pass: true,
      detail:
        "presence=present/gone/unloaded; landing=top/east/fallback; entity teleport location and rotation kept",
    };
  } finally {
    if (entity?.isValid) entity.remove();
    clear();
  }
}

export async function warpEngineProbes(a: Arena): Promise<Outcome> {
  const lines: string[] = [];
  let entity: Entity | undefined;
  let entityId: string | undefined;
  const point = farPoint(a);
  const clear = () =>
    a.dim.runCommand(`fill ${a.box(20, a.gy, 20, 26, a.gy + 2, 24)} air`);
  try {
    clear();
    // A stone control distinguishes an immovable warp block from an unpowered piston.
    for (const [label, block] of [
      ["control", "minecraft:stone"],
      ["warp", WARP_BLOCK_TYPE],
    ] as const) {
      clear();
      a.dim.runCommand(
        `setblock ${a.xyz(22, a.gy, 22)} piston ["facing_direction"=5]`,
      );
      a.dim.runCommand(`setblock ${a.xyz(23, a.gy, 22)} ${block}`);
      a.dim.runCommand(`setblock ${a.xyz(21, a.gy, 22)} redstone_block`);
      await wait(20);
      const source = a.dim.getBlock(a.at(23, a.gy, 22))?.typeId;
      const destination = a.dim.getBlock(a.at(24, a.gy, 22))?.typeId;
      if (label === "control")
        checkWarp(
          destination === block,
          `piston control failed: ${source}/${destination}`,
        );
      lines.push(
        `piston_${label}: moved=${destination === block}; source=${source}; destination=${destination}`,
      );
    }
    checkWarp(
      new BedrockWarpWorld().presence(point) === "unloaded",
      "teleport probe destination is already loaded",
    );
    entity = summon(a);
    entityId = entity.id;
    try {
      entity.teleport(
        { x: point.cell.x + 0.5, y: point.cell.y, z: point.cell.z + 0.5 },
        { dimension: a.dim },
      );
      lines.push("unloaded_teleport: succeeded");
    } catch (error) {
      lines.push(`unloaded_teleport: threw ${String(error)}`);
    }
    try {
      lines.push(
        `unloaded_teleport_immediate: valid=${entity.isValid}; location=${JSON.stringify(entity.location)}`,
      );
    } catch (error) {
      lines.push(`unloaded_teleport_immediate: unavailable ${String(error)}`);
    }
    return {
      pass: true,
      detail: "engine observations; copy results to ADR 0249 after a run",
      lines,
    };
  } finally {
    try {
      if (entity?.isValid) entity.remove();
      else if (entityId !== undefined) {
        // An invalid handle may be unloaded, not destroyed. Load only after measuring.
        const area = `warp_probe_cleanup_${a.lane.index}`;
        const { x, y, z } = point.cell;
        let added = false;
        try {
          const result = a.dim.runCommand(
            `tickingarea add circle ${x} ${y} ${z} 1 ${area} true`,
          );
          checkWarp(
            result.successCount > 0,
            "probe cleanup ticking area failed",
          );
          added = true;
          checkWarp(
            await waitUntil(40, () => blockLoaded(a.dim, point.cell)),
            "probe cleanup destination did not load",
          );
          await wait(2);
          const remaining = a.dim
            .getEntities()
            .find((candidate) => candidate.id === entityId);
          if (remaining) remaining.remove();
          lines.push(
            `unloaded_teleport_cleanup: ${remaining ? "removed after loading" : "no surviving entity at loaded destination"}`,
          );
        } finally {
          if (added) a.dim.runCommand(`tickingarea remove ${area}`);
        }
      }
    } finally {
      clear();
    }
  }
}
