import type { Facing } from "../rotation/facing";
import {
  NO_TURN,
  nextQuarterTurn,
  type QuarterTurn,
} from "../rotation/quarterTurn";

export type PasteAim = {
  readonly kind: "pasteAim";
  readonly manualTurn: QuarterTurn;
  readonly facing?: Facing;
};

export function beginPasteAim(): PasteAim {
  return Object.freeze({ kind: "pasteAim", manualTurn: NO_TURN });
}

export function rotatePasteAim(aim: PasteAim): PasteAim {
  return Object.freeze({ ...aim, manualTurn: nextQuarterTurn(aim.manualTurn) });
}

export function followFacing(aim: PasteAim, facing: Facing): PasteAim {
  return Object.freeze({ ...aim, facing });
}
