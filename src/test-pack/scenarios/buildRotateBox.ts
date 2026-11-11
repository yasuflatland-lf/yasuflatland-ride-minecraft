import { ItemStack, SignSide, type Vector3 } from "@minecraft/server";
import { EditJobs } from "../../application/build/editJobs";
import { EndBuildSession } from "../../application/build/endBuildSession";
import type {
  BuildFeedback,
  BuildMessage,
} from "../../application/build/ports/feedback";
import { RotateBox } from "../../application/build/rotateBox";
import { RotateBoxAction } from "../../application/build/rotateBoxAction";
import { UndoEdit } from "../../application/build/undoEdit";
import { blockStateOf } from "../../domain/build/blockState";
import { cellsOf, contains } from "../../domain/build/box";
import { selectionBoxOf } from "../../domain/build/flow/flow";
import { shapeMenu } from "../../domain/build/flow/menu";
import { planRotationAboutCenter } from "../../domain/build/rotation/rotateBox";
import { asDimensionId, asPlayerId } from "../../domain/shared/ids";
import { BedrockBlockWorld } from "../../infrastructure/build/bedrock/bedrockBlockWorld";
import { BedrockStructureStore } from "../../infrastructure/build/bedrock/bedrockStructureStore";
import { InMemorySessionRepository } from "../../infrastructure/build/persistence/inMemorySessionRepository";
import { type Arena, wait } from "../arena";
import type { Outcome } from "../outcome";

