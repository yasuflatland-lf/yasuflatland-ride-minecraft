import { AimHeight } from "../../application/build/aimHeight";
import { CancelFlow } from "../../application/build/cancelFlow";
import { ChooseBoxStep } from "../../application/build/chooseBoxStep";
import { ChooseHeighted } from "../../application/build/chooseHeighted";
import { ChooseSideCylinder } from "../../application/build/chooseSideCylinder";
import { ChooseTerrain } from "../../application/build/chooseTerrain";
import { ClearSelection } from "../../application/build/clearSelection";
import { ConfirmBoxStep } from "../../application/build/confirmBoxStep";
import { ConfirmHeighted } from "../../application/build/confirmHeighted";
import { ConfirmShape } from "../../application/build/confirmShape";
import { ConfirmTerrain } from "../../application/build/confirmTerrain";
import { CopyBox } from "../../application/build/copyBox";
import { CopySelection } from "../../application/build/copySelection";
import { CutBox } from "../../application/build/cutBox";
import { DescribeBuild } from "../../application/build/describeBuild";
import { EditJobs } from "../../application/build/editJobs";
import { EndBuildSession } from "../../application/build/endBuildSession";
import { EndPasting } from "../../application/build/endPasting";
import { LeaveBuild } from "../../application/build/leaveBuild";
import { NewCopy } from "../../application/build/newCopy";
import { PasteAt } from "../../application/build/pasteAt";
import { PressPasteAim } from "../../application/build/pressPasteAim";
import { RotateBox } from "../../application/build/rotateBox";
import { RotateBoxAction } from "../../application/build/rotateBoxAction";
import { RotatePasteAim } from "../../application/build/rotatePasteAim";
import { SetHeightTo } from "../../application/build/setHeightTo";
import { SetPoint } from "../../application/build/setPoint";
import { ShowPreview } from "../../application/build/showPreview";
import { TapAir } from "../../application/build/tapAir";
import { UndoEdit } from "../../application/build/undoEdit";
import { UpdateBuildModes } from "../../application/build/updateBuildModes";
import type { SpaceCheck } from "../../application/shared/ports/space";
import { PressDebounces } from "../../domain/build/pressDebounce";
import { BUILD_SPEC } from "../../domain/build/spec";
import type { PlayerId } from "../../domain/shared/ids";
import { consoleLogger } from "../shared/consoleLogger";
import { BedrockAimReader } from "./bedrock/bedrockAimReader";
import { BedrockBlockWorld } from "./bedrock/bedrockBlockWorld";
import { BedrockBuildPlayers } from "./bedrock/bedrockBuildPlayers";
import { BedrockFeedback } from "./bedrock/bedrockFeedback";
import { BedrockStructureStore } from "./bedrock/bedrockStructureStore";
import { BedrockBuildMenus } from "./bedrock/buildMenus";
import { registerEditTick } from "./bedrock/handlers/editTick";
import { registerModeTick } from "./bedrock/handlers/modeTick";
import { registerOutlineTick } from "./bedrock/handlers/outlineTick";
import { registerSessions } from "./bedrock/handlers/sessions";
import { registerTestTap } from "./bedrock/handlers/testCorner";
import { recordMessages, registerTestEdit } from "./bedrock/handlers/testEdit";
import { registerTestMode } from "./bedrock/handlers/testMode";
import { registerWand } from "./bedrock/handlers/wand";
import { MenuChoices } from "./bedrock/menuChoices";
import { InMemorySessionRepository } from "./persistence/inMemorySessionRepository";

