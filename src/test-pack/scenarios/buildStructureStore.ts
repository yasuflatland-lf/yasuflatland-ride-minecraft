import {
  type Block,
  ItemStack,
  type PlayerInteractWithBlockAfterEvent,
  SignSide,
  system,
  type Vector3,
  world,
} from "@minecraft/server";
import { cellsOf } from "../../domain/build/box";
import type { StructureHandle } from "../../domain/build/structure/handle";
import { TABLE_TOP_PX } from "../../domain/camp/spec";
import { encodeHost } from "../../domain/shared/hosted";
import { asDimensionId, asPlayerId } from "../../domain/shared/ids";
import { BedrockStructureStore } from "../../infrastructure/build/bedrock/bedrockStructureStore";
import { excludedEntityType } from "../../infrastructure/build/excludedEntityType";
import {
  CAMP_TABLE_TYPE,
  DUTCH_OVEN_HOST_PROPERTY,
  DUTCH_OVEN_TYPE,
  TEST_DUTCH_OVEN_ON_TABLE_EVENT,
} from "../../infrastructure/camp/identifiers";
import { isFleetEntityType } from "../../infrastructure/vehicle/bedrock/identifiers";
import { WARP_BLOCK_TYPE } from "../../infrastructure/warp/identifiers";
import { type Arena, wait } from "../arena";
import {
  SETUP_LIMIT_TICKS,
  SETUP_POLL_TICKS,
  SETUP_REPORT_TICKS,
  setupProgressStep,
  setupPromptStep,
  setupTimeoutDetail,
} from "../decorSetup";
import type { Outcome, StepSink } from "../outcome";

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
    const cow = summon("minecraft:cow", 27.5);
    const excluded = summon("minecraft:armor_stand", 23.5);
    const handle = store.capture(dim, box, owner, "exact");
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
      "cow",
      entities().filter((e) => e.typeId === "minecraft:cow").length === 1,
    );
    record(
      "too_large",
      store.capture(
        dim,
        { min: box.min, max: { ...box.max, x: box.min.x + 64 } },
        owner,
        "exact",
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

function errorText(error: unknown): string {
  return error instanceof Error
    ? `${error.name}:${error.message}`
    : String(error);
}

export async function buildStructureStoreDecor(
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
  const box = { min: from, max: to };
  const store = new BedrockStructureStore(
    (type) => isFleetEntityType(type) || type === "minecraft:armor_stand",
  );
  const dim = asDimensionId(a.dim.id);
  const owner = asPlayerId(`store_decor_${a.lane.index}`);
  const handles: StructureHandle[] = [];
  const results: { name: string; pass: boolean; value: string }[] = [];
  const record = (name: string, pass: boolean, value: unknown = pass) =>
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
  const clear = () => {
    if (!store.clearBlocks(dim, box)) throw new Error("fixture clear failed");
  };
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
      "Structure store decor check: within 60 seconds, place the item frame on the stone wall, put the diamond into it, and hang the painting on the wall.";
    player.sendMessage(prompt);
    player.onScreenDisplay.setActionBar(prompt);
    onStep?.(setupPromptStep());
    let elapsed = 0;
    let setup = setupState();
    for (
      ;
      elapsed < SETUP_LIMIT_TICKS && setup.missing.length > 0;
      elapsed += SETUP_POLL_TICKS
    ) {
      await wait(SETUP_POLL_TICKS);
      setup = setupState();
      // The player setup window exceeds the runner's 60-second stall watch.
      if ((elapsed + SETUP_POLL_TICKS) % SETUP_REPORT_TICKS === 0)
        onStep?.(setupProgressStep(elapsed + SETUP_POLL_TICKS, setup.missing));
    }
    const frame = setup.frame;
    if (!frame || setup.missing.length > 0) {
      record("setup", false, setupTimeoutDetail(elapsed, setup.missing));
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
      const handle = store.capture(dim, box, owner, "exact");
      if (handle === "tooLarge" || handle === "unreadable") {
        record("capture", false, handle);
      } else {
        handles.push(handle);
        const originalPaintings = paintings();
        record(
          "painting_setup",
          originalPaintings.length === 1,
          originalPaintings.length,
        );
        const breakFrame = () =>
          a.dim.runCommand(
            `setblock ${cell.x} ${cell.y} ${cell.z} air destroy`,
          );
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
        if (observed && originalPaintings.length === 1) {
          phase = "round_trip";
          store.clearEntities(dim, box);
          record("clear_entities", paintings().length === 0);
          record("clear_blocks", store.clearBlocks(dim, box));
          await wait(5);
          const itemCount = entities().filter(
            (e) => e.typeId === "minecraft:item",
          ).length;
          record("clear_drops", itemCount === 0, itemCount);
          record("place", store.place(handle, dim, box.min));
          await wait(2);
          const count = paintings().length;
          record("painting", count === 1, count);
          const restored = a.dim.getBlock(cell);
          const restoredStates = restored?.permutation.getAllStates();
          record(
            "item_frame_block",
            restored?.typeId === "minecraft:frame" &&
              restoredStates !== undefined &&
              Object.keys(states).length ===
                Object.keys(restoredStates).length &&
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
    for (const handle of handles)
      cleanup("cleanup_structure", () => store.discard(handle));
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

export async function buildStructureStoreHosted(a: Arena): Promise<Outcome> {
  const store = new BedrockStructureStore(
    excludedEntityType(isFleetEntityType),
  );
  const dim = asDimensionId(a.dim.id);
  const source = { min: a.at(20, a.gy, 20), max: a.at(25, a.gy + 4, 25) };
  const destination = { min: a.at(30, a.gy, 20), max: a.at(35, a.gy + 4, 25) };
  const handles: StructureHandle[] = [];
  const entities = (box: typeof source) =>
    a.dim.getEntities().filter((entity) => {
      const p = entity.location;
      return (
        p.x >= box.min.x &&
        p.x < box.max.x + 1 &&
        p.y >= box.min.y &&
        p.y < box.max.y + 1 &&
        p.z >= box.min.z &&
        p.z < box.max.z + 1
      );
    });
  const results: string[] = [];
  const check = (name: string, pass: boolean) => {
    if (!pass) throw new Error(name);
    results.push(name);
  };
  try {
    check(
      "fixture_clear",
      store.clearBlocks(dim, source) && store.clearBlocks(dim, destination),
    );
    a.dim.runCommand(`fill ${a.box(20, a.gy, 20, 25, a.gy, 25)} stone`);
    const before = new Set(entities(source).map((e) => e.id));
    a.dim.runCommand(
      `summon ${CAMP_TABLE_TYPE} ${a.xyz(22.5, a.gy + 1, 22.5)}`,
    );
    const table = entities(source).find(
      (e) => e.typeId === CAMP_TABLE_TYPE && !before.has(e.id),
    );
    if (!table) throw new Error("missing camp table fixture");
    system.sendScriptEvent(TEST_DUTCH_OVEN_ON_TABLE_EVENT, `${table.id} 0 0`);
    await wait(2);
    const oven = entities(source).find(
      (e) => e.typeId === DUTCH_OVEN_TYPE && !before.has(e.id),
    );
    if (!oven) throw new Error("missing hosted oven fixture");
    check(
      "on_table",
      Math.abs(oven.location.y - table.location.y - TABLE_TOP_PX / 16) < 0.05,
    );
    const marker = encodeHost({
      kind: "top",
      hostType: "camp_table",
      id: table.id,
      at: { x: 0, z: 0 },
    });
    // Dynamic properties are pack-scoped: mirror the production host marker
    // to test preservation without claiming access to the Behavior Pack's value.
    oven.setDynamicProperty(DUTCH_OVEN_HOST_PROPERTY, marker);
    const handle = store.capture(
      dim,
      source,
      asPlayerId(`hosted_store_${a.lane.index}`),
      "exact",
    );
    if (handle === "tooLarge" || handle === "unreadable")
      throw new Error(`capture: ${handle}`);
    handles.push(handle);
    store.clearEntities(dim, source);
    check("originals_survive", table.isValid && oven.isValid);
    check(
      "host_unchanged",
      oven.getDynamicProperty(DUTCH_OVEN_HOST_PROPERTY) === marker,
    );
    check("place", store.place(handle, dim, destination.min));
    const noCopies = () =>
      entities(destination).every(
        (e) => e.typeId !== CAMP_TABLE_TYPE && e.typeId !== DUTCH_OVEN_TYPE,
      );
    check("no_copies_immediate", noCopies());
    await wait(2);
    check("no_copies_after_ticks", noCopies());
    check(
      "originals_still_linked",
      table.isValid &&
        oven.isValid &&
        oven.getDynamicProperty(DUTCH_OVEN_HOST_PROPERTY) === marker,
    );
    return { pass: true, detail: results.join(", ") };
  } catch (error) {
    return { pass: false, detail: `${results.join(", ")}; ${String(error)}` };
  } finally {
    for (const handle of handles) store.discard(handle);
    for (const box of [source, destination]) {
      for (const entity of entities(box))
        if (entity.typeId !== "minecraft:player") entity.remove();
      store.clearBlocks(dim, box);
    }
  }
}

// A Warp Block set without a player holds no registration, like one a paste
// would create, so a copy capture must leave it out (docs/specs/warp.md).
export async function buildStructureStoreUncopyable(
  a: Arena,
): Promise<Outcome> {
  const store = new BedrockStructureStore(() => false, [WARP_BLOCK_TYPE]);
  const dim = asDimensionId(a.dim.id);
  const owner = asPlayerId(`store_uncopyable_${a.lane.index}`);
  const row = (z: number) => ({
    min: a.at(20, a.gy, z),
    max: a.at(21, a.gy, z),
  });
  const source = row(20);
  const copied = row(23);
  const exact = row(26);
  const results: string[] = [];
  let pass = true;
  const record = (name: string, ok: boolean, value: unknown = ok) => {
    pass &&= ok;
    results.push(`${name}=${ok ? "PASS" : "FAIL"}(${String(value)})`);
  };
  const typeAt = (x: number, z: number) =>
    a.dim.getBlock(a.at(x, a.gy, z))?.typeId;
  const handles: StructureHandle[] = [];
  try {
    a.dim.getBlock(a.at(20, a.gy, 20))?.setType(WARP_BLOCK_TYPE);
    a.dim.getBlock(a.at(21, a.gy, 20))?.setType("minecraft:stone_bricks");
    const copy = store.capture(dim, source, owner, "copy");
    if (copy === "tooLarge" || copy === "unreadable")
      throw new Error(`copy capture refused: ${copy}`);
    handles.push(copy);
    const kept = store.capture(dim, source, owner, "exact");
    if (kept === "tooLarge" || kept === "unreadable")
      throw new Error(`exact capture refused: ${kept}`);
    handles.push(kept);
    record("source_kept", typeAt(20, 20) === WARP_BLOCK_TYPE, typeAt(20, 20));
    record("place_copy", store.place(copy, dim, copied.min));
    record("place_exact", store.place(kept, dim, exact.min));
    await wait(1);
    record("copy_warp_air", typeAt(20, 23) === "minecraft:air", typeAt(20, 23));
    record(
      "copy_other",
      typeAt(21, 23) === "minecraft:stone_bricks",
      typeAt(21, 23),
    );
    record("exact_warp", typeAt(20, 26) === WARP_BLOCK_TYPE, typeAt(20, 26));
  } catch (error) {
    record("round_trip", false, errorText(error));
  } finally {
    for (const handle of handles) store.discard(handle);
    for (const box of [source, copied, exact])
      record("cleanup", store.clearBlocks(dim, box));
  }
  return { pass, detail: results.join("; ") };
}
