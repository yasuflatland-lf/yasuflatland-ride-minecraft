import type { Cell } from "../../shared/cells";
import {
  NO_TURN,
  nextQuarterTurn,
  type QuarterTurn,
} from "../rotation/quarterTurn";

export type PasteAim = {
  readonly kind: "pasteAim";
  readonly turn: QuarterTurn;
  readonly lastPaste?: { readonly anchor: Cell; readonly tick: number };
};

export function beginPasteAim(): PasteAim {
  return Object.freeze({ kind: "pasteAim", turn: NO_TURN });
}

export function rotatePasteAim(aim: PasteAim): PasteAim {
  return Object.freeze({ ...aim, turn: nextQuarterTurn(aim.turn) });
}

export function recordPaste(
  aim: PasteAim,
  anchor: Cell,
  tick: number,
): PasteAim {
  return Object.freeze({
    ...aim,
    lastPaste: Object.freeze({
      anchor: Object.freeze({ ...anchor }),
      tick,
    }),
  });
}

export function isRepeat(
  aim: PasteAim,
  anchor: Cell,
  tick: number,
  window: number,
): boolean {
  if (!aim.lastPaste) return false;
  const last = aim.lastPaste;
  return (
    last.anchor.x === anchor.x &&
    last.anchor.y === anchor.y &&
    last.anchor.z === anchor.z &&
    tick - last.tick < window
  );
}
