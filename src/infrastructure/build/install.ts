import { system } from "@minecraft/server";
import { AimHeight } from "../../application/build/aimHeight";
import { BackToAiming } from "../../application/build/backToAiming";
import { ChooseAdjustHeight } from "../../application/build/chooseAdjustHeight";
import { ChooseBoxStep } from "../../application/build/chooseBoxStep";
import { ChooseHeighted } from "../../application/build/chooseHeighted";
import { ChooseSideCylinder } from "../../application/build/chooseSideCylinder";
import { ChooseStairs } from "../../application/build/chooseStairs";
import { ChooseTerrain } from "../../application/build/chooseTerrain";
import { ClearSelection } from "../../application/build/clearSelection";
import { CloseBuildMenu } from "../../application/build/closeBuildMenu";
import { ConfirmHeighted } from "../../application/build/confirmHeighted";
import { ConfirmLiveHeight } from "../../application/build/confirmLiveHeight";
import { ConfirmShape } from "../../application/build/confirmShape";
import {
  ConfirmStairs,
  ConfirmTerrace,
} from "../../application/build/confirmStairs";
import { ConfirmTerrain } from "../../application/build/confirmTerrain";
import { CopyBox } from "../../application/build/copyBox";
import { CopySelection } from "../../application/build/copySelection";
import { CutBox } from "../../application/build/cutBox";
import { EditJobs } from "../../application/build/editJobs";
import { EndBuildSession } from "../../application/build/endBuildSession";
import { EndPasting } from "../../application/build/endPasting";
import { FixStairGoal } from "../../application/build/fixStairGoal";
import { LeaveBuild } from "../../application/build/leaveBuild";
import { NewCopy } from "../../application/build/newCopy";
import { OpenBuildMenu } from "../../application/build/openBuildMenu";
import { OpenSelectionMenu } from "../../application/build/openSelectionMenu";
import { PasteAt } from "../../application/build/pasteAt";
import { PressPasteAim } from "../../application/build/pressPasteAim";
import { PressUndo } from "../../application/build/pressUndo";
import { ResolvePasteTarget } from "../../application/build/resolvePasteTarget";
import { RotateBox } from "../../application/build/rotateBox";
import { RotatePasteAim } from "../../application/build/rotatePasteAim";
import { RotateSelection } from "../../application/build/rotateSelection";
import { SetHeightTo } from "../../application/build/setHeightTo";
import { SetPoint } from "../../application/build/setPoint";
import { ShowPreview } from "../../application/build/showPreview";
import { StepBackSelection } from "../../application/build/stepBackSelection";
import { SyncTapTarget } from "../../application/build/syncTapTarget";
import { TapAir } from "../../application/build/tapAir";
import { UndoEdit } from "../../application/build/undoEdit";
import { UpdateBuildModes } from "../../application/build/updateBuildModes";
import type { SpaceCheck } from "../../application/shared/ports/space";
import { BUILD_SPEC } from "../../domain/build/spec";
import { Debounces } from "../../domain/shared/debounce";
import type { PlayerId } from "../../domain/shared/ids";
import { consoleLogger } from "../shared/consoleLogger";
import { type AimOverride, BedrockAimReader } from "./bedrock/bedrockAimReader";
import { BedrockBlockWorld } from "./bedrock/bedrockBlockWorld";
import { BedrockBuildPlayers } from "./bedrock/bedrockBuildPlayers";
import { BedrockFacingReader } from "./bedrock/bedrockFacingReader";
import { BedrockFeedback } from "./bedrock/bedrockFeedback";
import { BedrockGroundProbe } from "./bedrock/bedrockGroundProbe";
import { BedrockStructureStore } from "./bedrock/bedrockStructureStore";
import { BedrockTapTargets } from "./bedrock/bedrockTapTargets";
import { BedrockBuildMenus } from "./bedrock/buildMenus";
import { registerEditTick } from "./bedrock/handlers/editTick";
import { registerModeTick } from "./bedrock/handlers/modeTick";
import { registerOutlineTick } from "./bedrock/handlers/outlineTick";
import { registerPasteControls } from "./bedrock/handlers/pasteControls";
import { registerSessions } from "./bedrock/handlers/sessions";
import { registerTapTarget } from "./bedrock/handlers/tapTarget";
import { registerWand } from "./bedrock/handlers/wand";
import type { BlockPressContext } from "./bedrock/handlers/wandPress";
import { InMemorySessionRepository } from "./persistence/inMemorySessionRepository";

