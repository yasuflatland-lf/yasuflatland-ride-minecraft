import {
  type Block,
  type Entity,
  ItemStack,
  type PlayerInteractWithBlockAfterEvent,
  SignSide,
  StructureSaveMode,
  system,
  type Vector3,
  world,
} from "@minecraft/server";
import { BUILD_SPEC } from "../../domain/build/spec";
import {
  DECK_SEAT_TYPE,
  ENTITY_TYPE,
  isStandInEntity,
  SEAT_FILLER_TYPE,
} from "../../infrastructure/vehicle/bedrock/identifiers";
import { type Arena, wait } from "../arena";
import type { Outcome, StepSink } from "../outcome";

function errorText(error: unknown): string {
  return error instanceof Error
    ? `${error.name}:${error.message}`
    : String(error);
}

// No real fleet entities are spawned: their spawn hooks can evict a player's
// vehicle before a probe can clean up (0038, 0066).
function excludedType(type: string): boolean {
  return (
    Object.values(ENTITY_TYPE).includes(type) ||
    type === DECK_SEAT_TYPE ||
    type === SEAT_FILLER_TYPE ||
    isStandInEntity(type)
  );
}

export async function buildStructureProbe(a: Arena): Promise<Outcome> {
  const manager = world.structureManager;
  const prefix = `yasu_build:probe_${a.lane.index}_${system.currentTick}`;
  const structures = new Set<string>();
  const spawned = new Set<string>();
  const results: { name: string; pass: boolean; value: string }[] = [];
  const bottom = a.gy;
  const from = a.at(20, bottom, 20);
  const to = a.at(31, bottom + 5, 31);
  const box = a.box(20, bottom, 20, 31, bottom + 5, 31);
  const entities = () =>
    a.dim.getEntities().filter((entity) => {
      const p = entity.location;
      return (
        entity.typeId !== "minecraft:player" &&
        p.x >= from.x &&
        p.x < to.x + 1 &&
        p.y >= from.y &&
        p.y < to.y + 1 &&
        p.z >= from.z &&
        p.z < to.z + 1
      );
    });
  const record = (name: string, pass: boolean, value: unknown = pass) =>
    results.push({ name, pass, value: String(value) });
  const check = async (name: string, run: () => Promise<void> | void) => {
    try {
      await run();
    } catch (error) {
      record(name, false, `error(${errorText(error)})`);
    }
  };
  const capture = (suffix: string, start = from, end = to) => {
    const identifier = `${prefix}_${suffix}`;
    structures.add(identifier);
    return manager.createFromWorld(identifier, a.dim, start, end, {
      saveMode: StructureSaveMode.Memory,
      includeBlocks: true,
      includeEntities: true,
    });
  };
  const removeEntities = () => {
    for (const entity of entities()) entity.remove();
  };
  const clear = () => a.dim.runCommand(`fill ${box} air`);
  const reset = () => {
    removeEntities();
    clear();
    a.dim.runCommand(`fill ${a.box(20, bottom, 20, 31, bottom, 31)} stone`);
  };
  const block = (x: number, z = 22): Block => {
    const value = a.dim.getBlock(a.at(x, bottom + 1, z));
    if (!value) throw new Error(`unloaded fixture at ${x},${z}`);
    return value;
  };
  const summon = (type: string, x: number, z: number): Entity => {
    const before = new Set(entities().map((entity) => entity.id));
    a.dim.runCommand(`summon ${type} ${a.xyz(x, bottom + 1, z)}`);
    const entity = entities().find(
      (e) => e.typeId === type && !before.has(e.id),
    );
    if (!entity) throw new Error(`summon did not produce ${type}`);
    spawned.add(entity.id);
    return entity;
  };

  try {
    await check("copy_limit", () => {
      const size = 32;
      const structure = capture(
        "copy_limit",
        a.at(8, bottom, 8),
        a.at(39, bottom + 31, 39),
      );
      record(
        "copy_limit",
        size ** 3 === BUILD_SPEC.maxCopyVolume &&
          structure.size.x === size &&
          structure.size.y === size &&
          structure.size.z === size,
        `${JSON.stringify(structure.size)};volume=${BUILD_SPEC.maxCopyVolume}`,
      );
    });

    // 2.11.0 declares no numeric maximum. Y is bounded by world height;
    // probing beyond it would test out-of-world bounds, not a structure limit.
    const maxStartY = a.dim.heightRange.min;
    const height = a.dim.heightRange.max - maxStartY;
    for (const [name, x, y, z, accepted] of [
      ["max_candidate", 64, height, 64, true],
      ["oversize_x", 65, height, 64, false],
      ["oversize_z", 64, height, 65, false],
    ] as const) {
      await check(name, () => {
        try {
          const structure = capture(
            name,
            a.at(8, maxStartY, 8),
            a.at(8 + x - 1, maxStartY + y - 1, 8 + z - 1),
          );
          record(
            name,
            accepted &&
              structure.size.x === x &&
              structure.size.y === y &&
              structure.size.z === z,
            `accepted:${JSON.stringify(structure.size)}`,
          );
          manager.delete(structure);
        } catch (error) {
          record(
            name,
            !accepted &&
              error instanceof Error &&
              error.name === "InvalidArgumentError",
            errorText(error),
          );
        }
      });
      await wait(1);
    }

    await check("identifiers", () => {
      const structure = capture("valid_09");
      record("namespace", structure.id === `${prefix}_valid_09`, structure.id);
      for (const [name, identifier] of [
        ["duplicate", structure.id],
        ["no_namespace", `probe_${a.lane.index}_${system.currentTick}`],
        ["invalid_character", `${prefix}_bad space`],
      ]) {
        if (!name || !identifier) throw new Error("missing identifier fixture");
        try {
          const unexpected = manager.createFromWorld(
            identifier,
            a.dim,
            from,
            to,
            {
              saveMode: StructureSaveMode.Memory,
            },
          );
          structures.add(unexpected.id);
          record(name, false, `accepted:${unexpected.id}`);
        } catch (error) {
          record(
            name,
            error instanceof Error && error.name === "InvalidArgumentError",
            errorText(error),
          );
        }
      }
      const first = manager.delete(structure);
      const absent = manager.get(structure.id) === undefined;
      const second = manager.delete(structure.id);
      record(
        "delete",
        first && absent && !second,
        `first:${first},getAbsent:${absent},second:${second}`,
      );
    });

    for (const [name, type, x] of [
      ["chest", "minecraft:chest", 22],
      ["furnace", "minecraft:furnace", 24],
    ] as const) {
      await check(name, async () => {
        reset();
        block(x).setType(type);
        const container = block(x).getComponent(
          "minecraft:inventory",
        )?.container;
        if (!container) throw new Error("fixture has no inventory");
        const item = new ItemStack("minecraft:diamond", 7);
        item.nameTag = "Structure probe";
        container.setItem(0, item);
        const structure = capture(name);
        clear();
        await wait(5);
        record(`${name}_clear_air`, block(x).isAir);
        const drops = entities().filter(
          (entity) => entity.typeId === "minecraft:item",
        ).length;
        record(`${name}_clear_drops`, drops === 0, drops);
        manager.place(structure, a.dim, from, { includeEntities: true });
        await wait(2);
        const restored = block(x)
          .getComponent("minecraft:inventory")
          ?.container?.getItem(0);
        record(
          name,
          block(x).typeId === type &&
            restored?.typeId === item.typeId &&
            restored.amount === 7 &&
            restored.nameTag === item.nameTag,
          `${block(x).typeId}:${restored?.typeId}:${restored?.amount}:${restored?.nameTag}`,
        );
      });
    }

    await check("sign", async () => {
      reset();
      block(22).setType("minecraft:standing_sign");
      const sign = block(22).getComponent("minecraft:sign");
      if (!sign) throw new Error("fixture has no sign component");
      sign.setText("Front probe", SignSide.Front);
      sign.setText("Back probe", SignSide.Back);
      const structure = capture("sign");
      clear();
      manager.place(structure, a.dim, from);
      await wait(2);
      const restored = block(22).getComponent("minecraft:sign");
      record(
        "sign",
        restored?.getText(SignSide.Front) === "Front probe" &&
          restored.getText(SignSide.Back) === "Back probe",
        `${restored?.getText(SignSide.Front)}/${restored?.getText(SignSide.Back)}`,
      );
    });

    for (const [name, type] of [
      ["banner", "minecraft:standing_banner"],
      // Bedrock flattened the skull: setType("minecraft:skull") already
      // yields minecraft:skeleton_skull, so the fixture names the flat ID.
      ["head", "minecraft:skeleton_skull"],
    ] as const) {
      await check(name, async () => {
        reset();
        block(22).setType(type);
        const before = block(22).permutation;
        const structure = capture(name);
        clear();
        manager.place(structure, a.dim, from);
        await wait(2);
        const restored = block(22);
        record(
          name,
          restored.typeId === type &&
            Object.entries(before.getAllStates()).every(
              ([key, value]) =>
                restored.permutation.getAllStates()[key] === value,
            ),
          `${restored.typeId}:${JSON.stringify(restored.permutation.getAllStates())}`,
        );
      });
    }

    for (const type of ["minecraft:cow", "minecraft:armor_stand"]) {
      const name = type.slice("minecraft:".length);
      await check(name, async () => {
        reset();
        const entity = summon(type, 22.5, 23.5);
        const tag = `${prefix}_${name}`;
        entity.addTag(tag);
        entity.setDynamicProperty("yasu_build:probe_value", "round_trip");
        // The minecraft:equippable route did not equip an armor stand on the
        // dev BDS, so the helmet goes through commands.
        if (
          name === "armor_stand" &&
          a.dim.runCommand(
            `replaceitem entity @e[tag=${tag}] slot.armor.head 0 diamond_helmet`,
          ).successCount !== 1
        )
          throw new Error("armor fixture could not be equipped");
        const structure = capture(name);
        entity.remove();
        clear();
        manager.place(structure, a.dim, from, { includeEntities: true });
        const first = entities().filter((e) => e.typeId === type);
        for (const e of first) spawned.add(e.id);
        record(name, first.length === 1, first.length);
        record(
          `${name}_tag`,
          first.length === 1 && first[0]?.hasTag(tag) === true,
        );
        record(
          `${name}_dynamic_property`,
          first.length === 1 &&
            first[0]?.getDynamicProperty("yasu_build:probe_value") ===
              "round_trip",
        );
        if (name === "armor_stand")
          record(
            "armor_equipment",
            first.length === 1 &&
              a.dim.runCommand(
                `testfor @e[tag=${tag},hasitem={item=diamond_helmet,location=slot.armor.head}]`,
              ).successCount === 1,
          );
        manager.place(structure, a.dim, from, { includeEntities: true });
        const second = entities().filter((e) => e.typeId === type);
        for (const e of second) spawned.add(e.id);
        record(
          `${name}_second_place`,
          second.length === 2 && first.every((e) => e.isValid),
          second.length,
        );
        await wait(2);
        record(
          `${name}_settled`,
          entities().filter((e) => e.typeId === type).length === 2,
        );
      });
    }

    await check("vehicle_exclusion", async () => {
      reset();
      const original = summon("minecraft:armor_stand", 23.5, 23.5);
      const animal = summon("minecraft:cow", 27.5, 27.5);
      const structure = capture("exclusion");
      const before = new Set(entities().map((e) => e.id));
      manager.place(structure, a.dim, from, { includeEntities: true });
      // The stand-in exercises the ID-based copy removal without fleet hooks.
      for (const entity of entities()) {
        spawned.add(entity.id);
        if (
          !before.has(entity.id) &&
          (excludedType(entity.typeId) || entity.typeId === original.typeId)
        )
          entity.remove();
      }
      record("exclusion_original", original.isValid && animal.isValid);
      record(
        "exclusion_standin",
        entities().filter((e) => e.typeId === original.typeId).length === 1,
      );
      record(
        "exclusion_animal",
        entities().filter((e) => e.typeId === animal.typeId).length === 2,
      );
      record(
        "exclusion_types",
        Object.values(ENTITY_TYPE).every(excludedType) &&
          excludedType(DECK_SEAT_TYPE) &&
          excludedType(SEAT_FILLER_TYPE),
      );
      await wait(2);
      record(
        "exclusion_settled",
        original.isValid &&
          entities().filter((e) => e.typeId === animal.typeId).length === 2,
      );
    });
  } finally {
    for (const identifier of structures) {
      await check(`cleanup_structure_${identifier}`, () => {
        const structure = manager.get(identifier);
        if (structure) manager.delete(structure);
      });
    }
    await check("cleanup_entities", () => {
      for (const entity of a.dim.getEntities()) {
        if (spawned.has(entity.id) && entity.typeId !== "minecraft:player")
          entity.remove();
      }
      removeEntities();
    });
    await check("cleanup_blocks", () => {
      clear();
    });
  }
  return {
    pass: results.length > 0 && results.every((result) => result.pass),
    detail: results
      .map(
        ({ name, pass, value }) =>
          `${name}=${pass ? "PASS" : "FAIL"}(${value})`,
      )
      .join("; "),
  };
}

