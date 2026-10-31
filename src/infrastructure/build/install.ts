import { CancelFlow } from "../../application/build/cancelFlow";
import { ClearSelection } from "../../application/build/clearSelection";
import { ConfirmShape } from "../../application/build/confirmShape";
import { CopySelection } from "../../application/build/copySelection";
import { EditJobs } from "../../application/build/editJobs";
import { PasteClipboard } from "../../application/build/pasteClipboard";
import { SetPoint } from "../../application/build/setPoint";
import { ShowOutline } from "../../application/build/showOutline";
import { TapAir } from "../../application/build/tapAir";
import { UndoEdit } from "../../application/build/undoEdit";
import { UpdateBuildModes } from "../../application/build/updateBuildModes";
import type { SpaceCheck } from "../../application/shared/ports/space";
import { BUILD_SPEC } from "../../domain/build/spec";
import type { PlayerId } from "../../domain/shared/ids";
import { PressDebounces } from "../../domain/shared/pressDebounce";
import { BedrockAimReader } from "./bedrock/bedrockAimReader";
import { BedrockBlockWorld } from "./bedrock/bedrockBlockWorld";
import { BedrockBuildAnchor } from "./bedrock/bedrockBuildAnchor";
import { BedrockFeedback } from "./bedrock/bedrockFeedback";
import { editActions } from "./bedrock/editActions";
import { registerBuildTool } from "./bedrock/handlers/buildTool";
import { registerEditTick } from "./bedrock/handlers/editTick";
import { registerModeTick } from "./bedrock/handlers/modeTick";
import { registerOutlineTick } from "./bedrock/handlers/outlineTick";
import { registerSessions } from "./bedrock/handlers/sessions";
import { registerTestCorner } from "./bedrock/handlers/testCorner";
import { recordMessages, registerTestEdit } from "./bedrock/handlers/testEdit";
import { registerTestMode } from "./bedrock/handlers/testMode";
import { registerWand } from "./bedrock/handlers/wand";
import { StubBuildMenus } from "./bedrock/stubBuildMenus";
import { InMemorySessionRepository } from "./persistence/inMemorySessionRepository";

export function installBuild(deps: { isProtected: SpaceCheck }): void {
  const repo = new InMemorySessionRepository();
  const anchor = new BedrockBuildAnchor();
  const recorded = recordMessages(new BedrockFeedback());
  const feedback = recorded.feedback;
  const blocks = new BedrockBlockWorld(deps);
  const cancel = new CancelFlow(repo);
  const debounce = new PressDebounces<PlayerId>(BUILD_SPEC.pressDebounceTicks);
  const modes = new UpdateBuildModes(repo, cancel);
  const jobs = new EditJobs(repo, blocks, feedback);
  const clear = new ClearSelection(repo, feedback);
  const cases = {
    fill: new ConfirmShape(repo, feedback, jobs),
    copy: new CopySelection(repo, anchor, blocks, feedback),
    paste: new PasteClipboard(repo, anchor, blocks, feedback, jobs),
    undo: new UndoEdit(repo, feedback, jobs),
    clear,
  };
  const actions = (id: PlayerId) => editActions(id, cases);
  registerWand({
    setPoint: new SetPoint(repo, blocks, feedback),
    tapAir: new TapAir(repo, feedback),
    menus: new StubBuildMenus(),
    aim: new BedrockAimReader(),
    debounce,
    pointOf: (playerId) => {
      const flow = repo.get(playerId)?.flow;
      return flow?.kind === "point1" ? flow.cell : undefined;
    },
  });
  registerModeTick(modes);
  registerOutlineTick(new ShowOutline(repo, anchor, feedback));
  registerSessions(repo, cancel, debounce);
  registerTestCorner(repo, feedback, blocks);
  registerTestMode(modes);
  registerBuildTool(actions);
  registerEditTick(jobs);
  registerTestEdit(actions, repo, recorded);
}