export async function buildRotateBox(a: Arena): Promise<Outcome> {
  const repo = new InMemorySessionRepository();
  const playerId = asPlayerId(`rotate_box_${a.lane.index}`);
  const dimensionId = asDimensionId(a.dim.id);
  const source = { min: a.at(20, a.gy, 20), max: a.at(24, a.gy + 3, 26) };
  const plan = planRotationAboutCenter(source);
  const neighbor = { ...plan.target.min, y: a.gy + 1 };
  let protectedCell: Vector3 | undefined;
  const world = new BedrockBlockWorld({
    isProtected: (_dim, cell) =>
      protectedCell !== undefined &&
      cell.x === protectedCell.x &&
      cell.y === protectedCell.y &&
      cell.z === protectedCell.z,
  });
  const structures = new BedrockStructureStore(() => false);
  const players = { occupantOf: () => undefined, moveTo: () => {} };
  let message: BuildMessage | undefined;
  const feedback: BuildFeedback = {
    showMessage: (_id, value) => {
      message = value;
    },
    showUndoHint: () => {},
    showSize: () => {},
    showMode: () => {},
    drawPreview: () => {},
  };
  const log = { warn: (value: string) => console.warn(value) };
  const rotate = new RotateBoxAction(
    repo,
    new RotateBox(repo, world, players, structures, feedback, log),
  );
  const undo = new UndoEdit(
    repo,
    feedback,
    new EditJobs(repo, world, feedback, log, players),
    world,
    structures,
    log,
  );
  const session = repo.getOrCreate(playerId);
  const results: string[] = [];
  let pass = true;
  const check = (name: string, ok: boolean) => {
    results.push(`${name}=${ok ? "PASS" : "FAIL"}`);
    pass &&= ok;
  };
  const block = (cell: Vector3) => {
    const value = a.dim.getBlock(cell);
    if (!value) throw new Error(`unloaded ${JSON.stringify(cell)}`);
    return value;
  };
  const contents = (chest: Vector3, sign: Vector3) => {
    const inventory = block(chest).getComponent(
      "minecraft:inventory",
    )?.container;
    return (
      [0, 13].every((slot) => {
        const item = inventory?.getItem(slot);
        return item?.typeId === "minecraft:diamond" && item.amount === slot + 2;
      }) &&
      block(sign).getComponent("minecraft:sign")?.getText(SignSide.Front) ===
        "Rotate bungalow"
    );
  };
  const select = () =>
    session.setFlow({
      kind: "endpoint",
      dimensionId,
      from: source.min,
      to: source.max,
      material: blockStateOf("minecraft:stone"),
    });
  const turn = () => {
    const box = selectionBoxOf(session.flow);
    if (!box) throw new Error("selection lost");
    check("rotate", rotate.execute(playerId, dimensionId, box));
    check(
      "menu_reopens",
      shapeMenu(session.flow).some((entry) => entry.id === "rotate"),
    );
  };
  const originalChest = a.at(20, a.gy + 1, 20);
  const originalSign = a.at(20, a.gy + 1, 22);
  const states = () =>
    [...cellsOf(plan.union)].map((cell) => ({
      type: block(cell).typeId,
      states: block(cell).permutation.getAllStates(),
    }));
  try {
    structures.clearBlocks(dimensionId, plan.union);
    a.dim.runCommand(`fill ${a.box(20, a.gy, 20, 24, a.gy, 26)} oak_planks`);
    a.dim.runCommand(
      `setblock ${a.xyz(20, a.gy + 1, 20)} chest ["minecraft:cardinal_direction"="north"]`,
    );
    a.dim.runCommand(
      `setblock ${a.xyz(20, a.gy + 1, 22)} standing_sign ["ground_sign_direction"=4]`,
    );
    a.dim.runCommand(
      `setblock ${a.xyz(24, a.gy + 1, 24)} oak_stairs ["weirdo_direction"=2]`,
    );
    for (const slot of [0, 13])
      block(originalChest)
        .getComponent("minecraft:inventory")
        ?.container?.setItem(
          slot,
          new ItemStack("minecraft:diamond", slot + 2),
        );
    block(originalSign)
      .getComponent("minecraft:sign")
      ?.setText("Rotate bungalow", SignSide.Front);
    block(neighbor).setType("minecraft:stone");
    await wait(2);
    const before = states();
    check("fixture", contents(originalChest, originalSign));
    select();
    turn();
    check(
      "footprint_7x4x5",
      JSON.stringify(selectionBoxOf(session.flow)) ===
        JSON.stringify(plan.target) &&
        plan.target.max.x - plan.target.min.x === 6 &&
        plan.target.max.y - plan.target.min.y === 3 &&
        plan.target.max.z - plan.target.min.z === 4,
    );
    check(
      "floor_footprint",
      [...cellsOf(plan.union)]
        .filter((cell) => cell.y === source.min.y)
        .every((cell) =>
          contains(plan.target, cell)
            ? block(cell).typeId === "minecraft:oak_planks"
            : block(cell).isAir,
        ),
    );
    check("neighbor_overwritten", block(neighbor).isAir);
    check(
      "rotated_contents",
      contents(
        { x: plan.target.min.x + 6, y: a.gy + 1, z: plan.target.min.z },
        { x: plan.target.min.x + 4, y: a.gy + 1, z: plan.target.min.z },
      ),
    );
    undo.execute({ playerId });
    check(
      "undo_union",
      message === "undoDone" &&
        JSON.stringify(states()) === JSON.stringify(before),
    );
    check("undo_contents", contents(originalChest, originalSign));
    select();
    for (let i = 1; i <= 4; i++) {
      turn();
      if (i === 2 || i === 4)
        check(
          `box_after_${i}`,
          JSON.stringify(selectionBoxOf(session.flow)) ===
            JSON.stringify(source),
        );
    }
    check("four_turn_contents", contents(originalChest, originalSign));
    const protectedBefore = states();
    const previousFlow = session.flow;
    protectedCell = neighbor;
    check(
      "protected_refused",
      !rotate.execute(playerId, dimensionId, source) &&
        message === "rotateBlocked",
    );
    check(
      "protected_unchanged",
      session.flow === previousFlow &&
        JSON.stringify(states()) === JSON.stringify(protectedBefore) &&
        contents(originalChest, originalSign),
    );
  } catch (error) {
    check(String(error), false);
  } finally {
    new EndBuildSession(repo, structures).execute(playerId);
    structures.clearEntities(dimensionId, plan.union);
    check("cleanup", structures.clearBlocks(dimensionId, plan.union));
  }
  return { pass, detail: results.join("; ") };
}