export function installBuild(deps: {
  isProtected: SpaceCheck;
  isExcludedEntityType: (typeId: string) => boolean;
}): void {
  const repo = new InMemorySessionRepository();
  const recorded = recordMessages(new BedrockFeedback());
  const feedback = recorded.feedback;
  const ports = {
    blocks: new BedrockBlockWorld(deps),
    structures: new BedrockStructureStore(deps.isExcludedEntityType),
  };
  const { blocks } = ports;
  const aim = new BedrockAimReader();
  const cancel = new CancelFlow(repo);
  const pasteDebounce = new PressDebounces<PlayerId>(
    BUILD_SPEC.pasteRepeatTicks,
  );
  const debounce = new PressDebounces<PlayerId>(BUILD_SPEC.pressDebounceTicks);
  const endSession = new EndBuildSession(repo, ports.structures);
  const modes = new UpdateBuildModes(
    repo,
    new LeaveBuild(repo, ports.structures),
  );
  const players = new BedrockBuildPlayers();
  const jobs = new EditJobs(repo, blocks, feedback, consoleLogger, players);
  const clear = new ClearSelection(repo, feedback);
  const copyBox = new CopyBox(repo, ports.structures, feedback);
  const cutBox = new CutBox(
    repo,
    blocks,
    ports.structures,
    feedback,
    consoleLogger,
  );
  const rotateBox = new RotateBox(
    repo,
    blocks,
    players,
    ports.structures,
    feedback,
    consoleLogger,
  );
  const actions = {
    copy: copyBox,
    cut: cutBox,
    rotate: new RotateBoxAction(repo, rotateBox),
  };
  const chooseHeighted = new ChooseHeighted(repo, feedback);
  const cases = {
    chooseBoxStep: new ChooseBoxStep(repo, actions, feedback),
    confirmBoxStep: new ConfirmBoxStep(repo, actions, feedback),
    fill: new ConfirmShape(repo, feedback, jobs),
    copy: new CopySelection(repo, copyBox, feedback),
    endPasting: new EndPasting(repo, ports.structures),
    newCopy: new NewCopy(repo),
    pasteAt: new PasteAt(repo, blocks, feedback, ports.structures, players),
    chooseHeighted,
    chooseSideCylinder: new ChooseSideCylinder(
      repo,
      feedback,
      aim,
      chooseHeighted,
    ),
    aimHeight: new AimHeight(repo),
    confirmHeighted: new ConfirmHeighted(repo, feedback, jobs),
    chooseTerrain: new ChooseTerrain(repo, feedback),
    confirmTerrain: new ConfirmTerrain(repo, feedback, jobs, blocks),
    undo: new UndoEdit(
      repo,
      feedback,
      jobs,
      blocks,
      ports.structures,
      consoleLogger,
    ),
    clear,
  };
  const menuCases = {
    ...cases,
    confirmShape: cases.fill,
    cancel,
    setHeight: new SetHeightTo(repo),
  };
  const rotate = new RotatePasteAim(repo);
  const menus = new BedrockBuildMenus(repo, menuCases);
  registerWand({
    setPoint: new SetPoint(repo, blocks, feedback),
    tapAir: new TapAir(repo, feedback),
    pressPasteAim: new PressPasteAim(repo, cases.pasteAt, feedback),
    aimHeight: cases.aimHeight,
    confirmBoxStep: cases.confirmBoxStep,
    repo,
    menus,
    aim,
    debounce,
    pasteDebounce,
    pointOf: (playerId) => {
      const flow = repo.get(playerId)?.flow;
      return flow?.kind === "point1" ? flow.cell : undefined;
    },
  });
  registerModeTick(modes);
  registerOutlineTick(new ShowPreview(repo, feedback, aim));
  registerSessions(endSession, cases.endPasting, debounce, pasteDebounce);
  registerTestTap(repo, feedback, blocks);
  registerTestMode(modes, repo);
  registerEditTick(jobs);
  registerTestEdit(
    new MenuChoices(repo, menuCases),
    menuCases.setHeight,
    menuCases.confirmBoxStep,
    new PressPasteAim(repo, cases.pasteAt, feedback),
    cases.undo,
    new DescribeBuild(repo),
    recorded,
    repo,
    endSession,
    ports.structures,
    rotate,
  );
}
