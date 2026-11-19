import { AimHeight } from "../../application/build/aimHeight";
import { CancelFlow } from "../../application/build/cancelFlow";
import { ChooseAdjustHeight } from "../../application/build/chooseAdjustHeight";
import { ChooseBoxStep } from "../../application/build/chooseBoxStep";
import { ChooseHeighted } from "../../application/build/chooseHeighted";
import { ChooseSideCylinder } from "../../application/build/chooseSideCylinder";
import { ChooseTerrain } from "../../application/build/chooseTerrain";
import { ClearSelection } from "../../application/build/clearSelection";
import { CloseBuildMenu } from "../../application/build/closeBuildMenu";
import { ConfirmHeighted } from "../../application/build/confirmHeighted";
import { ConfirmLiveHeight } from "../../application/build/confirmLiveHeight";
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
import { OpenBuildMenu } from "../../application/build/openBuildMenu";
import { OpenSelectionMenu } from "../../application/build/openSelectionMenu";
import { PasteAt } from "../../application/build/pasteAt";
import { PressPasteAim } from "../../application/build/pressPasteAim";
import { ResolvePasteTarget } from "../../application/build/resolvePasteTarget";
import { RotateBox } from "../../application/build/rotateBox";
import { RotatePasteAim } from "../../application/build/rotatePasteAim";
import { RotateSelection } from "../../application/build/rotateSelection";
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
import { BedrockFacingReader } from "./bedrock/bedrockFacingReader";
import { BedrockFeedback } from "./bedrock/bedrockFeedback";
import { BedrockGroundProbe } from "./bedrock/bedrockGroundProbe";
import { BedrockStructureStore } from "./bedrock/bedrockStructureStore";
import { BedrockBuildMenus } from "./bedrock/buildMenus";
import { registerEditTick } from "./bedrock/handlers/editTick";
import { registerModeTick } from "./bedrock/handlers/modeTick";
import { registerOutlineTick } from "./bedrock/handlers/outlineTick";
import { registerPasteControls } from "./bedrock/handlers/pasteControls";
import { registerSessions } from "./bedrock/handlers/sessions";
import { TestAimReader } from "./bedrock/handlers/testAim";
import { registerTestTap } from "./bedrock/handlers/testCorner";
import { recordMessages, registerTestEdit } from "./bedrock/handlers/testEdit";
import { registerTestMode } from "./bedrock/handlers/testMode";
import { registerTestPress } from "./bedrock/handlers/testPress";
import { registerWand } from "./bedrock/handlers/wand";
import { MenuChoices } from "./bedrock/menuChoices";
import { InMemorySessionRepository } from "./persistence/inMemorySessionRepository";

export function installBuild(deps: {
  isProtected: SpaceCheck;
  isExcludedEntityType: (typeId: string) => boolean;
  uncopyableBlockTypes: readonly string[];
}): void {
  const repo = new InMemorySessionRepository();
  const recorded = recordMessages(new BedrockFeedback());
  const feedback = recorded.feedback;
  const ports = {
    blocks: new BedrockBlockWorld(deps),
    structures: new BedrockStructureStore(
      deps.isExcludedEntityType,
      deps.uncopyableBlockTypes,
    ),
  };
  const { blocks } = ports;
  const aim = new TestAimReader(new BedrockAimReader());
  const resolveTarget = new ResolvePasteTarget(repo, new BedrockGroundProbe());
  const cancel = new CancelFlow(repo);
  const pasteDebounce = new PressDebounces<PlayerId>(
    BUILD_SPEC.pasteRepeatTicks,
  );
  const undoDebounce = new PressDebounces<PlayerId>(
    BUILD_SPEC.pasteRepeatTicks,
  );
  const rotateDebounce = new PressDebounces<PlayerId>(
    BUILD_SPEC.rotateDebounceTicks,
  );
  const debounce = new PressDebounces<PlayerId>(BUILD_SPEC.pressDebounceTicks);
  const endSession = new EndBuildSession(repo, ports.structures);
  const modes = new UpdateBuildModes(
    repo,
    new LeaveBuild(repo, ports.structures),
  );
  const players = new BedrockBuildPlayers();
  const facing = new BedrockFacingReader();
  const jobs = new EditJobs(
    repo,
    blocks,
    feedback,
    consoleLogger,
    players,
    ports.structures,
  );
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
  };
  const chooseHeighted = new ChooseHeighted(repo, feedback);
  const cases = {
    chooseBoxStep: new ChooseBoxStep(repo, actions, feedback, facing),
    fill: new ConfirmShape(repo, feedback, jobs),
    copy: new CopySelection(repo, copyBox, feedback, facing),
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
  const preview = new ShowPreview(repo, feedback, aim, resolveTarget);
  const menuCases = {
    chooseAdjustHeight: new ChooseAdjustHeight(repo),
    openSelectionMenu: new OpenSelectionMenu(repo),
    openBuildMenu: new OpenBuildMenu(repo, preview),
    closeBuildMenu: new CloseBuildMenu(repo, preview),
    ...cases,
    confirmShape: cases.fill,
    cancel,
    setHeight: new SetHeightTo(repo),
  };
  const menus = new BedrockBuildMenus(repo, menuCases);
  const pressPasteAim = new PressPasteAim(
    repo,
    cases.pasteAt,
    feedback,
    resolveTarget,
  );
  const rotatePasteAim = new RotatePasteAim(repo, feedback);
  const routes = registerPasteControls({
    undo: cases.undo,
    undoDebounce,
    repo,
    aim,
    pressPasteAim,
    rotatePasteAim,
    rotateSelection: new RotateSelection(repo, rotateBox, feedback),
    pasteDebounce,
    rotateDebounce,
    refresh: (id, tick) => preview.refresh(id, tick),
  });
  registerWand({
    setPoint: new SetPoint(repo, blocks, feedback),
    tapAir: new TapAir(repo, feedback),
    pressPasteAim,
    aimHeight: cases.aimHeight,
    confirmLiveHeight: new ConfirmLiveHeight(repo, feedback),
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
  registerOutlineTick(preview);
  registerSessions(
    endSession,
    cases.endPasting,
    debounce,
    pasteDebounce,
    rotateDebounce,
    undoDebounce,
  );
  registerTestTap(
    repo,
    feedback,
    blocks,
    menuCases.openSelectionMenu,
    aim,
    cases.aimHeight,
  );
  registerTestMode(modes, repo);
  registerEditTick(jobs);
  const describe = new DescribeBuild(repo);
  registerTestPress(routes, describe, recorded);
  registerTestEdit(
    new MenuChoices(repo, menuCases),
    menuCases.setHeight,
    pressPasteAim,
    cases.undo,
    describe,
    recorded,
    repo,
    endSession,
    ports.structures,
    rotatePasteAim,
    { aim, preview },
  );
}
