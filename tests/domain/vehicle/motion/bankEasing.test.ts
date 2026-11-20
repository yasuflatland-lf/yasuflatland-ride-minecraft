import { expect, it } from "vitest";
import { CAMPER_TRANSFORMING } from "../../../../src/domain/vehicle/kinds/camper/spec";
import { SUV_TRANSFORMING } from "../../../../src/domain/vehicle/kinds/suv/spec";

it("the SUV selects smooth bank easing and the camper uses constant easing", () => {
  expect(SUV_TRANSFORMING.bankEasing).toBe("smooth");
  expect(CAMPER_TRANSFORMING.bankEasing).toBe("constant");
});
