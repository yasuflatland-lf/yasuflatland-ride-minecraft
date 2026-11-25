import { expect, it } from "vitest";
import {
  BULLDOZER_MOTION,
  BULLDOZER_TYRES,
} from "../../../../src/domain/vehicle/kinds/bulldozer/profile";
import { BULLDOZER_TRANSFORMING } from "../../../../src/domain/vehicle/kinds/bulldozer/spec";
import {
  CAMPER_MOTION,
  CAMPER_TYRES,
} from "../../../../src/domain/vehicle/kinds/camper/profile";
import { CAMPER_TRANSFORMING } from "../../../../src/domain/vehicle/kinds/camper/spec";
import {
  SCOOTER_MOTION,
  SCOOTER_TYRES,
} from "../../../../src/domain/vehicle/kinds/scooter/profile";
import { SCOOTER_TRANSFORMING } from "../../../../src/domain/vehicle/kinds/scooter/spec";
import { SPORTSBOAT_ATTITUDE } from "../../../../src/domain/vehicle/kinds/sportsboat/attitude";
import {
  SPORTSBOAT_DRAG,
  SPORTSBOAT_WATER,
} from "../../../../src/domain/vehicle/kinds/sportsboat/drive";
import { SPORTSBOAT_MOTION } from "../../../../src/domain/vehicle/kinds/sportsboat/profile";
import { SPORTSBOAT_SPEC } from "../../../../src/domain/vehicle/kinds/sportsboat/spec";
import {
  SUV_MOTION,
  SUV_TYRES,
} from "../../../../src/domain/vehicle/kinds/suv/profile";
import { SUV_TRANSFORMING } from "../../../../src/domain/vehicle/kinds/suv/spec";
import { BoostRule } from "../../../../src/domain/vehicle/motion/boost";

const flightBoost = new BoostRule(3);

