import { InputMode, type Player } from "@minecraft/server";
import type { InputControls } from "../../../domain/vehicle/controls";

const CONTROLS: Readonly<Partial<Record<InputMode, InputControls>>> = {
  [InputMode.Touch]: "touch",
  [InputMode.KeyboardAndMouse]: "mouse",
};

/** The player's last input; a gamepad, a motion controller, or a read that throws get the neutral wording. */
export function controlsOf(player: Player): InputControls {
  try {
    return CONTROLS[player.inputInfo.lastInputModeUsed] ?? "other";
  } catch {
    return "other";
  }
}
