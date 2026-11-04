import { describe, expect, it } from "vitest";
import {
  VEHICLE_KINDS,
  type VehicleKind,
} from "../../../src/domain/vehicle/kind";
import {
  BULLDOZER_MOTION,
  BULLDOZER_TYRES,
} from "../../../src/domain/vehicle/kinds/bulldozer/profile";
import {
  CAMPER_MOTION,
  CAMPER_TYRES,
} from "../../../src/domain/vehicle/kinds/camper/profile";
import { SPORTSBOAT_MOTION } from "../../../src/domain/vehicle/kinds/sportsboat/profile";
import { SPORTSBOAT_SPEC } from "../../../src/domain/vehicle/kinds/sportsboat/spec";
import {
  SUV_MOTION,
  SUV_TYRES,
} from "../../../src/domain/vehicle/kinds/suv/profile";
import { SPEC } from "../../../src/domain/vehicle/spec";

// Typed by VehicleKind, so adding a kind fails the build until its row is added here.
// The sports boat keeps its creep speed outside TyreLimits (drive.ts).
const DECLARED: Record<VehicleKind, { maxSpeed: number; creepSpeed: number }> =
  {
    suv: { maxSpeed: SUV_MOTION.maxSpeed, creepSpeed: SUV_TYRES.creepSpeed },
    camper: {
      maxSpeed: CAMPER_MOTION.maxSpeed,
      creepSpeed: CAMPER_TYRES.creepSpeed,
    },
    sportsboat: {
      maxSpeed: SPORTSBOAT_MOTION.maxSpeed,
      creepSpeed: SPORTSBOAT_SPEC.creepSpeed,
    },
    bulldozer: {
      maxSpeed: BULLDOZER_MOTION.maxSpeed,
      creepSpeed: BULLDOZER_TYRES.creepSpeed,
    },
  };

// updateSpeed's creep branch has no final clamp, so a creepSpeed above maxSpeed
// would push the internal speed out of range.
describe("creepSpeed invariant for every vehicle kind", () => {
  it.each(VEHICLE_KINDS)(
    "%s creeps within its speed range and below the ram threshold",
    (kind) => {
      const { maxSpeed, creepSpeed } = DECLARED[kind];
      expect(creepSpeed).toBeGreaterThanOrEqual(0);
      expect(creepSpeed).toBeLessThanOrEqual(maxSpeed);
      expect(creepSpeed).toBeLessThan(SPEC.ramMinSpeed);
    },
  );
});
