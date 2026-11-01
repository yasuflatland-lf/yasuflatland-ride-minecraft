import { AimHeight } from "../../application/build/aimHeight";
import { CancelFlow } from "../../application/build/cancelFlow";
import { ChooseCopy } from "../../application/build/chooseCopy";
import { ChooseHeighted } from "../../application/build/chooseHeighted";
import { ClearSelection } from "../../application/build/clearSelection";
import { ConfirmCopyHeight } from "../../application/build/confirmCopyHeight";
import { ConfirmHeighted } from "../../application/build/confirmHeighted";
import { ConfirmShape } from "../../application/build/confirmShape";
import { CopyBox } from "../../application/build/copyBox";
import { CopySelection } from "../../application/build/copySelection";
import { DescribeBuild } from "../../application/build/describeBuild";
import { EditJobs } from "../../application/build/editJobs";
import { EndPasting } from "../../application/build/endPasting";
import { LeaveBuild } from "../../application/build/leaveBuild";
import { PasteAt } from "../../application/build/pasteAt";
import { PressPasteAim } from "../../application/build/pressPasteAim";
import { SetHeightTo } from "../../application/build/setHeightTo";
import { SetPoint } from "../../application/build/setPoint";
import { ShowPreview } from "../../application/build/showPreview";
import { StartPaste } from "../../application/build/startPaste";
import { TapAir } from "../../application/build/tapAir";
import { ToggleSkipAir } from "../../application/build/toggleSkipAir";
import { UndoEdit } from "../../application/build/undoEdit";
import { UpdateBuildModes } from "../../application/build/updateBuildModes";
import type { SpaceCheck } from "../../application/shared/ports/space";
import { BUILD_SPEC } from "../../domain/build/spec";
import type { PlayerId } from "../../domain/shared/ids";
import { PressDebounces } from "../../domain/shared/pressDebounce";
import { BedrockAimReader } from "./bedrock/bedrockAimReader";
import { BedrockBlockWorld } from "./bedrock/bedrockBlockWorld";
import { BedrockFeedback } from "./bedrock/bedrockFeedback";
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

export function installBuild(deps: { isProtected: SpaceCheck }): void {
  const repo = new InMemorySessionRepository();
  const recorded = recordMessages(new BedrockFeedback());
  const feedback = recorded.feedback;
  const blocks = new BedrockBlockWorld(deps);
  const aim = new BedrockAimReader();
  const cancel = new CancelFlow(repo);
  const debounce = new PressDebounces<PlayerId>(BUILD_SPEC.pressDebounceTicks);
  const modes = new UpdateBuildModes(repo, new LeaveBuild(repo));
  const jobs = new EditJobs(repo, blocks, feedback);
  const clear = new ClearSelection(repo, feedback);
  const copyBox = new CopyBox(repo, blocks, feedback);
  const cases = {
    chooseCopy: new ChooseCopy(repo, copyBox, feedback),
    confirmCopyHeight: new ConfirmCopyHeight(repo, copyBox, feedback),
    fill: new ConfirmShape(repo, feedback, jobs),
    copy: new CopySelection(repo, copyBox, feedback),
    paste: new StartPaste(repo),
    toggleSkipAir: new ToggleSkipAir(repo),
    endPasting: new EndPasting(repo),
    pasteAt: new PasteAt(repo, blocks, feedback, jobs),
    chooseHeighted: new ChooseHeighted(repo, feedback),
    aimHeight: new AimHeight(repo),
    confirmHeighted: new ConfirmHeighted(repo, feedback, jobs),
    undo: new UndoEdit(repo, feedback, jobs),
    clear,
  };
  const menuCases = {
    ...cases,
    confirmShape: cases.fill,
    cancel,
    setHeight: new SetHeightTo(repo),
  };
  const menus = new BedrockBuildMenus(repo, menuCases);
  registerWand({
    setPoint: new SetPoint(repo, blocks, feedback),
    tapAir: new TapAir(repo, feedback),
    pressPasteAim: new PressPasteAim(repo, cases.pasteAt, feedback),
    aimHeight: cases.aimHeight,
    confirmCopyHeight: cases.confirmCopyHeight,
    repo,
    menus,
    aim,
    debounce,
    pointOf: (playerId) => {
      const flow = repo.get(playerId)?.flow;
      return flow?.kind === "point1" ? flow.cell : undefined;
    },
  });
  registerModeTick(modes);
  registerOutlineTick(new ShowPreview(repo, feedback, aim));
  registerSessions(repo, cases.endPasting, debounce);
  registerTestTap(repo, feedback, blocks);
  registerTestMode(modes, repo);
  registerEditTick(jobs);
  registerTestEdit(
    new MenuChoices(repo, menuCases),
    menuCases.setHeight,
    menuCases.confirmCopyHeight,
    cases.pasteAt,
    cases.undo,
    new DescribeBuild(repo),
    recorded,
    repo,
  );
}
