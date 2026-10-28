import { ClearSelection } from "../../application/build/clearSelection";
import { SetCorner } from "../../application/build/setCorner";
import { ShowOutline } from "../../application/build/showOutline";
import { UpdateBuildModes } from "../../application/build/updateBuildModes";
import type { ChaseCameraWish } from "../../application/shared/ports/chaseCamera";
import type { SpaceCheck } from "../../application/shared/ports/space";
import { BedrockBlockWorld } from "./bedrock/bedrockBlockWorld";
import { BedrockFeedback } from "./bedrock/bedrockFeedback";
import { BedrockRiderGate } from "./bedrock/bedrockRiderGate";
import { registerModeTick } from "./bedrock/handlers/modeTick";
import { registerOutlineTick } from "./bedrock/handlers/outlineTick";
import { registerSessions } from "./bedrock/handlers/sessions";
import { registerTestCorner } from "./bedrock/handlers/testCorner";
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
  registerWand(
    new SetCorner(repo, gate, feedback),
    new ClearSelection(repo, gate, feedback),
  );
  registerModeTick(modes, gate);
  registerOutlineTick(new ShowOutline(repo, gate, feedback));
  registerSessions(repo);
  registerTestCorner(repo, gate, feedback, blocks);
  registerTestMode(modes);
  return { isInBuildMode: (playerId) => modes.isInBuildMode(playerId) };
}
