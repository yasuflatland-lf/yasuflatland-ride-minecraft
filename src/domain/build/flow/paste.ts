import type { Cell } from "../../shared/cells";
import type { Facing } from "../rotation/facing";
import type { QuarterTurn } from "../rotation/quarterTurn";

export type PasteAim = {
  readonly kind: "pasteAim";
  readonly facing?: Facing;
  readonly lastPaste?: {
    readonly anchor: Cell;
    readonly turn: QuarterTurn;
    readonly tick: number;
  };
};

export function beginPasteAim(): PasteAim {
  return Object.freeze({ kind: "pasteAim" });
}

export function followFacing(aim: PasteAim, facing: Facing): PasteAim {
  return Object.freeze({ ...aim, facing });
}

export function recordPaste(
  aim: PasteAim,
  anchor: Cell,
  turn: QuarterTurn,
  tick: number,
): PasteAim {
  return Object.freeze({
    ...aim,
    lastPaste: Object.freeze({
      anchor: Object.freeze({ ...anchor }),
      turn,
      tick,
    }),
  });
}

export function isRepeat(
  aim: PasteAim,
  anchor: Cell,
  turn: QuarterTurn,
  tick: number,
  window: number,
): boolean {
  if (!aim.lastPaste) return false;
  const last = aim.lastPaste;
  return (
    last.turn === turn &&
    last.anchor.x === anchor.x &&
    last.anchor.y === anchor.y &&
    last.anchor.z === anchor.z &&
    tick - last.tick < window
  );
}