export function installBuild(deps: {
  isProtected: SpaceCheck;
  isExcludedEntityType: (typeId: string) => boolean;
  uncopyableBlockTypes: readonly string[];
}) {
  const repo = new InMemorySessionRepository();
  const feedback = new BedrockFeedback();
  const ports = {
    blocks: new BedrockBlockWorld(deps),
    structures: new BedrockStructureStore(
      deps.isExcludedEntityType,
      deps.uncopyableBlockTypes,
    ),
  };
  const { blocks } = ports;
  const aimOverrides = new Map<PlayerId, AimOverride>();
  const aim = new BedrockAimReader(aimOverrides);
  const onPlayerLeave = new Set<(id: PlayerId) => void>();
  const tapTargets = new BedrockTapTargets();
  system.run(() => tapTargets.sweep());
  const resolveTarget = new ResolvePasteTarget(repo, new BedrockGroundProbe());
  const cancel = new BackToAiming(repo);
  const pasteDebounce = new Debounces<PlayerId>(BUILD_SPEC.pasteRepeatTicks);
  const undoDebounce = new Debounces<PlayerId>(BUILD_SPEC.pasteRepeatTicks);
  const rotateDebounce = new Debounces<PlayerId>(
    BUILD_SPEC.rotateDebounceTicks,
  );
  const debounce = new Debounces<PlayerId>(BUILD_SPEC.pressDebounceTicks);
  const endSession = new EndBuildSession(repo, ports.structures, tapTargets);
  const modes = new UpdateBuildModes(
    repo,
    new LeaveBuild(repo, ports.structures, tapTargets),
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
    chooseStairs: new ChooseStairs(repo, feedback),
    confirmTerrace: new ConfirmTerrace(repo, feedback, jobs),
    confirmStairs: new ConfirmStairs(repo, feedback, jobs),
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
  const preview = new ShowPreview(
    repo,
    feedback,
    aim,
    resolveTarget,
    new SyncTapTarget(blocks, tapTargets),
  );
  const menuCases = {
    chooseAdjustHeight: new ChooseAdjustHeight(repo, feedback),
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
  const pressUndo = new PressUndo(
    new StepBackSelection(repo, feedback),
    cases.undo,
  );
  const routes = registerPasteControls({
    pressUndo,
    undoDebounce,
    repo,
    aim,
    pressPasteAim,
    rotatePasteAim,
    rotateSelection: new RotateSelection(repo, rotateBox, feedback),
    pasteDebounce,
    rotateDebounce,
    refresh: (id, tick, reason) => preview.refresh(id, tick, reason),
  });
  const blockPressContext: BlockPressContext = {
    setPoint: new SetPoint(repo, blocks, feedback),
    aimHeight: cases.aimHeight,
    confirmLiveHeight: new ConfirmLiveHeight(repo),
    fixStairGoal: new FixStairGoal(repo, feedback, aim),
    repo,
    menus,
    aim,
    debounce,
  };
  registerWand({
    ...blockPressContext,
    tapAir: new TapAir(repo, feedback),
    pressPasteAim,
    pasteDebounce,
    refresh: (id, tick) => preview.refresh(id, tick),
    pointOf: (playerId) => {
      const flow = repo.get(playerId)?.flow;
      return flow?.kind === "point1" ? flow.cell : undefined;
    },
  });
  const pressTapTarget = registerTapTarget({
    ...blockPressContext,
    targets: tapTargets,
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
    (id) => {
      for (const listener of onPlayerLeave) listener(id);
    },
  );
  registerEditTick(jobs);
  return {
    repo,
    feedback,
    blocks,
    aim,
    aimOverrides,
    preview,
    tapTargets,
    pressTapTarget,
    modes,
    routes,
    menuCases,
    pressPasteAim,
    pressUndo,
    endSession,
    structures: ports.structures,
    rotatePasteAim,
    onPlayerLeave,
  };
}
