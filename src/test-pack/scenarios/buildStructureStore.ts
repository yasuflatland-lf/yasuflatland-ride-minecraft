import { ItemStack, SignSide } from "@minecraft/server";
import { cellsOf } from "../../domain/build/box";
import type { StructureHandle } from "../../domain/build/structure/handle";
import { asDimensionId, asPlayerId } from "../../domain/shared/ids";
import { BedrockStructureStore } from "../../infrastructure/build/bedrock/bedrockStructureStore";
import { isFleetEntityType } from "../../infrastructure/vehicle/bedrock/identifiers";
import { type Arena, wait } from "../arena";
import type { Outcome } from "../outcome";

export async function buildStructureStore(a: Arena): Promise<Outcome> {
  // Real fleet spawns can evict owned vehicles before cleanup (ADR 0038, 0066).
  // As in the probe, an armor stand exercises exclusion alongside the real predicate.
  const store = new BedrockStructureStore(
    (type) => isFleetEntityType(type) || type === "minecraft:armor_stand",
  );
  const dim = asDimensionId(a.dim.id);
  const owner = asPlayerId(`store_probe_${a.lane.index}`);
  const box = { min: a.at(20, a.gy, 20), max: a.at(31, a.gy + 5, 31) };
  const results: { name: string; pass: boolean; value: string }[] = [];
  const handles: StructureHandle[] = [];
  const spawned = new Set<string>();
  const record = (name: string, pass: boolean, value: unknown = pass) =>
    results.push({ name, pass, value: String(value) });
  const entities = () =>
    a.dim.getEntities().filter((e) => {
      const p = e.location;
      return (
        e.typeId !== "minecraft:player" &&
        p.x >= box.min.x &&
        p.x < box.max.x + 1 &&
        p.y >= box.min.y &&
        p.y < box.max.y + 1 &&
        p.z >= box.min.z &&
        p.z < box.max.z + 1
      );
    });
  const block = (x: number) => {
    const b = a.dim.getBlock(a.at(x, a.gy + 1, 22));
    if (!b) throw new Error(`unloaded fixture ${x}`);
    return b;
  };
  const summon = (type: string, x: number) => {
    const before = new Set(entities().map((e) => e.id));
    a.dim.runCommand(`summon ${type} ${a.xyz(x, a.gy + 1, 27.5)}`);
    const entity = entities().find(
      (e) => e.typeId === type && !before.has(e.id),
    );
    if (!entity) throw new Error(`missing fixture ${type}`);
    spawned.add(entity.id);
    return entity;
  };
  try {
    if (!store.clearBlocks(dim, box)) throw new Error("fixture clear failed");
    a.dim.runCommand(`fill ${a.box(20, a.gy, 20, 31, a.gy, 31)} stone`);
    block(22).setType("minecraft:chest");
    const chest = block(22).getComponent("minecraft:inventory")?.container;
    if (!chest) throw new Error("chest fixture has no inventory");
    const item = new ItemStack("minecraft:diamond", 7);
    item.nameTag = "Structure store";
    chest.setItem(0, item);
    block(24).setType("minecraft:standing_sign");
    const sign = block(24).getComponent("minecraft:sign");
    if (!sign) throw new Error("missing sign component");
    sign.setText("Store front", SignSide.Front);
    sign.setText("Store back", SignSide.Back);
    block(26).setType("minecraft:frame");
    a.dim.runCommand(
      `replaceitem block ${a.xyz(26, a.gy + 1, 22)} slot.container 0 minecraft:diamond 1`,
    );
    // An unobservable frame fails item_frame_setup and item_frame but lets the
    // other round-trip checks report (ADR 0243 forbids an empty-frame pass).
    record(
      "item_frame_setup",
      block(26).getComponent("minecraft:inventory")?.container?.getItem(0)
        ?.typeId === "minecraft:diamond",
      "populated frame observable with stable inventory API",
    );
    const cow = summon("minecraft:cow", 27.5);
    const excluded = summon("minecraft:armor_stand", 23.5);
    const handle = store.capture(dim, box, owner);
    if (handle === "tooLarge" || handle === "unreadable")
      throw new Error(`capture refused: ${handle}`);
    handles.push(handle);
    store.clearEntities(dim, box);
    record("clear_entities", !cow.isValid && excluded.isValid);
    record("clear_blocks", store.clearBlocks(dim, box));
    await wait(5);
    record(
      "clear_air",
      [...cellsOf(box)].every((cell) => a.dim.getBlock(cell)?.isAir === true),
    );
    const drops = entities().filter(
      (e) => e.typeId === "minecraft:item",
    ).length;
    record("clear_drops", drops === 0, drops);
    // The preserved stand-in falls while the floor is air; return it to the target box.
    excluded.teleport(a.at(23.5, a.gy + 1, 27.5));
    record("place", store.place(handle, dim, box.min));
    for (const entity of entities()) spawned.add(entity.id);
    record("excluded_original", excluded.isValid);
    record(
      "excluded_copies",
      entities().filter((e) => e.typeId === "minecraft:armor_stand").length ===
        1,
    );
    await wait(2);
    const restored = block(22)
      .getComponent("minecraft:inventory")
      ?.container?.getItem(0);
    record(
      "chest",
      restored?.typeId === item.typeId &&
        restored.amount === 7 &&
        restored.nameTag === item.nameTag,
    );
    const restoredSign = block(24).getComponent("minecraft:sign");
    record(
      "sign",
      restoredSign?.getText(SignSide.Front) === "Store front" &&
        restoredSign.getText(SignSide.Back) === "Store back",
    );
    record(
      "item_frame",
      block(26).typeId === "minecraft:frame" &&
        block(26).getComponent("minecraft:inventory")?.container?.getItem(0)
          ?.typeId === "minecraft:diamond",
    );
    record(
      "cow",
      entities().filter((e) => e.typeId === "minecraft:cow").length === 1,
    );
    record(
      "too_large",
      store.capture(
        dim,
        { min: box.min, max: { ...box.max, x: box.min.x + 64 } },
        owner,
      ) === "tooLarge",
    );
  } catch (error) {
    record(
      "round_trip",
      false,
      error instanceof Error ? `${error.name}:${error.message}` : error,
    );
  } finally {
    for (const handle of handles) store.discard(handle);
    try {
      const inside = new Set(entities().map((e) => e.id));
      for (const entity of a.dim.getEntities()) {
        if (
          entity.typeId !== "minecraft:player" &&
          (spawned.has(entity.id) || inside.has(entity.id))
        ) {
          try {
            entity.remove();
          } catch (error) {
            record("cleanup_entity", false, error);
          }
        }
      }
    } catch (error) {
      record("cleanup_entities", false, error);
    }
    record("cleanup_blocks", store.clearBlocks(dim, box));
  }
  return {
    pass: results.every((r) => r.pass),
    detail: results
      .map(
        ({ name, pass, value }) =>
          `${name}=${pass ? "PASS" : "FAIL"}(${value})`,
      )
      .join("; "),
  };
}
