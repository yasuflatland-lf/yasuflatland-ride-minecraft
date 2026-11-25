import { capabilityKey } from "./capability";

export interface BoostControl {
  isOn(): boolean;
  toggle(): boolean;
}

export const BOOST_CONTROL = capabilityKey<BoostControl>("boost");
