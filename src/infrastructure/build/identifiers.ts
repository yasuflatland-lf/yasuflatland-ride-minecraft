import type { BuildMessage } from "../../application/build/ports/feedback";

export const BUILD_NAMESPACE = "yasu_build";
export const buildId = (name: string): string => `${BUILD_NAMESPACE}:${name}`;
export const SELECTION_WAND_TYPE = buildId("selection_wand");
// Copy of the vehicle protection tag; build cannot import that feature (ADR 0046, 0178).
export const LAID_BLOCK_TAG = "yasu_ride:laid";

export const BUILD_MESSAGE: Readonly<Record<BuildMessage, string>> = {
  pointSet: "yasu_build.message.point_set",
  endSet: "yasu_build.message.end_set",
  materialRefused: "yasu_build.message.material_refused",
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
  shapeTitle: "yasu_build.form.shape_title",
  roofTitle: "yasu_build.form.roof_title",
  utilityTitle: "yasu_build.form.title",
  height: "yasu_build.form.height",
  place: "yasu_build.form.place",
  frame: "yasu_build.form.frame",
  faces: "yasu_build.form.faces",
  walls: "yasu_build.form.walls",
  gable: "yasu_build.form.gable",
  hip: "yasu_build.form.hip",
  hollow: "yasu_build.form.hollow",
  cancel: "yasu_build.form.cancel",

  fill: "yasu_build.form.fill",
  copy: "yasu_build.form.copy",
  paste: "yasu_build.form.paste",
  undo: "yasu_build.form.undo",
  clear: "yasu_build.form.clear_selection",
  skipAir: "yasu_build.form.skip_air",
  submit: "yasu_build.form.submit",
} as const;
