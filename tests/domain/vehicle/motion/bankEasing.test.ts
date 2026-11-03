import { expect, it } from "vitest";
import { BULLDOZER_TRANSFORMING } from "../../../../src/domain/vehicle/kinds/bulldozer/spec";
import { CAMPER_TRANSFORMING } from "../../../../src/domain/vehicle/kinds/camper/spec";
import { SUV_TRANSFORMING } from "../../../../src/domain/vehicle/kinds/suv/spec";

it("every transforming kind spec sets the constant bank easing", () => {
  for (const spec of [
    SUV_TRANSFORMING,
    CAMPER_TRANSFORMING,
    BULLDOZER_TRANSFORMING,
  ])
    expect(spec.bankEasing).toBe("constant");
});
