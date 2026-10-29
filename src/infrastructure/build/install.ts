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
import type { ChaseCameraWish } from "../../application/shared/ports/chaseCamera";
import type { SpaceCheck } from "../../application/shared/ports/space";
import type { PlayerId } from "../../domain/shared/ids";
import { BedrockBlockWorld } from "./bedrock/bedrockBlockWorld";
import { BedrockFeedback } from "./bedrock/bedrockFeedback";
import { BedrockRiderGate } from "./bedrock/bedrockRiderGate";
import { editActions } from "./bedrock/editActions";
import { registerBuildTool } from "./bedrock/handlers/buildTool";
import { registerEditTick } from "./bedrock/handlers/editTick";
import { registerModeTick } from "./bedrock/handlers/modeTick";
import { registerOutlineTick } from "./bedrock/handlers/outlineTick";
import { registerSessions } from "./bedrock/handlers/sessions";
import { registerTestCorner } from "./bedrock/handlers/testCorner";
import { registerTestCornerMarker } from "./bedrock/handlers/testCornerMarker";
import { recordMessages, registerTestEdit } from "./bedrock/handlers/testEdit";
import { registerTestMode } from "./bedrock/handlers/testMode";
import { registerWand } from "./bedrock/handlers/wand";
import { InMemorySessionRepository } from "./persistence/inMemorySessionRepository";

export function installBuild(deps: { isProtected: SpaceCheck }): {
  isInBuildMode: ChaseCameraWish;
} {
  const repo = new InMemorySessionRepository();
  const gate = new BedrockRiderGate();
  const recorded = recordMessages(new BedrockFeedback());
  const feedback = recorded.feedback;
  const blocks = new BedrockBlockWorld(deps);
  const modes = new UpdateBuildModes(repo);
  const jobs = new EditJobs(repo, blocks, feedback);
  const clear = new ClearSelection(repo, gate, feedback);
  const cases = {
    fill: new FillSelection(repo, gate, feedback, jobs),
    replace: new ReplaceInSelection(repo, gate, blocks, feedback, jobs),
    copy: new CopySelection(repo, gate, blocks, feedback),
    paste: new PasteClipboard(repo, gate, blocks, feedback, jobs),
    undo: new UndoEdit(repo, gate, feedback, jobs),
    clear,
  };
  const actions = (id: PlayerId) => editActions(id, cases);
  registerWand(new SetCorner(repo, gate, feedback), clear);
  registerModeTick(modes, gate);
  registerOutlineTick(new ShowOutline(repo, gate, feedback));
  registerSessions(repo);
  registerTestCorner(repo, gate, feedback, blocks);
  registerTestCornerMarker(repo, gate, feedback);
  registerTestMode(modes);
  registerBuildTool(gate, feedback, actions);
  registerEditTick(jobs);
  registerTestEdit(actions, repo, recorded);
  return { isInBuildMode: (playerId) => modes.isInBuildMode(playerId) };
}
