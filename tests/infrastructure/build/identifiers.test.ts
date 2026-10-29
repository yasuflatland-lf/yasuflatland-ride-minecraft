import { readFileSync } from "node:fs";
import fc from "fast-check";
import { expect, it } from "vitest";
import {
  BUILD_FORM,
  BUILD_MESSAGE,
  BUILD_NAMESPACE,
  BUILD_TOOL_TYPE,
  BUILD_TOOL_TYPES,
  BULLDOZER_TYPE,
  buildId,
  LAID_BLOCK_TAG,
  SELECTION_WAND_TYPE,
  TEST_CORNER_EVENT,
  TEST_EDIT_EVENT,
  TEST_MODE_EVENT,
  TEST_RESULT_EVENT,
} from "../../../src/infrastructure/build/identifiers";
import { LAID_BLOCK_TAG as VEHICLE_LAID_BLOCK_TAG } from "../../../src/infrastructure/shared/identifiers";
import { ENTITY_TYPE } from "../../../src/infrastructure/vehicle/bedrock/identifiers";

it("keeps the copied vehicle identifiers in sync across the feature boundary", () => {
  expect(BULLDOZER_TYPE).toBe(ENTITY_TYPE.bulldozer);
  expect(LAID_BLOCK_TAG).toBe(VEHICLE_LAID_BLOCK_TAG);
  expect(BUILD_TOOL_TYPES).toEqual(
    new Set([SELECTION_WAND_TYPE, BUILD_TOOL_TYPE]),
  );
});

it("defines every feedback message in both locales", () => {
  for (const locale of ["en_US", "ja_JP"]) {
    const lang = readFileSync(
      `packs/yasu_ride_rp/texts/${locale}.lang`,
      "utf8",
    );
    const entries = new Map(
      lang.split("\n").map((line) => {
        const split = line.indexOf("=");
        return [line.slice(0, split), line.slice(split + 1)];
      }),
    );
    for (const key of Object.values(BUILD_MESSAGE))
      expect(entries.get(key)).toBeTruthy();
    for (const key of Object.values(BUILD_FORM))
      expect(entries.get(key)).toBeTruthy();
    expect(entries.get(BUILD_MESSAGE.pos2Set)).toContain("%s");
    for (const message of [
      "tooLarge",
      "copied",
      "editDone",
      "undoDone",
    ] as const)
      expect(entries.get(BUILD_MESSAGE[message])).toContain("%s");
  }
});

it("defines items and test events in the build namespace", () => {
  fc.assert(
    fc.property(fc.string(), (name) => {
      expect(buildId(name)).toBe(`${BUILD_NAMESPACE}:${name}`);
    }),
  );
  expect(
    [
      SELECTION_WAND_TYPE,
      BUILD_TOOL_TYPE,
      TEST_CORNER_EVENT,
      TEST_MODE_EVENT,
      TEST_EDIT_EVENT,
      TEST_RESULT_EVENT,
    ].every((id) => id.startsWith(`${BUILD_NAMESPACE}:`)),
  ).toBe(true);
});
