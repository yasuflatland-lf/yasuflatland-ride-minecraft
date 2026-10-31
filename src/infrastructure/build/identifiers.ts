import type { BuildMessage } from "../../application/build/ports/feedback";

export const BUILD_NAMESPACE = "yasu_build";
export const buildId = (name: string): string => `${BUILD_NAMESPACE}:${name}`;
export const SELECTION_WAND_TYPE = buildId("selection_wand");
export const BUILD_TOOL_TYPE = buildId("build_tool");
export const BUILD_TOOL_TYPES: ReadonlySet<string> = new Set([
  SELECTION_WAND_TYPE,
  BUILD_TOOL_TYPE,
]);
// Copy of the vehicle protection tag; build cannot import that feature (ADR 0046, 0178).
export const LAID_BLOCK_TAG = "yasu_ride:laid";

export const BUILD_MESSAGE: Readonly<Record<BuildMessage, string>> = {
  pos1Set: "yasu_build.message.pos1_set",
  pos2Set: "yasu_build.message.pos2_set",
  selectionCleared: "yasu_build.message.selection_cleared",
  noSelection: "yasu_build.message.no_selection",
  tooLarge: "yasu_build.message.too_large",
  busy: "yasu_build.message.busy",
  noClipboard: "yasu_build.message.no_clipboard",
  nothingToUndo: "yasu_build.message.nothing_to_undo",
  pasteBlocked: "yasu_build.message.paste_blocked",
  copied: "yasu_build.message.copied",
  editDone: "yasu_build.message.edit_done",
  undoDone: "yasu_build.message.undo_done",
};

export const TEST_CORNER_EVENT = buildId("test_corner");
export const TEST_MODE_EVENT = buildId("test_mode");
export const TEST_EDIT_EVENT = buildId("test_edit");
export const TEST_RESULT_EVENT = buildId("test_result");

export const BUILD_FORM = {
  title: "yasu_build.form.title",
  fill: "yasu_build.form.fill",
  replace: "yasu_build.form.replace",
  copy: "yasu_build.form.copy",
  paste: "yasu_build.form.paste",
  undo: "yasu_build.form.undo",
  clearSelection: "yasu_build.form.clear_selection",
  block: "yasu_build.form.block",
  with: "yasu_build.form.with",
  skipAir: "yasu_build.form.skip_air",
  air: "yasu_build.form.air",
  submit: "yasu_build.form.submit",
} as const;
