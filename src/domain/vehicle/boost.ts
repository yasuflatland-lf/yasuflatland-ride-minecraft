import { capabilityKey } from "./capability";
import type { SwitchMessages } from "./equipment/equipment";

export interface BoostControl {
  isOn(): boolean;
  toggle(): boolean;
}

export const BOOST_CONTROL = capabilityKey<BoostControl>("boost");

export const BOOST_MESSAGES: SwitchMessages = Object.freeze({
  messageFor(state: string) {
    if (state === "on") return "boost_on";
    if (state === "off") return "boost_off";
    return undefined;
  },
});
