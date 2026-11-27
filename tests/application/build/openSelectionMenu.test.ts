import { expect, it } from "vitest";
import { OpenSelectionMenu } from "../../../src/application/build/openSelectionMenu";
import { AIR } from "../../../src/domain/build/blockState";
import { shapeMenu } from "../../../src/domain/build/flow/menu";
import { cellOf } from "../../../src/domain/shared/cells";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { tapAir, tapBlock } from "../../support/buildSelection";
import { FakeSessions, overworld } from "./fakes";

it("clears a line's undo target when its root menu first opens", () => {
  const repo = new FakeSessions();
  const playerId = asPlayerId("alex");
  const session = repo.getOrCreate(playerId);
  const from = cellOf({ x: 0, y: 60, z: 0 });
  const point = tapBlock({ kind: "idle" }, overworld, from, AIR);
  const line = tapAir(point, cellOf({ ...from, x: 2 }));
  expect(line).toHaveProperty("freshEnd", true);
  session.setFlowForTest(line);

  const menu = new OpenSelectionMenu(repo);
  expect(menu.execute({ playerId })).toEqual(shapeMenu(line));
  const opened = session.flow;
  expect(opened).not.toHaveProperty("freshEnd");
  expect(opened).toHaveProperty("rootShown", true);
  expect(menu.execute({ playerId })).toEqual(shapeMenu(line));
  expect(session.flow).toEqual(opened);
});
