import type {
  Block,
  Entity,
  ItemUseAfterEvent,
  Player,
  PlayerInteractWithBlockBeforeEvent,
  PlayerInteractWithEntityBeforeEvent,
} from "@minecraft/server";
import fc from "fast-check";
import { expect, it, vi } from "vitest";
import { HEADLIGHT_SWITCH_TYPE } from "../../../src/infrastructure/shared/identifiers";
import {
  registerSwitchRouter,
  type SwitchTarget,
} from "../../../src/infrastructure/shared/switchRouter";
import { defined } from "../../support/defined";

const game = vi.hoisted(() => ({
  order: [] as string[],
  use: vi.fn<(handler: (ev: ItemUseAfterEvent) => void) => void>(),
  entity:
    vi.fn<
      (handler: (ev: PlayerInteractWithEntityBeforeEvent) => void) => void
    >(),
  block:
    vi.fn<
      (handler: (ev: PlayerInteractWithBlockBeforeEvent) => void) => void
    >(),
  run: vi.fn<(callback: () => void) => void>(),
}));
vi.mock("@minecraft/server", () => ({
  world: {
    afterEvents: { itemUse: { subscribe: game.use } },
    beforeEvents: {
      playerInteractWithEntity: { subscribe: game.entity },
      playerInteractWithBlock: { subscribe: game.block },
    },
  },
  system: { run: game.run },
}));

function fixture(extraRouteId?: string) {
  vi.clearAllMocks();
  game.order.length = 0;
  game.use.mockImplementation(() => {
    game.order.push("itemUse");
  });
  game.entity.mockImplementation(() => {
    game.order.push("entity");
  });
  game.block.mockImplementation(() => {
    game.order.push("block");
  });
  const targets: SwitchTarget[] = [];
  const getter = vi.fn(() => targets);
  const extraTargets: SwitchTarget[] = [];
  const extraGetter = vi.fn(() => extraTargets);
  registerSwitchRouter({
    [HEADLIGHT_SWITCH_TYPE]: getter,
    ...(extraRouteId === undefined ? {} : { [extraRouteId]: extraGetter }),
  });
  expect(game.order).toEqual(["itemUse", "entity", "block"]);
  expect(game.use).toHaveBeenCalledTimes(1);
  expect(game.entity).toHaveBeenCalledTimes(1);
  expect(game.block).toHaveBeenCalledTimes(1);
  expect(getter).not.toHaveBeenCalled();
  expect(extraGetter).not.toHaveBeenCalled();
  return {
    targets,
    getter,
    extraTargets,
    extraGetter,
    use: defined(game.use.mock.calls[0]?.[0], "itemUse"),
    entity: defined(game.entity.mock.calls[0]?.[0], "entity"),
    block: defined(game.block.mock.calls[0]?.[0], "block"),
  };
}

type EventKind = "item" | "entity" | "block";

function press(
  f: ReturnType<typeof fixture>,
  kind: EventKind,
  ev: object,
): void {
  if (kind === "item") f.use(ev as ItemUseAfterEvent);
  else if (kind === "entity")
    f.entity(ev as PlayerInteractWithEntityBeforeEvent);
  else f.block(ev as PlayerInteractWithBlockBeforeEvent);
}

function fakeTarget(claims: {
  item: boolean;
  entity: boolean;
  block: boolean;
}) {
  return {
    claimsItemUse: vi.fn((_player: Player) => claims.item),
    claimsEntityPress: vi.fn(
      (_player: Player, _entity: Entity) => claims.entity,
    ),
    claimsBlockPress: vi.fn((_player: Player, _block: Block) => claims.block),
    switchFor: vi.fn<SwitchTarget["switchFor"]>(),
  } satisfies SwitchTarget;
}

it("routes each event to its first claim with the required timing and cancellation", () => {
  fc.assert(
    fc.property(
      fc.array(
        fc.record({
          item: fc.boolean(),
          entity: fc.boolean(),
          block: fc.boolean(),
        }),
        { maxLength: 3 },
      ),
      fc.constantFrom(HEADLIGHT_SWITCH_TYPE, "minecraft:stick", undefined),
      fc.boolean(),
      fc.boolean(),
      fc.boolean(),
      (claims, item, isFirstEvent, validAtPress, validNextTick) => {
        const f = fixture();
        const targets = claims.map(fakeTarget);
        f.targets.push(...targets);
        for (const kind of ["item", "entity", "block"] as const) {
          for (const target of targets) {
            target.claimsItemUse.mockClear();
            target.claimsEntityPress.mockClear();
            target.claimsBlockPress.mockClear();
            target.switchFor.mockClear();
          }
          game.run.mockClear();
          f.getter.mockClear();
          const playerState = { isValid: validAtPress };
          const player = playerState as Player;
          const entity = {} as Entity;
          const block = {} as Block;
          // itemUse always has an item in the stable API; an absent item is a before-event case.
          if (kind === "item" && item === undefined) continue;
          const itemStack = item === undefined ? undefined : { typeId: item };
          const ev = {
            player,
            source: player,
            target: entity,
            block,
            itemStack,
            isFirstEvent,
            cancel: false,
          };
          press(f, kind, ev);
          const asks =
            item === HEADLIGHT_SWITCH_TYPE && (kind !== "item" || validAtPress);
          const winnerIndex = asks
            ? claims.findIndex((claim) => claim[kind])
            : -1;
          const winner = targets[winnerIndex];
          expect(f.getter).toHaveBeenCalledTimes(asks ? 1 : 0);
          expect(ev.cancel).toBe(kind !== "item" && winner !== undefined);
          const deferred =
            winner !== undefined &&
            (kind === "entity" || (kind === "block" && isFirstEvent));
          expect(game.run).toHaveBeenCalledTimes(deferred ? 1 : 0);
          targets.forEach((target, index) => {
            const asked = asks && (winnerIndex < 0 || index <= winnerIndex);
            expect(target.claimsItemUse.mock.calls).toEqual(
              asked && kind === "item" ? [[player]] : [],
            );
            expect(target.claimsEntityPress.mock.calls).toEqual(
              asked && kind === "entity" ? [[player, entity]] : [],
            );
            expect(target.claimsBlockPress.mock.calls).toEqual(
              asked && kind === "block" ? [[player, block]] : [],
            );
            expect(target.switchFor.mock.calls).toEqual(
              target === winner && kind === "item" ? [[player]] : [],
            );
          });
          playerState.isValid = validNextTick;
          for (const [callback] of game.run.mock.calls) callback();
          for (const target of targets) {
            const switched =
              target === winner &&
              (kind === "item" || (deferred && validNextTick));
            expect(target.switchFor.mock.calls).toEqual(
              switched ? [[player]] : [],
            );
          }
        }
      },
    ),
  );
});

