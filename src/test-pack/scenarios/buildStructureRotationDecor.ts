import {
  ItemStack,
  type PlayerInteractWithBlockAfterEvent,
  world,
} from "@minecraft/server";
import { cellsOf } from "../../domain/build/box";
import type { StructureHandle } from "../../domain/build/structure/handle";
import { asDimensionId, asPlayerId } from "../../domain/shared/ids";
import { BedrockStructureStore } from "../../infrastructure/build/bedrock/bedrockStructureStore";
import { type Arena, wait } from "../arena";
import type { Outcome, StepSink } from "../outcome";

export async function buildStructureRotationDecor(
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
  const slot = player.selectedSlotIndex;
  const store = new BedrockStructureStore(() => false);
  const dim = asDimensionId(a.dim.id);
  const source = { min: a.at(20, a.gy, 20), max: a.at(27, a.gy + 5, 27) };
  const destination = { min: a.at(40, a.gy, 20), max: a.at(47, a.gy + 5, 27) };
  const results: { name: string; pass: boolean; value: string }[] = [];
  const record = (name: string, pass: boolean, value: unknown) =>
    results.push({ name, pass, value: JSON.stringify(value) ?? String(value) });
  const entities = (box: typeof source) =>
    a.dim.getEntities().filter((e) => {
      const p = e.location;
      return (
        e.typeId !== "minecraft:player" &&
        p.x >= box.min.x - 1 &&
        p.x < box.max.x + 2 &&
        p.y >= box.min.y - 1 &&
        p.y < box.max.y + 2 &&
        p.z >= box.min.z - 1 &&
        p.z < box.max.z + 2
      );
    });
  const paintingFacts = (box: typeof source) =>
    entities(box)
      .filter((e) => e.typeId === "minecraft:painting")
      .map((e) => ({ position: e.location, rotation: e.getRotation() }));
  const frames = () =>
    [...cellsOf(source)]
      .map((cell) => a.dim.getBlock(cell))
      .filter((b) => b?.typeId === "minecraft:frame");
  const interacted = new Set<string>();
  const listener = (event: PlayerInteractWithBlockAfterEvent) => {
    if (
      event.player.id === player.id &&
      event.block.dimension.id === a.dim.id &&
      event.block.typeId === "minecraft:frame" &&
      event.beforeItemStack?.typeId === "minecraft:diamond"
    )
      interacted.add(JSON.stringify(event.block.location));
  };
  const removeEntities = (box: typeof source) => {
    for (const e of entities(box)) e.remove();
  };
  const drops = (box: typeof source) =>
    entities(box)
      .filter((e) => e.typeId === "minecraft:item")
      .map((e) => e.getComponent("minecraft:item")?.itemStack.typeId);
  const destroy = (cell: { x: number; y: number; z: number }) =>
    a.dim.runCommand(`setblock ${cell.x} ${cell.y} ${cell.z} air destroy`);
  const cleanup = (name: string, run: () => void) => {
    try {
      run();
    } catch (error) {
      record(name, false, String(error));
    }
  };
  let handle: StructureHandle | undefined;
  world.afterEvents.playerInteractWithBlock.subscribe(listener);
  try {
    for (const box of [source, destination]) {
      removeEntities(box);
      if (!store.clearBlocks(dim, box)) throw new Error("fixture clear failed");
    }
    a.dim.runCommand(`fill ${a.box(20, a.gy, 20, 27, a.gy, 27)} stone`);
    a.dim.runCommand(`fill ${a.box(21, a.gy + 1, 21, 21, a.gy + 4, 26)} stone`);
    inventory.clearAll();
    // Stable APIs cannot populate frames or create paintings (ADR 0244).
    for (const type of [
      "minecraft:frame",
      "minecraft:diamond",
      "minecraft:painting",
    ])
      inventory.addItem(new ItemStack(type, 1));
    player.selectedSlotIndex = 0;
    player.teleport(a.at(24.5, a.gy + 1, 23.5), {
      dimension: a.dim,
      facingLocation: a.at(21, a.gy + 2, 23.5),
    });
    player.sendMessage(
      "Rotation decor check: within 60 seconds, place a frame on the stone wall, put the diamond in it, and hang a painting on the wall.",
    );
    const ready = () =>
      frames().find((b) => b && interacted.has(JSON.stringify(b.location)));
    for (
      let ticks = 0;
      ticks < 1200 && (!ready() || paintingFacts(source).length === 0);
      ticks += 10
    ) {
      await wait(10);
      if ((ticks + 10) % 200 === 0)
        onStep?.({
          name: `setup_wait_${ticks + 10}`,
          pass: true,
          detail: `frame=${!!ready()};paintings=${paintingFacts(source).length};ticks=${ticks + 10}`,
        });
    }
    const frame = ready();
    const originals = paintingFacts(source);
    record("setup", !!frame && originals.length > 0, {
      frame: frame?.location,
      paintings: originals,
    });
    if (!frame || originals.length === 0)
      throw new Error("decor fixture incomplete");
    const cell = frame.location;
    const states = frame.permutation.getAllStates();
    player.teleport(a.at(16.5, a.gy, 23.5), { dimension: a.dim });
    for (const e of entities(source))
      if (e.typeId === "minecraft:item") e.remove();
    const captured = store.capture(
      dim,
      source,
      asPlayerId(`rotation_decor_${a.lane.index}`),
    );
    if (captured === "tooLarge" || captured === "unreadable")
      throw new Error(`capture ${captured}`);
    handle = captured;
    destroy(cell);
    await wait(2);
    const originalDrops = drops(source);
    record(
      "frame_fixture_diamond",
      originalDrops.includes("minecraft:diamond"),
      originalDrops,
    );
    removeEntities(source);
    if (!originalDrops.includes("minecraft:diamond"))
      throw new Error("original frame diamond was not observed");
    if (!store.place(handle, dim, destination.min, 1))
      throw new Error("rotated place refused");
    await wait(2);
    const target = {
      x: destination.min.x + 7 - (cell.z - source.min.z),
      y: destination.min.y + cell.y - source.min.y,
      z: destination.min.z + cell.x - source.min.x,
    };
    const restored = a.dim.getBlock(target);
    record("frame_rotation", true, {
      source: { cell, states },
      target: {
        cell: target,
        type: restored?.typeId,
        states: restored?.permutation.getAllStates(),
      },
    });
    record("painting_rotation", true, {
      source: originals,
      destination: paintingFacts(destination),
    });
    if (restored?.typeId === "minecraft:frame") destroy(target);
    await wait(2);
    record("frame_contents", true, { drops: drops(destination) });
  } catch (error) {
    record(
      "decor_rotation",
      false,
      error instanceof Error ? `${error.name}:${error.message}` : String(error),
    );
  } finally {
    cleanup("listener", () =>
      world.afterEvents.playerInteractWithBlock.unsubscribe(listener),
    );
    if (handle) store.discard(handle);
    for (const box of [source, destination]) {
      cleanup("entities", () => removeEntities(box));
      cleanup("blocks", () => {
        if (!store.clearBlocks(dim, box))
          throw new Error(`clear ${JSON.stringify(box)}`);
      });
    }
    if (player.isValid) {
      cleanup("inventory", () => {
        savedItems.forEach((item, index) => {
          inventory.setItem(index, item);
        });
        player.selectedSlotIndex = slot;
      });
      cleanup("player", () =>
        player.teleport(location, { dimension, rotation }),
      );
    }
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
