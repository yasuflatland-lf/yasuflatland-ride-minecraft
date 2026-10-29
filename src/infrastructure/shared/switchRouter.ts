import {
  type Block,
  type Entity,
  type Player,
  system,
  world,
} from "@minecraft/server";

/** One thing a switch item can switch. A route's targets are asked in order; the first that claims a press takes it. */
export interface SwitchTarget {
  /** Whether this target takes a use of the switch in the air (itemUse). */
  claimsItemUse(player: Player): boolean;
  /** Whether this target takes a switch press on `block`; a claimed press is cancelled. */
  claimsBlockPress(player: Player, block: Block): boolean;
  /** Whether this target takes a switch press on the entity `target`; a claimed press is cancelled. */
  claimsEntityPress(player: Player, target: Entity): boolean;
  /** Switches for `player`. Called with a valid player, outside before-events. `pressed` is the entity the press landed on, given only for an entity press, and may no longer be valid when this runs. */
  switchFor(player: Player, pressed?: Entity): void;
}

// Before-events run in read-only mode, so a claimed press switches on the next tick.
function switchNextTick(
  target: SwitchTarget,
  player: Player,
  pressed?: Entity,
): void {
  system.run(() => {
    if (!player.isValid) return;
    if (pressed === undefined) target.switchFor(player);
    else target.switchFor(player, pressed);
  });
}

/** Switch items by item type id. Each route lists, in order, the targets asked for a press with that item; it is read on every press, never at registration. */
export type SwitchRoutes = Readonly<
  Record<string, () => readonly SwitchTarget[]>
>;

function routeOf(
  routes: SwitchRoutes,
  typeId: string | undefined,
): (() => readonly SwitchTarget[]) | undefined {
  if (typeId === undefined || !Object.hasOwn(routes, typeId)) return undefined;
  return routes[typeId];
}

export function registerSwitchRouter(routes: SwitchRoutes): void {
  world.afterEvents.itemUse.subscribe((ev) => {
    const route = routeOf(routes, ev.itemStack.typeId);
    if (!route) return;
    const player = ev.source;
    if (!player.isValid) return;
    route()
      .find((candidate) => candidate.claimsItemUse(player))
      ?.switchFor(player);
  });
  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    const route = routeOf(routes, ev.itemStack?.typeId);
    if (!route) return;
    const { player } = ev;
    const target = route().find((candidate) =>
      candidate.claimsEntityPress(player, ev.target),
    );
    if (!target) return;
    ev.cancel = true;
    switchNextTick(target, player, ev.target);
  });
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    const route = routeOf(routes, ev.itemStack?.typeId);
    if (!route) return;
    const { player } = ev;
    const target = route().find((candidate) =>
      candidate.claimsBlockPress(player, ev.block),
    );
    if (!target) return;
    ev.cancel = true;
    // A held press repeats the block event; only its first one switches.
    if (!ev.isFirstEvent) return;
    switchNextTick(target, player);
  });
}
