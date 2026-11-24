import type { Vector3 } from "@minecraft/server";
import { CutBox } from "../../application/build/cutBox";
import { EndBuildSession } from "../../application/build/endBuildSession";
import type {
  BuildFeedback,
  BuildMessage,
} from "../../application/build/ports/feedback";
import { RotateBox } from "../../application/build/rotateBox";
import { RotateSelection } from "../../application/build/rotateSelection";
import { blockStateOf } from "../../domain/build/blockState";
import { cellBox, cellsOf } from "../../domain/build/box";
import { planRotationAboutCenter } from "../../domain/build/rotation/rotateBox";
import { selectionOf } from "../../domain/build/selection";
import { asDimensionId, asPlayerId } from "../../domain/shared/ids";
import { BedrockBlockWorld } from "../../infrastructure/build/bedrock/bedrockBlockWorld";
import { BedrockStructureStore } from "../../infrastructure/build/bedrock/bedrockStructureStore";
import { BedrockTapTargets } from "../../infrastructure/build/bedrock/bedrockTapTargets";
import { InMemorySessionRepository } from "../../infrastructure/build/persistence/inMemorySessionRepository";
import { WARP_BLOCK_TYPE } from "../../infrastructure/warp/identifiers";
import type { Arena } from "../arena";
import type { Outcome } from "../outcome";

export async function buildWarpBlockGuard(a: Arena): Promise<Outcome> {
  const playerId = asPlayerId(`warp_guard_${a.lane.index}`);
  const dimensionId = asDimensionId(a.dim.id);
  const source = cellBox(a.at(20, a.gy, 20), a.at(22, a.gy, 21));
  const plan = planRotationAboutCenter(source);
  const world = new BedrockBlockWorld({ isProtected: () => false });
  const structures = new BedrockStructureStore(() => false, [WARP_BLOCK_TYPE]);
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
  const repo = new InMemorySessionRepository(structures, log);
  const rotate = new RotateSelection(
    repo,
    new RotateBox(repo, world, players, structures, feedback, log),
    feedback,
    world,
  );
  const cut = new CutBox(repo, world, structures, feedback, log);
  const selection = selectionOf(
    dimensionId,
    source,
    blockStateOf("minecraft:stone"),
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
  const states = () =>
    [...cellsOf(plan.union)].map((cell) => block(cell).typeId);
  try {
    structures.clearBlocks(dimensionId, plan.union);
    block(source.min).setType(WARP_BLOCK_TYPE);
    block({ ...source.min, x: source.min.x + 1 }).setType(
      "minecraft:stone_bricks",
    );
    const before = states();
    session.setFlow({
      kind: "selected",
      menuLevel: "root",
      selection,
      from: source.min,
      to: source.max,
    });
    check(
      "rotate_refused",
      rotate.execute({ playerId, dimensionId }) === "refused" &&
        message === "rotateBlocked",
    );
    check(
      "cut_refused",
      cut.execute({ playerId, selection, facing: "east" }) === false &&
        message === "pasteBlocked",
    );
    check(
      "unchanged",
      JSON.stringify(states()) === JSON.stringify(before) &&
        block(source.min).typeId === WARP_BLOCK_TYPE,
    );
    block(source.min).setType("minecraft:stone");
    check(
      "target_rotates",
      rotate.execute({ playerId, dimensionId }) === "rotated",
    );
  } catch (error) {
    check(String(error), false);
  } finally {
    new EndBuildSession(repo, new BedrockTapTargets()).execute(playerId);
    structures.clearEntities(dimensionId, plan.union);
    check("cleanup", structures.clearBlocks(dimensionId, plan.union));
  }
  return { pass, detail: results.join("; ") };
}
