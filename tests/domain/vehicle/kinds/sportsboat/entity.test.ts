import { expect, it } from "vitest";
import {
  rollCommand,
  trimCommand,
} from "../../../../../src/domain/vehicle/kinds/sportsboat/entity";

it("writes the trim and roll properties", () => {
  expect(trimCommand(3)).toEqual({
    type: "setProperty",
    name: "trim",
    value: 3,
  });
  expect(rollCommand(-2)).toEqual({
    type: "setProperty",
    name: "roll",
    value: -2,
  });
});
