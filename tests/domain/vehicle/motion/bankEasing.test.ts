import { expect, it } from "vitest";
import { BULLDOZER_TRANSFORMING } from "../../../../src/domain/vehicle/kinds/bulldozer/spec";
import { CAMPER_TRANSFORMING } from "../../../../src/domain/vehicle/kinds/camper/spec";
import { SUV_TRANSFORMING } from "../../../../src/domain/vehicle/kinds/suv/spec";

it("only the SUV selects smooth bank easing", () => {
  expect(SUV_TRANSFORMING.bankEasing).toBe("smooth");
  for (const spec of [CAMPER_TRANSFORMING, BULLDOZER_TRANSFORMING])
    expect(spec.bankEasing).toBe("constant");
});