export async function buildStructureDecorProbe(
  a: Arena,
  onStep?: StepSink,
): Promise<Outcome> {
  const player = world.getAllPlayers()[0];
  if (!player?.isValid)
    return { pass: false, detail: "a connected player is required" };
  const inventory = player.getComponent("minecraft:inventory")?.container;
  if (!inventory) return { pass: false, detail: "player inventory missing" };
  const savedItems = Array.from({ length: inventory.size }, (_, slot) =>
    inventory.getItem(slot)?.clone(),
  );
  const location = player.location;
  const dimension = player.dimension;
  const rotation = player.getRotation();
  const selectedSlot = player.selectedSlotIndex;
  const bottom = a.gy;
  const from = a.at(20, bottom, 20);
  const to = a.at(31, bottom + 5, 31);
  const box = a.box(20, bottom, 20, 31, bottom + 5, 31);
  const manager = world.structureManager;
  const identifier = `yasu_build:probe_decor_${a.lane.index}_${system.currentTick}`;
  const results: { name: string; pass: boolean; value: string }[] = [];
  const record = (name: string, pass: boolean, value: unknown) =>
    results.push({ name, pass, value: String(value) });
  const inside = (p: Vector3, margin = 0) =>
    p.x >= from.x - margin &&
    p.x < to.x + 1 + margin &&
    p.y >= from.y - margin &&
    p.y < to.y + 1 + margin &&
    p.z >= from.z - margin &&
    p.z < to.z + 1 + margin;
  const entities = (margin = 0) =>
    a.dim
      .getEntities()
      .filter(
        (entity) =>
          entity.typeId !== "minecraft:player" &&
          inside(entity.location, margin),
      );
  const paintings = () =>
    entities().filter((e) => e.typeId === "minecraft:painting");
  const items = () => entities(1).filter((e) => e.typeId === "minecraft:item");
  const drops = () =>
    items().map(
      (entity) =>
        entity.getComponent("minecraft:item")?.itemStack.typeId ?? "unknown",
    );
  const removeItems = () => {
    for (const entity of items()) entity.remove();
  };
  const clear = () => a.dim.runCommand(`fill ${box} air`);
  const removeEntities = () => {
    for (const entity of entities()) entity.remove();
    removeItems();
  };
  const frames = () => {
    const found: Block[] = [];
    for (let x = from.x; x <= to.x; x++)
      for (let y = from.y; y <= to.y; y++)
        for (let z = from.z; z <= to.z; z++) {
          const block = a.dim.getBlock({ x, y, z });
          if (block?.typeId === "minecraft:frame") found.push(block);
        }
    return found;
  };
  const interacted = new Set<string>();
  const listener = (event: PlayerInteractWithBlockAfterEvent) => {
    if (
      event.player.id === player.id &&
      event.block.dimension.id === a.dim.id &&
      event.block.typeId === "minecraft:frame" &&
      inside(event.block.location) &&
      event.beforeItemStack?.typeId === "minecraft:diamond"
    )
      interacted.add(JSON.stringify(event.block.location));
  };
  const setupState = () => {
    const allFrames = frames();
    const frame = allFrames.find((block) =>
      interacted.has(JSON.stringify(block.location)),
    );
    const missing = [
      ...(allFrames.length === 0 ? ["item frame"] : []),
      ...(!frame ? ["diamond interaction with the frame"] : []),
      ...(paintings().length === 0 ? ["painting"] : []),
    ];
    return { frame, missing };
  };
  const cleanup = (name: string, run: () => void) => {
    try {
      run();
    } catch (error) {
      record(name, false, errorText(error));
    }
  };
  let phase = "setup";
  world.afterEvents.playerInteractWithBlock.subscribe(listener);
  try {
    removeEntities();
    clear();
    a.dim.runCommand(`fill ${a.box(20, bottom, 20, 31, bottom, 31)} stone`);
    a.dim.runCommand(
      `fill ${a.box(21, bottom + 1, 21, 21, bottom + 4, 26)} stone`,
    );
    inventory.clearAll();
    // Stable APIs cannot populate a frame or create a painting (ADR 0243).
    for (const type of [
      "minecraft:frame",
      "minecraft:diamond",
      "minecraft:painting",
    ])
      inventory.addItem(new ItemStack(type, 1));
    player.selectedSlotIndex = 0;
    player.teleport(a.at(24.5, bottom + 1, 23.5), {
      dimension: a.dim,
      facingLocation: a.at(21, bottom + 2, 23.5),
    });
    const prompt =
      "Structure decor probe: within 60 seconds, place the item frame on the stone wall, put the diamond into it, and hang the painting on the wall.";
    player.sendMessage(prompt);
    player.onScreenDisplay.setActionBar(prompt);
    let setup = setupState();
    for (let ticks = 0; ticks < 1200 && setup.missing.length > 0; ticks += 10) {
      await wait(10);
      setup = setupState();
      // The player setup window exceeds the runner's 60-second stall watch.
      if ((ticks + 10) % 200 === 0)
        onStep?.({
          name: `setup_wait_${ticks + 10}`,
          pass: true,
          detail: `polled setup after ${ticks + 10} ticks; missing: ${setup.missing.join(", ") || "none"}`,
        });
    }
    const frame = setup.frame;
    if (!frame || setup.missing.length > 0) {
      record(
        "setup",
        false,
        `fixture incomplete; missing: ${setup.missing.join(", ")}`,
      );
    } else {
      record(
        "setup",
        true,
        "player placed frame, interacted with diamond, and hung painting",
      );
      const cell = frame.location;
      const states = frame.permutation.getAllStates();
      player.teleport(a.at(16.5, bottom, 23.5), { dimension: a.dim });
      removeItems();
      const structure = manager.createFromWorld(identifier, a.dim, from, to, {
        saveMode: StructureSaveMode.Memory,
        includeBlocks: true,
        includeEntities: true,
      });
      const originalPaintings = paintings();
      record(
        "painting_setup",
        originalPaintings.length === 1,
        originalPaintings.length,
      );
      for (const painting of originalPaintings) painting.remove();
      removeItems();
      const breakFrame = () =>
        a.dim.runCommand(`setblock ${cell.x} ${cell.y} ${cell.z} air destroy`);
      // A diamond drop must be observable on the original before testing preservation.
      breakFrame();
      await wait(2);
      const originalDrops = drops();
      const observed = originalDrops.includes("minecraft:diamond");
      record(
        "frame_setup_observed",
        observed,
        observed
          ? originalDrops.join(",")
          : `fixture failure: destroy-drop observation produced no diamond; drops=${originalDrops.join(",")}`,
      );
      removeItems();
      clear();
      removeEntities();
      if (observed && originalPaintings.length === 1) {
        phase = "round_trip";
        manager.place(structure, a.dim, from, { includeEntities: true });
        await wait(2);
        const count = paintings().length;
        record("painting", count === 1, count);
        const restored = a.dim.getBlock(cell);
        const restoredStates = restored?.permutation.getAllStates();
        record(
          "item_frame_block",
          restored?.typeId === "minecraft:frame" &&
            restoredStates !== undefined &&
            Object.keys(states).length === Object.keys(restoredStates).length &&
            Object.entries(states).every(
              ([key, value]) => restoredStates[key] === value,
            ),
          `${restored?.typeId};states=${JSON.stringify(restoredStates)}`,
        );
        breakFrame();
        await wait(2);
        const restoredDrops = drops();
        record(
          "item_frame",
          restoredDrops.includes("minecraft:diamond"),
          restoredDrops.join(","),
        );
      }
    }
  } catch (error) {
    record(
      phase,
      false,
      `${phase === "setup" ? "fixture failure: " : ""}${errorText(error)}`,
    );
  } finally {
    cleanup("cleanup_listener", () =>
      world.afterEvents.playerInteractWithBlock.unsubscribe(listener),
    );
    cleanup("cleanup_structure", () => {
      const structure = manager.get(identifier);
      if (structure) manager.delete(structure);
    });
    cleanup("cleanup_entities", removeEntities);
    cleanup("cleanup_blocks", clear);
    cleanup("cleanup_drops", removeItems);
    if (player.isValid) {
      cleanup("restore_inventory", () => {
        savedItems.forEach((item, slot) => {
          inventory.setItem(slot, item);
        });
        player.selectedSlotIndex = selectedSlot;
      });
      cleanup("restore_location", () =>
        player.teleport(location, { dimension, rotation }),
      );
    }
  }
  return {
    pass: results.length > 0 && results.every((result) => result.pass),
    detail: results
      .map(
        ({ name, pass, value }) =>
          `${name}=${pass ? "PASS" : "FAIL"}(${value})`,
      )
      .join("; "),
  };
}
