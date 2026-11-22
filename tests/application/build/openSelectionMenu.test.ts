import { expect, it } from "vitest";
import { OpenSelectionMenu } from "../../../src/application/build/openSelectionMenu";
import { AIR } from "../../../src/domain/build/blockState";
import { tapAir, tapBlock } from "../../../src/domain/build/flow/flow";
import { shapeMenu } from "../../../src/domain/build/flow/menu";
import { asPlayerId } from "../../../src/domain/shared/ids";
import { FakeSessions, overworld } from "./fakes";

it("clears a line's undo target when its root menu first opens", () => {
  const repo = new FakeSessions();
  const playerId = asPlayerId("alex");
  const session = repo.getOrCreate(playerId);
  const from = { x: 0, y: 60, z: 0 };
  const point = tapBlock({ kind: "idle" }, overworld, from, AIR);
  const line = tapAir(point, { ...from, x: 2 });
  expect(line).toHaveProperty("stepBackTo", point);
  session.setFlow(line);

  const menu = new OpenSelectionMenu(repo);
  expect(menu.execute({ playerId })).toEqual(shapeMenu(line));
  const opened = session.flow;
  expect(opened).not.toHaveProperty("stepBackTo");
  expect(menu.execute({ playerId })).toEqual(shapeMenu(line));
  expect(session.flow).toBe(opened);
});
