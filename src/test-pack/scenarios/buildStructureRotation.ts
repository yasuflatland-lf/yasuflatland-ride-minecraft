import { ItemStack, SignSide, type Vector3 } from "@minecraft/server";
import { type CellBox, cellsOf } from "../../domain/build/box";
import {
  type QuarterTurn,
  rotatedSize,
} from "../../domain/build/rotation/quarterTurn";
import type { StructureHandle } from "../../domain/build/structure/handle";
import { asDimensionId, asPlayerId } from "../../domain/shared/ids";
import { BedrockStructureStore } from "../../infrastructure/build/bedrock/bedrockStructureStore";
import { type Arena, wait } from "../arena";
import type { Outcome } from "../outcome";

const SIZE = { x: 5, y: 4, z: 7 };

function mapped(cell: Vector3, turn: QuarterTurn): Vector3 {
  let { x, z } = cell;
  let { x: sx, z: sz } = SIZE;
  for (let step = 0; step < turn; step++) {
    [x, z] = [sz - 1 - z, x];
    [sx, sz] = [sz, sx];
  }
  return { x, y: cell.y, z };
}

export async function buildStructureRotation(a: Arena): Promise<Outcome> {
  const store = new BedrockStructureStore(() => false);
  const dim = asDimensionId(a.dim.id);
  const owner = asPlayerId(`rotation_${a.lane.index}`);
  const source = { min: a.at(20, a.gy, 20), max: a.at(24, a.gy + 3, 26) };
  const destination = { min: a.at(39, a.gy, 19), max: a.at(47, a.gy + 3, 27) };
  const anchor = a.at(40, a.gy, 20);
  const handles: StructureHandle[] = [];
  const spawned = new Set<string>();
  const results: { name: string; pass: boolean; value: string }[] = [];
  const record = (name: string, pass: boolean, value: unknown) =>
    results.push({ name, pass, value: JSON.stringify(value) ?? String(value) });
  const block = (at: Vector3) => {
    const found = a.dim.getBlock(at);
    if (!found) throw new Error(`unloaded block ${JSON.stringify(at)}`);
    return found;
  };
  const sourceCell = (x: number, y: number, z: number) =>
    a.at(20 + x, a.gy + y, 20 + z);
  const target = (x: number, y: number, z: number, turn: QuarterTurn) => {
    const p = mapped({ x, y, z }, turn);
    return { x: anchor.x + p.x, y: anchor.y + p.y, z: anchor.z + p.z };
  };
  const capture = (box: CellBox) => {
    const handle = store.capture(dim, box, owner);
    if (handle === "tooLarge" || handle === "unreadable")
      throw new Error(`capture ${handle}`);
    handles.push(handle);
    return handle;
  };
  const clear = (box: CellBox) => {
    store.clearEntities(dim, box);
    if (!store.clearBlocks(dim, box))
      throw new Error(`clear ${JSON.stringify(box)}`);
  };
  const itemFacts = (at: Vector3, slots: number[]) => {
    const inventory = block(at).getComponent("minecraft:inventory")?.container;
    return slots.map((slot) => {
      const item = inventory?.getItem(slot);
      return { slot, type: item?.typeId, amount: item?.amount };
    });
  };
  try {
    clear(source);
    clear(destination);
    a.dim.runCommand(`fill ${a.box(20, a.gy, 20, 24, a.gy, 26)} stone`);
    const set = (x: number, y: number, z: number, value: string) =>
      a.dim.runCommand(`setblock ${a.xyz(20 + x, a.gy + y, 20 + z)} ${value}`);
    set(0, 1, 0, 'chest ["minecraft:cardinal_direction"="north"]');
    set(2, 1, 0, "barrel");
    set(4, 1, 0, 'furnace ["minecraft:cardinal_direction"="north"]');
    set(0, 1, 2, 'standing_sign ["ground_sign_direction"=4]');
    set(3, 1, 2, "stone");
    set(4, 1, 2, 'wall_sign ["facing_direction"=5]');
    // Setting both halves separately leaves one half; the engine adds the head.
    set(0, 1, 4, 'bed ["direction"=0]');
    set(2, 1, 4, 'oak_stairs ["weirdo_direction"=2]');
    set(4, 1, 4, 'oak_log ["pillar_axis"="x"]');
    set(2, 1, 6, "mob_spawner");
    set(
      4,
      1,
      6,
      'wooden_door ["direction"=0,"upper_block_bit"=false,"door_hinge_bit"=true]',
    );
    set(
      4,
      2,
      6,
      'wooden_door ["direction"=0,"upper_block_bit"=true,"door_hinge_bit"=true]',
    );
    for (const [x, slots] of [
      [0, [0, 13]],
      [2, [0]],
    ] as const) {
      const inventory = block(sourceCell(x, 1, 0)).getComponent(
        "minecraft:inventory",
      )?.container;
      if (!inventory) throw new Error(`missing inventory ${x}`);
      for (const slot of slots)
        inventory.setItem(slot, new ItemStack("minecraft:diamond", slot + 2));
    }
    for (const [x, z, text] of [
      [0, 2, "Standing rotation"],
      [4, 2, "Wall rotation"],
    ] as const) {
      const sign = block(sourceCell(x, 1, z)).getComponent("minecraft:sign");
      if (!sign) throw new Error(`missing sign ${x}`);
      sign.setText(text, SignSide.Front);
    }
    await wait(2);
    const fixtures = [...cellsOf(source)].map((cell) => ({
      at: {
        x: cell.x - source.min.x,
        y: cell.y - source.min.y,
        z: cell.z - source.min.z,
      },
      type: block(cell).typeId,
    }));
    for (const [name, x, y, z] of [
      ["chest", 0, 1, 0],
      ["furnace", 4, 1, 0],
      ["standing_sign", 0, 1, 2],
      ["wall_sign", 4, 1, 2],
      ["stairs", 2, 1, 4],
      ["log", 4, 1, 4],
      ["door_lower", 4, 1, 6],
      ["door_upper", 4, 2, 6],
    ] as const) {
      const b = block(sourceCell(x, y, z));
      record(`fixture_${name}`, true, {
        type: b.typeId,
        states: b.permutation.getAllStates(),
      });
    }
    const doorStates = [1, 2].map((y) =>
      block(sourceCell(4, y, 6)).permutation.getAllStates(),
    );
    const doorTypes = [1, 2].map((y) => block(sourceCell(4, y, 6)).typeId);
    record(
      "fixture_door_halves",
      doorTypes.every((t) => t === "minecraft:wooden_door") &&
        doorStates[0]?.upper_block_bit === false &&
        doorStates[1]?.upper_block_bit === true,
      { types: doorTypes, states: doorStates },
    );
    if (!results.at(-1)?.pass) throw new Error("door fixture incomplete");
    const beds = fixtures
      .filter(({ type }) => type === "minecraft:bed")
      .map(({ at }) => ({
        at,
        head: block(sourceCell(at.x, at.y, at.z)).permutation.getState(
          "head_piece_bit",
        ),
      }));
    record(
      "fixture_bed_halves",
      beds.length === 2 && beds[0]?.head !== beds[1]?.head,
      beds,
    );
    if (!results.at(-1)?.pass) throw new Error("bed fixture incomplete");
    a.dim.runCommand(`summon minecraft:cow ${a.xyz(21.5, a.gy + 1, 23.5)}`);
    for (const e of a.dim.getEntities({
      type: "minecraft:cow",
      location: source.min,
      maxDistance: 10,
    }))
      spawned.add(e.id);
    const handle = capture(source);
    store.clearEntities(dim, source);
    const stairDirections: unknown[] = [];
    for (const turn of [0, 1, 2, 3] as const) {
      clear(destination);
      const placed = store.place(handle, dim, anchor, turn);
      if (!placed) throw new Error(`place refused at turn ${turn}`);
      const size = rotatedSize(SIZE, turn);
      const mismatches = fixtures.flatMap(({ at, type }) => {
        const cell = target(at.x, at.y, at.z, turn);
        const actual = block(cell).typeId;
        return actual === type
          ? []
          : [{ source: at, target: cell, expected: type, actual }];
      });
      record(`mapping_${turn}`, mismatches.length === 0, {
        checked: fixtures.length,
        mismatches,
      });
      const outside = [...cellsOf(destination)]
        .filter(
          (cell) =>
            (cell.x < anchor.x ||
              cell.x >= anchor.x + size.x ||
              cell.z < anchor.z ||
              cell.z >= anchor.z + size.z) &&
            !block(cell).isAir,
        )
        .map((cell) => ({ cell, type: block(cell).typeId }));
      const floor = fixtures
        .filter(({ at }) => at.y === 0)
        .map(({ at }) => block(target(at.x, 0, at.z, turn)).typeId);
      record(
        `footprint_${turn}`,
        outside.length === 0 && floor.every((t) => t === "minecraft:stone"),
        {
          anchor,
          size,
          floorCells: floor.length,
          floorTypes: [...new Set(floor)],
          outside,
        },
      );
      for (const [name, x, slots] of [
        ["chest", 0, [0, 13]],
        ["barrel", 2, [0]],
      ] as const) {
        const items = itemFacts(target(x, 1, 0, turn), [...slots]);
        record(
          `${name}_items_${turn}`,
          items.every(
            (i) => i.type === "minecraft:diamond" && i.amount === i.slot + 2,
          ),
          items,
        );
      }
      for (const [x, z, text] of [
        [0, 2, "Standing rotation"],
        [4, 2, "Wall rotation"],
      ] as const) {
        const actual = block(target(x, 1, z, turn))
          .getComponent("minecraft:sign")
          ?.getText(SignSide.Front);
        record(`sign_${x}_${turn}`, actual === text, { text: actual });
      }
      for (const [name, x] of [
        ["chest", 0],
        ["furnace", 4],
      ] as const) {
        const states = block(target(x, 1, 0, turn)).permutation.getAllStates();
        record(
          `${name}_heading_${turn}`,
          states["minecraft:cardinal_direction"] ===
            ["north", "east", "south", "west"][turn],
          states,
        );
      }
      const standing = block(target(0, 1, 2, turn)).permutation.getAllStates();
      record(
        `standing_heading_${turn}`,
        standing.ground_sign_direction === [4, 8, 12, 0][turn],
        standing,
      );
      const wall = block(target(4, 1, 2, turn)).permutation.getAllStates();
      record(
        `wall_heading_${turn}`,
        wall.facing_direction === [5, 3, 4, 2][turn],
        wall,
      );
      const log = block(target(4, 1, 4, turn)).permutation.getAllStates();
      record(
        `log_axis_${turn}`,
        log.pillar_axis === (turn % 2 === 0 ? "x" : "z"),
        log,
      );
      const stairs = block(target(2, 1, 4, turn)).permutation.getAllStates();
      stairDirections.push(stairs.weirdo_direction);
      record(
        `stairs_${turn}`,
        typeof stairs.weirdo_direction === "number" &&
          new Set(stairDirections).size === stairDirections.length,
        stairs,
      );
      const spawner = block(target(2, 1, 6, turn)).typeId;
      record(`spawner_${turn}`, spawner === "minecraft:mob_spawner", spawner);
      const placedBeds = beds.map(({ at, head }) => {
        const b = block(target(at.x, at.y, at.z, turn));
        return {
          head,
          type: b.typeId,
          states: b.permutation.getAllStates(),
        };
      });
      record(
        `bed_${turn}`,
        placedBeds.every(
          (b) =>
            b.type === "minecraft:bed" && b.states.head_piece_bit === b.head,
        ),
        placedBeds,
      );
      const doors = [1, 2].map((y) => {
        const b = block(target(4, y, 6, turn));
        return { type: b.typeId, states: b.permutation.getAllStates() };
      });
      record(
        `door_${turn}`,
        doors.every(
          (b, i) =>
            b.type === "minecraft:wooden_door" &&
            b.states.upper_block_bit === (i === 1) &&
            b.states.door_hinge_bit === doorStates[i]?.door_hinge_bit,
        ),
        doors,
      );
      const cows = a.dim.getEntities({
        type: "minecraft:cow",
        location: anchor,
        maxDistance: 12,
      });
      for (const cow of cows) spawned.add(cow.id);
      record(`cow_${turn}`, true, {
        count: cows.length,
        entities: cows.map((e) => ({
          position: e.location,
          rotation: e.getRotation(),
        })),
      });
      for (const cow of cows) cow.remove();
      store.clearEntities(dim, destination);
      await wait(1);
    }
    clear(destination);
    a.dim.runCommand(`fill ${a.box(40, a.gy, 20, 46, a.gy + 3, 26)} stone`);
    const airPlaced = store.place(handle, dim, anchor, 1);
    const airCells = fixtures.filter((f) => f.type === "minecraft:air");
    const airTypes = airCells.map(
      ({ at }) => block(target(at.x, at.y, at.z, 1)).typeId,
    );
    record("air_write", true, {
      placed: airPlaced,
      sampled: airTypes.length,
      air: airTypes.filter((t) => t === "minecraft:air").length,
      types: [...new Set(airTypes)],
    });
    clear(source);
    clear(destination);
    const large = { min: a.at(8, a.gy, 8), max: a.at(71, a.gy + 63, 71) };
    const startCapture = Date.now();
    const largeHandle = store.capture(dim, large, owner);
    const captureMs = Date.now() - startCapture;
    record("capture_64", true, {
      milliseconds: captureMs,
      result: largeHandle,
    });
    if (largeHandle !== "tooLarge" && largeHandle !== "unreadable") {
      handles.push(largeHandle);
      // Placing at the captured corner preserves the arena floor and terrain.
      const before = new Set(a.dim.getEntities().map((entity) => entity.id));
      const startPlace = Date.now();
      const placed = store.place(largeHandle, dim, large.min);
      record("place_64", true, {
        milliseconds: Date.now() - startPlace,
        placed,
      });
      for (const entity of a.dim.getEntities())
        if (entity.typeId !== "minecraft:player" && !before.has(entity.id)) {
          spawned.add(entity.id);
          entity.remove();
        }
    } else record("place_64", true, { skipped: largeHandle });
  } catch (error) {
    record(
      "rotation",
      false,
      error instanceof Error ? `${error.name}:${error.message}` : String(error),
    );
  } finally {
    for (const handle of handles) store.discard(handle);
    try {
      for (const entity of a.dim.getEntities()) {
        if (spawned.has(entity.id) && entity.isValid) {
          try {
            entity.remove();
          } catch (error) {
            record("cleanup_entity", false, String(error));
          }
        }
      }
    } catch (error) {
      record("cleanup_entities", false, String(error));
    }
    for (const box of [source, destination]) {
      store.clearEntities(dim, box);
      const cleared = store.clearBlocks(dim, box);
      record("cleanup_blocks", cleared, { box, cleared });
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
