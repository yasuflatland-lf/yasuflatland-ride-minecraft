import {
  type Block,
  type Entity,
  type Player,
  system,
  world,
} from "@minecraft/server";
import { HEADLIGHT_SWITCH_TYPE } from "./identifiers";

/** One thing the headlight switch item can switch. Targets are asked in order; the first that claims a press takes it. */
export interface SwitchTarget {
  /** Whether this target takes a use of the switch in the air (itemUse). */
  claimsItemUse(player: Player): boolean;
  /** Whether this target takes a switch press on `block`; a claimed press is cancelled. */
  claimsBlockPress(player: Player, block: Block): boolean;
  /** Whether this target takes a switch press on the entity `target`; a claimed press is cancelled. */
  claimsEntityPress(player: Player, target: Entity): boolean;
  /** Switches for `player`. Called with a valid player, outside before-events. */
  switchFor(player: Player): void;
}

// Before-events run in read-only mode, so a claimed press switches on the next tick.
function switchNextTick(target: SwitchTarget, player: Player): void {
  system.run(() => {
    if (player.isValid) target.switchFor(player);
  });
}

export function registerSwitchRouter(
  targets: () => readonly SwitchTarget[],
): void {
  world.afterEvents.itemUse.subscribe((ev) => {
    if (ev.itemStack.typeId !== HEADLIGHT_SWITCH_TYPE) return;
    const player = ev.source;
    if (!player.isValid) return;
    targets()
      .find((candidate) => candidate.claimsItemUse(player))
      ?.switchFor(player);
  });
  world.beforeEvents.playerInteractWithEntity.subscribe((ev) => {
    if (ev.itemStack?.typeId !== HEADLIGHT_SWITCH_TYPE) return;
    const { player } = ev;
    const target = targets().find((candidate) =>
      candidate.claimsEntityPress(player, ev.target),
    );
    if (!target) return;
    ev.cancel = true;
    switchNextTick(target, player);
  });
  world.beforeEvents.playerInteractWithBlock.subscribe((ev) => {
    if (ev.itemStack?.typeId !== HEADLIGHT_SWITCH_TYPE) return;
    const { player } = ev;
    const target = targets().find((candidate) =>
      candidate.claimsBlockPress(player, ev.block),
    );
    if (!target) return;
    ev.cancel = true;
    // A held press repeats the block event; only its first one switches.
    if (!ev.isFirstEvent) return;
    switchNextTick(target, player);
  });
}
