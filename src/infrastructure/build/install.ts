import { ClearSelection } from "../../application/build/clearSelection";
import { CopySelection } from "../../application/build/copySelection";
import { EditJobs } from "../../application/build/editJobs";
import { FillSelection } from "../../application/build/fillSelection";
import { PasteClipboard } from "../../application/build/pasteClipboard";
import { ReplaceInSelection } from "../../application/build/replaceInSelection";
import { SetCorner } from "../../application/build/setCorner";
import { ShowOutline } from "../../application/build/showOutline";
import { UndoEdit } from "../../application/build/undoEdit";
import { UpdateBuildModes } from "../../application/build/updateBuildModes";
import type { SpaceCheck } from "../../application/shared/ports/space";
import type { PlayerId } from "../../domain/shared/ids";
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
import { InMemorySessionRepository } from "./persistence/inMemorySessionRepository";

export function installBuild(deps: { isProtected: SpaceCheck }): void {
  const repo = new InMemorySessionRepository();
  const anchor = new BedrockBuildAnchor();
  const recorded = recordMessages(new BedrockFeedback());
  const feedback = recorded.feedback;
  const blocks = new BedrockBlockWorld(deps);
  const modes = new UpdateBuildModes(repo);
  const jobs = new EditJobs(repo, blocks, feedback);
  const clear = new ClearSelection(repo, feedback);
  const cases = {
    fill: new FillSelection(repo, feedback, jobs),
    replace: new ReplaceInSelection(repo, blocks, feedback, jobs),
    copy: new CopySelection(repo, anchor, blocks, feedback),
    paste: new PasteClipboard(repo, anchor, blocks, feedback, jobs),
    undo: new UndoEdit(repo, feedback, jobs),
    clear,
  };
  const actions = (id: PlayerId) => editActions(id, cases);
  registerWand(new SetCorner(repo, feedback), clear);
  registerModeTick(modes);
  registerOutlineTick(new ShowOutline(repo, anchor, feedback));
  registerSessions(repo);
  registerTestCorner(repo, feedback, blocks);
  registerTestMode(modes);
  registerBuildTool(actions);
  registerEditTick(jobs);
  registerTestEdit(actions, repo, recorded);
}
