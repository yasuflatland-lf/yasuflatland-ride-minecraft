import { expect, it } from "vitest";
import {
  leanCommand,
  SCOOTER_ENTITY,
  standCommand,
  steerCommand,
} from "../../../../../src/domain/vehicle/kinds/scooter/entity";
import { SCOOTER_SPEC } from "../../../../../src/domain/vehicle/kinds/scooter/spec";
import { CORE_PROPERTY_NAMES } from "../../../../support/coreContract";

it("reserves core properties and fits the entity property budget", () => {
  const properties = Object.keys(SCOOTER_ENTITY.properties);
  expect(properties.length + CORE_PROPERTY_NAMES.length).toBeLessThanOrEqual(
    32,
  );
  for (const name of CORE_PROPERTY_NAMES)
    expect(properties).not.toContain(name);
  expect(SCOOTER_ENTITY.properties.lean.range).toEqual([
    -SCOOTER_SPEC.maxLean,
    SCOOTER_SPEC.maxLean,
  ]);
  expect(SCOOTER_ENTITY.properties.steer.range).toEqual([
    -SCOOTER_SPEC.maxSteer,
    SCOOTER_SPEC.maxSteer,
  ]);
  expect(SCOOTER_ENTITY.restored).toEqual(["form"]);
  expect(leanCommand(0)).toEqual({
    type: "setProperty",
    name: "lean",
    value: 0,
  });
  expect(steerCommand(0)).toEqual({
    type: "setProperty",
    name: "steer",
    value: 0,
  });
  expect(standCommand(true)).toEqual({
    type: "setProperty",
    name: "stand",
    value: true,
  });
});
