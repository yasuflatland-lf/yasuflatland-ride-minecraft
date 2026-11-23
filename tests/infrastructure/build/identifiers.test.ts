import fc from "fast-check";
import { expect, it } from "vitest";
import {
  BUILD_NAMESPACE,
  BUILD_UNDO_TYPE,
  buildItemRole,
  LAID_BLOCK_TAG,
  PASTE_PLACE_TYPE,
  PASTE_ROTATE_TYPE,
  SELECTION_WAND_TYPE,
  TEST_EDIT_EVENT,
  TEST_MODE_EVENT,
  TEST_RESULT_EVENT,
  TEST_TAP_EVENT,
} from "../../../src/infrastructure/build/identifiers";
import { LAID_BLOCK_TAG as VEHICLE_LAID_BLOCK_TAG } from "../../../src/infrastructure/shared/identifiers";

it("keeps the copied vehicle identifiers in sync across the feature boundary", () => {
  expect(LAID_BLOCK_TAG).toBe(VEHICLE_LAID_BLOCK_TAG);
});

it("defines items and test events in the build namespace", () => {
  expect(
    [
      BUILD_UNDO_TYPE,
      PASTE_PLACE_TYPE,
      PASTE_ROTATE_TYPE,
      SELECTION_WAND_TYPE,
      TEST_TAP_EVENT,
      TEST_MODE_EVENT,
      TEST_EDIT_EVENT,
      TEST_RESULT_EVENT,
    ].every((id) => id.startsWith(`${BUILD_NAMESPACE}:`)),
  ).toBe(true);
});

it.each([
  ["yasu_build:selection_wand", "wand"],
  ["yasu_build:paste_rotate", "pasteRotate"],
  ["yasu_build:paste_place", "pastePlace"],
  ["yasu_build:build_undo", "undo"],
  ["minecraft:stick", undefined],
  [undefined, undefined],
] as const)("classifies build item %s as %s", (typeId, role) => {
  expect(buildItemRole(typeId)).toBe(role);
});

it("does not classify unrelated item ids as build items", () => {
  fc.assert(
    fc.property(
      fc
        .string()
        .filter(
          (typeId) =>
            ![
              "yasu_build:selection_wand",
              "yasu_build:paste_rotate",
              "yasu_build:paste_place",
              "yasu_build:build_undo",
            ].includes(typeId),
        ),
      (typeId) => {
        expect(buildItemRole(typeId)).toBeUndefined();
      },
    ),
  );
});
