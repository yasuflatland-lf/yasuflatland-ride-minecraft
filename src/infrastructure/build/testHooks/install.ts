import type { installBuild } from "../install";
import { DescribeBuild } from "./describeBuild";
import { recordMessages } from "./recordMessages";
import { TestAimReader } from "./testAim";
import { registerTestTap } from "./testCorner";
import { registerTestEdit } from "./testEdit";
import { registerTestInput } from "./testInput";
import { registerTestMode } from "./testMode";
import { registerTestPress } from "./testPress";
import { registerTestTapTarget } from "./testTapTarget";

export function installBuildTestHooks(
  ctx: ReturnType<typeof installBuild>,
): void {
  const messages = recordMessages(ctx.feedback);
  const testAim = new TestAimReader(ctx.aimOverrides);
  ctx.onPlayerLeave.add((playerId) => {
    ctx.aimOverrides.delete(playerId);
    messages.forget(playerId);
  });

  registerTestInput(testAim);
  registerTestTapTarget(ctx.tapTargets, ctx.pressTapTarget);
  registerTestTap(
    ctx.repo,
    ctx.feedback,
    ctx.blocks,
    ctx.menuCases.openSelectionMenu,
    ctx.aim,
    ctx.pressWand,
  );
  registerTestMode(ctx.modes, ctx.repo);
  const describe = new DescribeBuild(ctx.repo);
  registerTestPress(ctx.routes, ctx.pressWand, describe, messages);
  registerTestEdit(
    ctx.menuChoices,
    ctx.menuCases.undo,
    ctx.pressUndo,
    describe,
    messages,
    ctx.repo,
    ctx.endSession,
    ctx.structures,
    { aim: testAim, preview: ctx.preview },
  );
}
