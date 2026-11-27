import type { BlockTap } from "../blockTap";
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
  readonly tap?: BlockTap;
};

export function beginPasteAim(): PasteAim {
  return Object.freeze({ kind: "pasteAim", manualTurn: NO_TURN });
}

export function rotatePasteAim(aim: PasteAim): PasteAim {
  return Object.freeze({ ...aim, manualTurn: nextQuarterTurn(aim.manualTurn) });
}

export function tapPasteAim(
  aim: PasteAim,
  tap: BlockTap,
  facing: Facing,
): PasteAim {
  return Object.freeze({ ...aim, tap, facing: aim.facing ?? facing });
}

export function afterPaste(aim: PasteAim): PasteAim {
  return Object.freeze({ kind: "pasteAim", manualTurn: aim.manualTurn });
}
