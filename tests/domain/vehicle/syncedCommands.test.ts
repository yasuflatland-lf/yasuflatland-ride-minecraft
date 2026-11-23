import fc from "fast-check";
import { expect, it } from "vitest";
import type { EngineCommand } from "../../../src/domain/vehicle/drive";
import { SyncedCommands } from "../../../src/domain/vehicle/syncedCommands";

interface Values {
  form: "car" | "hover";
  bank: number;
  gearDown: boolean;
}

const values = fc.record({
  form: fc.constantFrom("car" as const, "hover" as const),
  bank: fc.integer({ min: -3, max: 3 }),
  gearDown: fc.boolean(),
});

const property = (
  name: string,
  value: string | number | boolean,
): EngineCommand => ({ type: "setProperty", name, value });

const formCommands = (form: Values["form"]): EngineCommand[] => [
  { type: "triggerEvent", name: form === "car" ? "gravity_on" : "gravity_off" },
  property("form", form),
];

it("resends exactly the latest value of every latch in order after a failed send", () => {
  fc.assert(
    fc.property(
      values,
      fc.array(values, { maxLength: 80 }),
      values,
      fc.option(values, { nil: undefined }),
      fc.nat(),
      (initial, history, next, updated, failAfter) => {
        const group = new SyncedCommands<Values>()
          .add((v) => v.form, formCommands, { value: initial.form })
          .add(
            (v) => v.bank,
            (v) => property("bank", v),
          )
          .add(
            (v) => v.gearDown,
            (v) => property("gear_down", v),
          );
        const entity = new Map<string, string | number | boolean>([
          ["form", initial.form],
        ]);
        const send = (commands: EngineCommand[], limit = commands.length) => {
          for (const command of commands.slice(0, limit)) {
            if (command.type === "setProperty")
              entity.set(command.name, command.value);
          }
        };

        const first = group.next(initial);
        expect(first).toEqual([
          property("bank", initial.bank),
          property("gear_down", initial.gearDown),
        ]);
        send(first);
        for (const current of history) send(group.next(current));
        const previous = history.at(-1) ?? initial;
        const failed = { ...next, gearDown: !previous.gearDown };
        const partial = group.next(failed);
        expect(partial.length).toBeGreaterThan(0);
        send(partial, failAfter % partial.length);
        group.resync();

        const latest = updated ?? failed;
        const retry = group.next(latest);
        expect(retry).toEqual([
          ...formCommands(latest.form),
          property("bank", latest.bank),
          property("gear_down", latest.gearDown),
        ]);
        send(retry);
        expect(entity).toEqual(
          new Map<string, string | number | boolean>([
            ["form", latest.form],
            ["bank", latest.bank],
            ["gear_down", latest.gearDown],
          ]),
        );
        expect(group.next(latest)).toEqual([]);
      },
    ),
  );
});

it("keeps omitted latches pending until their send pass", () => {
  fc.assert(
    fc.property(values, ({ bank, gearDown }) => {
      const group = new SyncedCommands<Partial<Values>>()
        .add(
          (v) => v.bank,
          (v) => property("bank", v),
          { value: bank },
        )
        .add(
          (v) => v.gearDown,
          (v) => property("gear_down", v),
          {
            value: gearDown,
          },
        );
      group.resync();

      expect(group.next({ gearDown })).toEqual([
        property("gear_down", gearDown),
      ]);
      expect(group.next({ bank, gearDown })).toEqual([property("bank", bank)]);
      expect(group.next({ bank, gearDown })).toEqual([]);
    }),
  );
});
