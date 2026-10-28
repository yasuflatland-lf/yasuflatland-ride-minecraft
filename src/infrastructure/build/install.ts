import { ClearSelection } from "../../application/build/clearSelection";
import { CopySelection } from "../../application/build/copySelection";
import { EditJobs } from "../../application/build/editJobs";
import { FillSelection } from "../../application/build/fillSelection";
import { PasteClipboard } from "../../application/build/pasteClipboard";
import type { BuildFeedback } from "../../application/build/ports/feedback";
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
import { registerTestEdit } from "./bedrock/handlers/testEdit";
import { registerTestMode } from "./bedrock/handlers/testMode";
import { registerWand } from "./bedrock/handlers/wand";
import { InMemorySessionRepository } from "./persistence/inMemorySessionRepository";

export function installBuild(deps: { isProtected: SpaceCheck }): {
  isInBuildMode: ChaseCameraWish;
} {
  const repo = new InMemorySessionRepository();
  const gate = new BedrockRiderGate();
  const feedback = new BedrockFeedback();
  const blocks = new BedrockBlockWorld(deps);
  const modes = new UpdateBuildModes(repo);
  const jobs = new EditJobs(repo, blocks, feedback);
  const clear = new ClearSelection(repo, gate, feedback);
  const casesFor = (messages: BuildFeedback) => ({
    fill: new FillSelection(repo, gate, messages, jobs),
    replace: new ReplaceInSelection(repo, gate, blocks, messages, jobs),
    copy: new CopySelection(repo, gate, blocks, messages),
    paste: new PasteClipboard(repo, gate, blocks, messages, jobs),
    undo: new UndoEdit(repo, gate, messages, jobs),
    clear,
  });
  const cases = casesFor(feedback);
  const actions = (id: PlayerId) => editActions(id, cases);
  registerWand(new SetCorner(repo, gate, feedback), clear);
  registerModeTick(modes, gate);
  registerOutlineTick(new ShowOutline(repo, gate, feedback));
  registerSessions(repo);
  registerTestCorner(repo, gate, feedback, blocks);
  registerTestMode(modes);
  registerBuildTool(gate, feedback, actions);
  registerEditTick(jobs);
  registerTestEdit(
    (id, messages) => editActions(id, casesFor(messages)),
    repo,
    feedback,
  );
  return { isInBuildMode: (playerId) => modes.isInBuildMode(playerId) };
}
