import { expect, it, vi } from "vitest";
import { PaintParasol } from "../../../src/application/resort/paintParasol";
import { Repaint } from "../../../src/application/shared/repaint";
import { asParasolId } from "../../../src/domain/resort/ids";
import { asPlayerId } from "../../../src/domain/shared/ids";
import type { Paint } from "../../../src/domain/shared/paint";

it("keeps same-color dye and restores the white default", () => {
  let current: Paint = "khaki";
  const consumeDye = vi.fn();
  const setPaint = vi.fn((_id, paint: Paint) => {
    current = paint;
  });
  const paint = new PaintParasol(
    new Repaint({
      paintOf: () => current,
      defaultPaintOf: () => "white",
      setPaint,
      consumeDye,
      playPaintSound: vi.fn(),
      isCreative: () => false,
    }),
  );
  const cmd = {
    playerId: asPlayerId("player"),
    parasolId: asParasolId("parasol"),
    tick: 1,
  };
  expect(paint.execute({ ...cmd, paint: "white" })).toBe(false);
  expect(consumeDye).not.toHaveBeenCalled();
  expect(paint.execute({ ...cmd, paint: "red" })).toBe(true);
  expect(paint.execute({ ...cmd, tick: 2, paint: "white" })).toBe(true);
  expect(setPaint).toHaveBeenLastCalledWith(cmd.parasolId, "white");
  expect(consumeDye).toHaveBeenCalledTimes(2);
});
