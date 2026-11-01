import type { Cell } from "../../shared/cells";

export type PasteAim = {
  readonly kind: "pasteAim";
  readonly skipAir: boolean;
  readonly lastPaste?: { readonly anchor: Cell; readonly tick: number };
};

export function beginPasteAim(skipAir: boolean): PasteAim {
  return Object.freeze({ kind: "pasteAim", skipAir });
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

export function toggleSkipAir(aim: PasteAim): PasteAim {
  return Object.freeze({ ...aim, skipAir: !aim.skipAir });
}