it("asks a target added after registration on the next event", () => {
  fc.assert(
    fc.property(fc.constantFrom("item", "entity", "block"), (kind) => {
      const f = fixture();
      const player = { isValid: true } as Player;
      const ev = {
        source: player,
        player,
        target: {} as Entity,
        block: {} as Block,
        itemStack: { typeId: HEADLIGHT_SWITCH_TYPE },
        isFirstEvent: true,
        cancel: false,
      };
      press(f, kind, ev);
      expect(ev.cancel).toBe(false);
      expect(game.run).not.toHaveBeenCalled();
      const target = fakeTarget({ item: true, entity: true, block: true });
      f.targets.push(target);
      press(f, kind, ev);
      for (const [callback] of game.run.mock.calls) callback();
      expect(target.switchFor).toHaveBeenCalledExactlyOnceWith(player);
      expect(f.getter).toHaveBeenCalledTimes(2);
    }),
  );
});

it("ignores an item with no route in all three events", () => {
  fc.assert(
    fc.property(
      fc
        .oneof(
          fc.constantFrom(
            "minecraft:stick",
            "constructor",
            "toString",
            "__proto__",
            "hasOwnProperty",
          ),
          fc.string(),
        )
        .filter((item) => item !== HEADLIGHT_SWITCH_TYPE),
      fc.array(fc.constant({ item: true, entity: true, block: true })),
      fc.boolean(),
      fc.boolean(),
      (item, claims, isFirstEvent, isValid) => {
        const f = fixture();
        const targets = claims.map(fakeTarget);
        f.targets.push(...targets);
        const player = { isValid } as Player;
        for (const kind of ["item", "entity", "block"] as const) {
          for (const typeId of kind === "item" ? [item] : [item, undefined]) {
            const ev = {
              source: player,
              player,
              target: {} as Entity,
              block: {} as Block,
              itemStack: typeId === undefined ? undefined : { typeId },
              isFirstEvent,
              cancel: false,
            };
            press(f, kind, ev);
            expect(f.getter).not.toHaveBeenCalled();
            expect(ev.cancel).toBe(false);
            expect(game.run).not.toHaveBeenCalled();
            for (const target of targets) {
              expect(target.claimsItemUse).not.toHaveBeenCalled();
              expect(target.claimsEntityPress).not.toHaveBeenCalled();
              expect(target.claimsBlockPress).not.toHaveBeenCalled();
              expect(target.switchFor).not.toHaveBeenCalled();
            }
          }
        }
      },
    ),
  );
});

it("dispatches each item to its own route only", () => {
  fc.assert(
    fc.property(
      fc.constantFrom(HEADLIGHT_SWITCH_TYPE, "yasu_ride:test_switch"),
      fc.constantFrom("item", "entity", "block"),
      (item, kind) => {
        const f = fixture("yasu_ride:test_switch");
        const headlight = fakeTarget({ item: true, entity: true, block: true });
        const extra = fakeTarget({ item: true, entity: true, block: true });
        f.targets.push(headlight);
        f.extraTargets.push(extra);
        const player = { isValid: true } as Player;
        const ev = {
          source: player,
          player,
          target: {} as Entity,
          block: {} as Block,
          itemStack: { typeId: item },
          isFirstEvent: true,
          cancel: false,
        };
        press(f, kind, ev);
        const [getter, otherGetter, target, otherTarget] =
          item === HEADLIGHT_SWITCH_TYPE
            ? [f.getter, f.extraGetter, headlight, extra]
            : [f.extraGetter, f.getter, extra, headlight];
        expect(getter).toHaveBeenCalledTimes(1);
        expect(otherGetter).not.toHaveBeenCalled();
        expect(target.switchFor.mock.calls).toEqual(
          kind === "item" ? [[player]] : [],
        );
        expect(game.run).toHaveBeenCalledTimes(kind === "item" ? 0 : 1);
        for (const [callback] of game.run.mock.calls) callback();
        expect(target.switchFor).toHaveBeenCalledExactlyOnceWith(player);
        expect(otherTarget.claimsItemUse).not.toHaveBeenCalled();
        expect(otherTarget.claimsEntityPress).not.toHaveBeenCalled();
        expect(otherTarget.claimsBlockPress).not.toHaveBeenCalled();
        expect(otherTarget.switchFor).not.toHaveBeenCalled();
      },
    ),
  );
});