// Captured from the kind mappings before issue #2344.
it.each([
  {
    kind: "suv",
    actual: {
      motion: SUV_MOTION,
      tyres: SUV_TYRES,
      transforming: SUV_TRANSFORMING,
    },
    expected: {
      motion: {
        maxSpeed: 0.9,
        maxReverse: 0.2,
        accel: 0.0225,
        reverseAccel: 0.01125,
        brake: 0.04,
        drag: 0.02,
        turnRate: 6,
        steerFullSpeed: 0.08,
        grip: 0.6,
      },
      tyres: {
        handbrakeGrip: 0.04,
        creepSpeed: 0.12,
      },
      transforming: {
        carHeight: 2.36,
        boost: flightBoost,
        doubleTapTicks: 8,
        takeoffTicks: 20,
        takeoffClimb: 0.075,
        landingSink: 0.15,
        maxClimb: 0.3,
        flightVerticalDrag: 0.98,
        waterVerticalDrag: 0.84,
        floatDraft: 1.77,
        floatGain: 0.25,
        surfaceRise: 0.05,
        submarineStepProbeDrop: 0.5,
        maxBank: 30,
        bankRate: 3,
        bankEasing: "smooth",
        bankSink: 0.03,
        gearDownHeight: 4,
        gearProbeOffset: 1.191111111111111,
        hitboxFront: 1.34,
        stepLaneOffset: 0.8,
        air: {
          drag: 0.91,
          maxSpeed: 0.9,
        },
        water: {
          drag: 0.83,
          maxSpeed: 0.5,
        },
        waterPolicy: "submerge",
      },
    },
  },
  {
    kind: "scooter",
    actual: {
      motion: SCOOTER_MOTION,
      tyres: SCOOTER_TYRES,
      transforming: SCOOTER_TRANSFORMING,
    },
    expected: {
      motion: {
        maxSpeed: 0.9,
        maxReverse: 0.2,
        accel: 0.0225,
        reverseAccel: 0.01125,
        brake: 0.04,
        drag: 0.02,
        turnRate: 6,
        steerFullSpeed: 0.08,
        grip: 0.6,
      },
      tyres: {
        handbrakeGrip: 0.04,
        creepSpeed: 0.12,
      },
      transforming: {
        carHeight: 1.5625,
        boost: flightBoost,
        doubleTapTicks: 8,
        takeoffTicks: 20,
        takeoffClimb: 0.075,
        landingSink: 0.15,
        maxClimb: 0.3,
        flightVerticalDrag: 0.98,
        waterVerticalDrag: 0.84,
        floatDraft: 0.4,
        floatGain: 0.25,
        surfaceRise: 0.05,
        submarineStepProbeDrop: 0.5,
        maxBank: 30,
        bankRate: 3,
        bankSink: 0.03,
        gearDownHeight: 4,
        gearProbeOffset: 0.3,
        hitboxFront: 0.40625,
        stepLaneOffset: 0.25,
        bankEasing: "smooth",
        air: {
          drag: 0.91,
          maxSpeed: 0.9,
        },
        water: {
          drag: 0.83,
          maxSpeed: 0.9,
        },
        waterPolicy: "surface",
      },
    },
  },
  {
    kind: "camper",
    actual: {
      motion: CAMPER_MOTION,
      tyres: CAMPER_TYRES,
      transforming: CAMPER_TRANSFORMING,
    },
    expected: {
      motion: {
        maxSpeed: 0.9,
        maxReverse: 0.15,
        accel: 0.012,
        reverseAccel: 0.006,
        brake: 0.04,
        drag: 0.02,
        turnRate: 4,
        steerFullSpeed: 0.08,
        grip: 0.6,
      },
      tyres: {
        handbrakeGrip: 0.04,
        creepSpeed: 0.12,
      },
      transforming: {
        carHeight: 4,
        boost: flightBoost,
        doubleTapTicks: 8,
        takeoffTicks: 20,
        takeoffClimb: 0.075,
        landingSink: 0.15,
        maxClimb: 0.3,
        flightVerticalDrag: 0.98,
        waterVerticalDrag: 0.84,
        floatDraft: 3.6,
        floatGain: 0.25,
        surfaceRise: 0.05,
        submarineStepProbeDrop: 0.5,
        maxBank: 30,
        bankRate: 3,
        bankEasing: "constant",
        bankSink: 0.03,
        gearDownHeight: 4,
        gearProbeOffset: 1.2,
        hitboxFront: 1.5,
        stepLaneOffset: 0.8,
        air: {
          drag: 0.91,
          maxSpeed: 0.9,
        },
        water: {
          drag: 0.83,
          maxSpeed: 0.5,
        },
        waterPolicy: "submerge",
      },
    },
  },
  {
    kind: "bulldozer",
    actual: {
      motion: BULLDOZER_MOTION,
      tyres: BULLDOZER_TYRES,
      transforming: BULLDOZER_TRANSFORMING,
    },
    expected: {
      motion: {
        maxSpeed: 0.45,
        maxReverse: 0.1,
        accel: 0.01125,
        reverseAccel: 0.005625,
        brake: 0.02,
        drag: 0.01,
        turnRate: 3,
        steerFullSpeed: 0.08,
        grip: 1,
      },
      tyres: {
        handbrakeGrip: 1,
        creepSpeed: 0,
      },
      transforming: {
        carHeight: 2.9,
        boost: flightBoost,
        doubleTapTicks: 8,
        takeoffTicks: 20,
        takeoffClimb: 0.075,
        landingSink: 0.15,
        maxClimb: 0.3,
        flightVerticalDrag: 0.98,
        waterVerticalDrag: 0.84,
        floatDraft: 2.5,
        floatGain: 0.25,
        surfaceRise: 0.05,
        submarineStepProbeDrop: 0.5,
        maxBank: 0,
        bankRate: 3,
        bankEasing: "constant",
        bankSink: 0.03,
        gearDownHeight: 4,
        gearProbeOffset: 1,
        hitboxFront: 1.2,
        stepLaneOffset: 0.8,
        air: {
          drag: 0.91,
          maxSpeed: 0.45,
        },
        water: {
          drag: 0.83,
          maxSpeed: 0.5,
        },
        waterPolicy: "submerge",
      },
    },
  },
  {
    kind: "sportsboat",
    actual: {
      motion: SPORTSBOAT_MOTION,
      attitude: SPORTSBOAT_ATTITUDE,
      drag: SPORTSBOAT_DRAG,
      water: SPORTSBOAT_WATER,
      deckDraft: SPORTSBOAT_SPEC.deckDraft,
    },
    expected: {
      motion: {
        maxSpeed: 1.12,
        maxReverse: 0.2,
        accel: 0.0225,
        reverseAccel: 0.01125,
        brake: 0.04,
        drag: 0.02,
        turnRate: 6,
        steerFullSpeed: 0.08,
        grip: 0.6,
      },
      attitude: {
        maxTrim: 3.5,
        trimRiseRate: 0.25,
        trimSettleRate: 0.125,
        maxRoll: 20,
        rollRate: 2,
      },
      drag: {
        initial: 0.83,
        min: 0.7,
        max: 0.95,
        smoothing: 0.1,
        minGiven: 0.05,
      },
      water: {
        drag: 0.83,
        maxSpeed: 1.12,
      },
      deckDraft: 0.45,
    },
  },
])("preserves the $kind motion tuning", ({ actual, expected }) => {
  expect(actual).toStrictEqual(expected);
});
