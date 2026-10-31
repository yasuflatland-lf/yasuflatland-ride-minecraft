import { AimRoofHeight } from "../../application/build/aimRoofHeight";
import { CancelFlow } from "../../application/build/cancelFlow";
import { ChooseRoof } from "../../application/build/chooseRoof";
import { ClearSelection } from "../../application/build/clearSelection";
import { ConfirmRoof } from "../../application/build/confirmRoof";
import { ConfirmShape } from "../../application/build/confirmShape";
import { CopySelection } from "../../application/build/copySelection";
import { EditJobs } from "../../application/build/editJobs";
import { PasteAt } from "../../application/build/pasteAt";
import { SetPoint } from "../../application/build/setPoint";
import { ShowPreview } from "../../application/build/showPreview";
import { StartPaste } from "../../application/build/startPaste";
import { TapAir } from "../../application/build/tapAir";
import { UndoEdit } from "../../application/build/undoEdit";
import { UpdateBuildModes } from "../../application/build/updateBuildModes";
import type { SpaceCheck } from "../../application/shared/ports/space";
import { BUILD_SPEC } from "../../domain/build/spec";
import type { PlayerId } from "../../domain/shared/ids";
import { PressDebounces } from "../../domain/shared/pressDebounce";
import { BedrockAimReader } from "./bedrock/bedrockAimReader";
import { BedrockBlockWorld } from "./bedrock/bedrockBlockWorld";
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
    copy: new CopySelection(repo, blocks, feedback),
    paste: new StartPaste(repo),
    pasteAt: new PasteAt(repo, blocks, feedback, jobs),
    chooseRoof: new ChooseRoof(repo),
    aimRoofHeight: new AimRoofHeight(repo),
    confirmRoof: new ConfirmRoof(repo, feedback, jobs),
    undo: new UndoEdit(repo, feedback, jobs),
    clear,
  };
  const actions = (id: PlayerId) => editActions(id, cases);
  registerWand({
    setPoint: new SetPoint(repo, blocks, feedback),
    tapAir: new TapAir(repo, feedback),
    pasteAt: cases.pasteAt,
    repo,
    menus: new StubBuildMenus(),
    aim: new BedrockAimReader(),
    debounce,
    pointOf: (playerId) => {
      const flow = repo.get(playerId)?.flow;
      return flow?.kind === "point1" ? flow.cell : undefined;
    },
  });
  registerModeTick(modes);
  registerOutlineTick(new ShowPreview(repo, feedback, new BedrockAimReader()));
  registerSessions(repo, cancel, debounce);
  registerTestCorner(repo, feedback, blocks);
  registerTestMode(modes);
  registerBuildTool(actions);
  registerEditTick(jobs);
  registerTestEdit(actions, repo, recorded);
}
