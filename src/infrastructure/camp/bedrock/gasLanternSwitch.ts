import { system } from "@minecraft/server";
import type { GasLanternActions } from "../../../application/camp/gasLantern";
import { asGasLanternId } from "../../../domain/camp/gasLantern";
import type { SwitchTarget } from "../../shared/switchRouter";
import { GAS_LANTERN_TYPE } from "../identifiers";

export function gasLanternSwitchTarget(
  actions: GasLanternActions,
): SwitchTarget {
  return {
    claimsItemUse: () => false,
    claimsBlockPress: () => false,
    claimsEntityPress: (_, target) => target.typeId === GAS_LANTERN_TYPE,
    switchFor: (_, pressed) => {
      if (pressed?.isValid && pressed.typeId === GAS_LANTERN_TYPE)
        actions.switch(asGasLanternId(pressed.id), system.currentTick);
    },
  };
}
