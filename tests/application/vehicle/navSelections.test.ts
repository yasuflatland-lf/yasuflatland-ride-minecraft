import { expect, it } from "vitest";
import { NavSelections } from "../../../src/application/vehicle/navSelections";
import { asPlayerId } from "../../../src/domain/shared/ids";

it("keeps one pending selection per player until it ends", () => {
  const selections = new NavSelections();
  const first = asPlayerId("first");
  const second = asPlayerId("second");
  expect(selections.has(first)).toBe(false);
  expect(selections.begin(first)).toBe(true);
  expect(selections.has(first)).toBe(true);
  expect(selections.begin(first)).toBe(false);
  expect(selections.begin(second)).toBe(true);
  selections.end(first);
  expect(selections.has(first)).toBe(false);
  expect(selections.has(second)).toBe(true);
  expect(selections.begin(first)).toBe(true);
});
