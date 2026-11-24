import { vi } from "vitest";
import { ChooseBoxStep } from "../../../../src/application/build/chooseBoxStep";
import { ChooseHeighted } from "../../../../src/application/build/chooseHeighted";
import { ChooseSideCylinder } from "../../../../src/application/build/chooseSideCylinder";
import { ChooseStairs } from "../../../../src/application/build/chooseStairs";
import { ChooseTerrain } from "../../../../src/application/build/chooseTerrain";
import { ClearSelection } from "../../../../src/application/build/clearSelection";
import { CopyBox } from "../../../../src/application/build/copyBox";
import { CutBox } from "../../../../src/application/build/cutBox";
import { EndPasting } from "../../../../src/application/build/endPasting";
import { MenuChoices } from "../../../../src/application/build/menuChoices";
import { OpenSelectionMenu } from "../../../../src/application/build/openSelectionMenu";
import { blockStateOf } from "../../../../src/domain/build/blockState";
import { boxOf } from "../../../../src/domain/build/box";
import type { BuildFlow } from "../../../../src/domain/build/flow/state";
import { selectionOf } from "../../../../src/domain/build/selection";
import { type Cell, cellOf } from "../../../../src/domain/shared/cells";
import { asPlayerId } from "../../../../src/domain/shared/ids";
import { tappedSelection } from "../../../support/buildSelection";
import { FakeFeedback, FakeSessions, FakeWorld, overworld } from "../fakes";
import { FakeStructureStore } from "./structureStore";

export const playerId = asPlayerId("p");
export const stone = blockStateOf("minecraft:stone");
export const from = cellOf({ x: 0, y: 60, z: 0 });
export const to = cellOf({ x: 4, y: 60, z: 6 });
export function selected(
  from: Cell,
  to: Cell,
  menuLevel: "root" | "build" = "root",
): BuildFlow {
  return {
    kind: "selected",
    menuLevel,
    ...tappedSelection(
      selectionOf(overworld, boxOf(from, to), stone),
      from,
      to,
    ),
  };
}
export const endpoint = selected(from, to);

export function menuCasesFor(repo: FakeSessions, world = new FakeWorld()) {
  return {
    openSelectionMenu: {
      execute: vi.fn((cmd) => new OpenSelectionMenu(repo).execute(cmd)),
    },
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
        new ChooseHeighted(repo, new FakeFeedback(), world).execute(cmd),
      ),
    },
    chooseSideCylinder: {
      execute: vi.fn((cmd) =>
        new ChooseSideCylinder(
          repo,
          new FakeFeedback(),
          { aim: () => undefined },
          new ChooseHeighted(repo, new FakeFeedback(), world),
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
        new ChooseTerrain(repo, new FakeFeedback(), world).execute(cmd),
      ),
    },
    confirmTerrain: { execute: vi.fn() },
    copy: { execute: vi.fn() },
    endPasting: {
      execute: vi.fn((cmd) => new EndPasting(repo).execute(cmd)),
    },
    undo: { execute: vi.fn() },
    clear: {
      execute: vi.fn((cmd) =>
        new ClearSelection(repo, new FakeFeedback()).execute(cmd),
      ),
    },
  };
}

export function setupMenuChoices() {
  const repo = new FakeSessions();
  const session = repo.getOrCreate(playerId);
  session.setFlowForTest(endpoint);
  const world = new FakeWorld();
  const cases = menuCasesFor(repo, world);
  const refresh = vi.fn();
  const feedback = new FakeFeedback();
  const choices = new MenuChoices(repo, cases, {
    blocks: world,
    feedback,
    refresh,
  });
  return { repo, world, session, cases, choices, refresh, feedback };
}
