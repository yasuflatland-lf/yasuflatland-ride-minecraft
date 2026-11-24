import { vi } from "vitest";
import { BackToAiming } from "../../../../src/application/build/backToAiming";
import { ChooseBoxStep } from "../../../../src/application/build/chooseBoxStep";
import { ChooseHeighted } from "../../../../src/application/build/chooseHeighted";
import { ChooseSideCylinder } from "../../../../src/application/build/chooseSideCylinder";
import { ChooseStairs } from "../../../../src/application/build/chooseStairs";
import { ChooseTerrain } from "../../../../src/application/build/chooseTerrain";
import { ClearSelection } from "../../../../src/application/build/clearSelection";
import { CloseBuildMenu } from "../../../../src/application/build/closeBuildMenu";
import { CopyBox } from "../../../../src/application/build/copyBox";
import { CutBox } from "../../../../src/application/build/cutBox";
import { EndPasting } from "../../../../src/application/build/endPasting";
import { MenuChoices } from "../../../../src/application/build/menuChoices";
import { NewCopy } from "../../../../src/application/build/newCopy";
import { OpenBuildMenu } from "../../../../src/application/build/openBuildMenu";
import { OpenSelectionMenu } from "../../../../src/application/build/openSelectionMenu";
import { SetHeightTo } from "../../../../src/application/build/setHeightTo";
import { blockStateOf } from "../../../../src/domain/build/blockState";
import { boxOf } from "../../../../src/domain/build/box";
import type { BuildFlow } from "../../../../src/domain/build/flow/state";
import { selectionOf } from "../../../../src/domain/build/selection";
import type { Cell } from "../../../../src/domain/shared/cells";
import { asPlayerId } from "../../../../src/domain/shared/ids";
import { FakeFeedback, FakeSessions, FakeWorld, overworld } from "../fakes";
import { FakeStructureStore } from "./structureStore";

export const playerId = asPlayerId("p");
export const stone = blockStateOf("minecraft:stone");
export const from = { x: 0, y: 60, z: 0 };
export const to = { x: 4, y: 60, z: 6 };
export function selected(
  from: Cell,
  to: Cell,
  menuLevel: "root" | "build" = "root",
): BuildFlow {
  return {
    kind: "selected",
    menuLevel,
    selection: selectionOf(overworld, boxOf(from, to), stone),
    from,
    to,
  };
}
export const endpoint = selected(from, to);

export function menuCasesFor(repo: FakeSessions) {
  const preview = { refresh: vi.fn() };
  return {
    openSelectionMenu: {
      execute: vi.fn((cmd) => new OpenSelectionMenu(repo).execute(cmd)),
    },
    openBuildMenu: {
      execute: vi.fn((cmd) => new OpenBuildMenu(repo, preview).execute(cmd)),
    },
    closeBuildMenu: {
      execute: vi.fn((cmd) => new CloseBuildMenu(repo, preview).execute(cmd)),
    },
    chooseAdjustHeight: { execute: vi.fn() },
    chooseBoxStep: {
      execute: vi.fn((cmd) =>
        new ChooseBoxStep(
          repo,
          {
            copy: new CopyBox(
              repo,
              new FakeStructureStore(),
              new FakeFeedback(),
            ),
            cut: new CutBox(
              repo,
              new FakeWorld(),
              new FakeStructureStore(),
              new FakeFeedback(),
              { warn: () => {} },
            ),
          },
          new FakeFeedback(),
          { facingOf: () => "east" },
        ).execute(cmd),
      ),
    },
    confirmShape: { execute: vi.fn() },
    chooseHeighted: {
      execute: vi.fn((cmd) =>
        new ChooseHeighted(repo, new FakeFeedback()).execute(cmd),
      ),
    },
    chooseSideCylinder: {
      execute: vi.fn((cmd) =>
        new ChooseSideCylinder(
          repo,
          new FakeFeedback(),
          { aim: () => undefined },
          new ChooseHeighted(repo, new FakeFeedback()),
        ).execute(cmd),
      ),
    },
    confirmHeighted: { execute: vi.fn() },
    chooseStairs: {
      execute: vi.fn((cmd) =>
        new ChooseStairs(repo, new FakeFeedback()).execute(cmd),
      ),
    },
    confirmTerrace: { execute: vi.fn() },
    confirmStairs: { execute: vi.fn() },
    chooseTerrain: {
      execute: vi.fn((cmd) =>
        new ChooseTerrain(repo, new FakeFeedback()).execute(cmd),
      ),
    },
    confirmTerrain: { execute: vi.fn() },
    cancel: {
      backToAiming: vi.fn((cmd) => new BackToAiming(repo).backToAiming(cmd)),
    },
    copy: { execute: vi.fn() },
    newCopy: { execute: vi.fn((id) => new NewCopy(repo).execute(id)) },
    endPasting: {
      execute: vi.fn((cmd) =>
        new EndPasting(repo, new FakeStructureStore()).execute(cmd),
      ),
    },
    undo: { execute: vi.fn() },
    clear: {
      execute: vi.fn((cmd) =>
        new ClearSelection(repo, new FakeFeedback()).execute(cmd),
      ),
    },
    setHeight: {
      execute: vi.fn((cmd) => new SetHeightTo(repo).execute(cmd)),
    },
  };
}

export function setupMenuChoices() {
  const repo = new FakeSessions();
  const session = repo.getOrCreate(playerId);
  session.setFlow(endpoint);
  const cases = menuCasesFor(repo);
  return { repo, session, cases, choices: new MenuChoices(repo, cases) };
}
