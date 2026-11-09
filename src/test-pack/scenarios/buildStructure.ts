import {
  type Block,
  type Entity,
  EquipmentSlot,
  ItemStack,
  SignSide,
  StructureSaveMode,
  system,
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
import type { Outcome } from "../outcome";

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

    // 2.11.0 declares no numeric maximum. These are candidate axis limits,
    // not a volume limit; each oversized capture remains in loaded lane chunks.
    const maxStartY = Math.max(
      a.dim.heightRange.min,
      a.dim.heightRange.max - 257,
    );
    for (const [name, x, y, z, accepted] of [
      ["max_candidate", 64, 256, 64, true],
      ["oversize_x", 65, 256, 64, false],
      ["oversize_y", 64, 257, 64, false],
      ["oversize_z", 64, 256, 65, false],
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
      ["head", "minecraft:skull"],
      ["item_frame", "minecraft:frame"],
    ] as const) {
      await check(name, async () => {
        reset();
        block(22).setType(type);
        if (name === "item_frame") {
          // A failed command or missing inventory is a fixture failure, never
          // evidence that an empty frame restored its displayed item.
          a.dim.runCommand(
            `replaceitem block ${a.xyz(22, bottom + 1, 22)} slot.container 0 minecraft:diamond 1`,
          );
          const held = block(22)
            .getComponent("minecraft:inventory")
            ?.container?.getItem(0);
          if (held?.typeId !== "minecraft:diamond")
            throw new Error(
              "cannot observe populated frame with stable inventory API",
            );
        }
        const before = block(22).permutation;
        const structure = capture(name);
        clear();
        manager.place(structure, a.dim, from);
        await wait(2);
        const restored = block(22);
        const held = restored
          .getComponent("minecraft:inventory")
          ?.container?.getItem(0);
        record(
          name,
          restored.typeId === type &&
            Object.entries(before.getAllStates()).every(
              ([key, value]) =>
                restored.permutation.getAllStates()[key] === value,
            ) &&
            (name !== "item_frame" || held?.typeId === "minecraft:diamond"),
          `${restored.typeId}:${JSON.stringify(restored.permutation.getAllStates())};item=${held?.typeId}`,
        );
      });
    }

    for (const type of [
      "minecraft:cow",
      "minecraft:armor_stand",
      "minecraft:painting",
    ]) {
      const name = type.slice("minecraft:".length);
      await check(name, async () => {
        reset();
        // A wall provides attachment space for the painting fixture.
        a.dim.runCommand(
          `fill ${a.box(21, bottom + 1, 21, 21, bottom + 4, 26)} stone`,
        );
        const entity = summon(type, 22.5, 23.5);
        const tag = `${prefix}_${name}`;
        entity.addTag(tag);
        entity.setDynamicProperty("yasu_build:probe_value", "round_trip");
        if (name === "armor_stand") {
          const equipment = entity.getComponent("minecraft:equippable");
          if (
            !equipment?.setEquipment(
              EquipmentSlot.Head,
              new ItemStack("minecraft:diamond_helmet"),
            )
          )
            throw new Error("armor fixture could not be equipped");
        }
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
            first[0]
              ?.getComponent("minecraft:equippable")
              ?.getEquipment(EquipmentSlot.Head)?.typeId ===
              "minecraft:diamond_helmet",
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
