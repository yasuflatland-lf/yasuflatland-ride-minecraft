import { hitRule } from "../shared/hitCounter";
import { ticks } from "../shared/ticks";

export const WARP_SPEC = {
  breakRule: hitRule(3, ticks(10)),
  maxPoints: 64,
  nameMaxLength: 32,
  pressDebounceTicks: ticks(5),
  formRetryTicks: ticks(10),
  formMaxRetries: 5,
  pageSize: 16,
  landingRadius: 2,
  landingRises: [0, 1],
  arrivalCheckTicks: ticks(5),
  arrivalCheckMaxTicks: ticks(100),
} as const;
