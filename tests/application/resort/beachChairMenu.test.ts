import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { BeachChairMenu } from "../../../src/application/resort/beachChairMenu";
import { SwitchBeachChairForm } from "../../../src/application/resort/switchBeachChairForm";
import type { ChairState } from "../../../src/domain/resort/beachChair";
import { asBeachChairId } from "../../../src/domain/resort/ids";
import { asPlayerId } from "../../../src/domain/shared/ids";

const cmd = { id: asBeachChairId("chair"), player: asPlayerId("player") };
const states: fc.Arbitrary<ChairState> = fc.record({
  form: fc.constantFrom("chair", "table"),
  occupied: fc.boolean(),
  somethingOnTop: fc.boolean(),
});
it("applies only valid form transitions and reports occupancy or contents refusals", () => {
  fc.assert(
    fc.property(states, fc.boolean(), (state, folding) => {
      const world = {
        state: () => state,
        setForm: vi.fn(),
        showRefused: vi.fn(),
      };
      const form = new SwitchBeachChairForm(world);
      const correctForm = state.form === (folding ? "chair" : "table");
      const refused = folding ? state.occupied : state.somethingOnTop;
      expect(folding ? form.fold(cmd) : form.unfold(cmd)).toBe(
        correctForm && !refused,
      );
      expect(world.setForm.mock.calls).toEqual(
        correctForm && !refused ? [[cmd.id, folding ? "table" : "chair"]] : [],
      );
      expect(world.showRefused.mock.calls).toEqual(
        correctForm && refused
          ? [[cmd.player, folding ? "occupied" : "somethingOnTop"]]
          : [],
      );
    }),
  );
});
it("ignores a vanished chair and routes each menu choice once", () => {
  const world = {
    state: vi.fn<() => ChairState | undefined>(() => undefined),
    setForm: vi.fn(),
    showRefused: vi.fn(),
  };
  const form = new SwitchBeachChairForm(world);
  expect(form.fold(cmd)).toBe(false);
  expect(form.unfold(cmd)).toBe(false);
  expect(world.setForm).not.toHaveBeenCalled();
  const fold = vi.spyOn(form, "fold");
  const lie = vi.fn();
  const menu = new BeachChairMenu(form, lie);
  menu.choose("lie_down", cmd);
  expect(lie).toHaveBeenCalledExactlyOnceWith(cmd);
  expect(fold).not.toHaveBeenCalled();
  menu.choose("fold", cmd);
  expect(fold).toHaveBeenCalledExactlyOnceWith(cmd);
  expect(lie).toHaveBeenCalledTimes(1);
});
