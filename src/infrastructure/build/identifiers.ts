import type { BuildMessage } from "../../application/build/ports/feedback";

export const BUILD_NAMESPACE = "yasu_build";
export const buildId = (name: string): string => `${BUILD_NAMESPACE}:${name}`;
export const SELECTION_WAND_TYPE = buildId("selection_wand");
// Copy of the vehicle protection tag; build cannot import that feature (ADR 0046, 0178).
export const LAID_BLOCK_TAG = "yasu_ride:laid";

export const BUILD_MESSAGE: Readonly<
  Record<BuildMessage | "heightSize" | "pasteHint" | "undoHint", string>
> = {
  cutRestored: "yasu_build.message.cut_restored",
  cutIncomplete: "yasu_build.message.cut_incomplete",
  removing: "yasu_build.message.removing",
  building: "yasu_build.message.building",
  pasteHint: "yasu_build.message.paste_hint",
  heightSize: "yasu_build.message.height_size",
  pointSet: "yasu_build.message.point_set",
  endSet: "yasu_build.message.end_set",
  fillMaterialRefused: "yasu_build.message.fill_material_refused",
  materialRefused: "yasu_build.message.material_refused",
  selectionCleared: "yasu_build.message.selection_cleared",
  noSelection: "yasu_build.message.no_selection",
  tooLarge: "yasu_build.message.too_large",
  busy: "yasu_build.message.busy",
  noGround: "yasu_build.message.no_ground",
  noClipboard: "yasu_build.message.no_clipboard",
  nothingToUndo: "yasu_build.message.nothing_to_undo",
  pasteFailed: "yasu_build.message.paste_failed",
  pasteBlocked: "yasu_build.message.paste_blocked",
  rotateTooLarge: "yasu_build.message.rotate_too_large",
  rotateBlocked: "yasu_build.message.rotate_blocked",
  rotateFailed: "yasu_build.message.rotate_failed",
  rotateDone: "yasu_build.message.rotate_done",
  copyUnreadable: "yasu_build.message.copy_unreadable",
  copied: "yasu_build.message.copied",
  editDone: "yasu_build.message.edit_done",
  editDoneCount: "yasu_build.message.edit_done_count",
  undoFailed: "yasu_build.message.undo_failed",
  undoDone: "yasu_build.message.undo_done",
  undoDonePartial: "yasu_build.message.undo_done_partial",
  undoHint: "yasu_build.message.undo_hint",
};

export const TEST_TAP_EVENT = buildId("test_tap");
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
  sideCylinder: "yasu_build.form.side_cylinder",
  cylinder: "yasu_build.form.cylinder",
  sphere: "yasu_build.form.sphere",
  cube: "yasu_build.form.cube",
  tube: "yasu_build.form.tube",
  fillBelow: "yasu_build.form.fill_below",
  fillBelowTitle: "yasu_build.form.fill_below_title",
  fillBelowBody: "yasu_build.form.fill_below_body",
  removeAbove: "yasu_build.form.remove_above",
  removeAboveTitle: "yasu_build.form.remove_above_title",
  removeAboveBody: "yasu_build.form.remove_above_body",
  confirm: "yasu_build.form.confirm",
  cut: "yasu_build.form.cut",
  cutTitle: "yasu_build.form.cut_title",
  rotateTitle: "yasu_build.form.rotate_title",
  copyTitle: "yasu_build.form.copy_title",
  solidTitle: "yasu_build.form.solid_title",
  hollow: "yasu_build.form.hollow",
  cancel: "yasu_build.form.cancel",

  fill: "yasu_build.form.fill",
  copy: "yasu_build.form.copy",
  endPaste: "yasu_build.form.end_paste",
  rotate: "yasu_build.form.rotate",
  rotateBody: "yasu_build.form.rotate_body",
  done: "yasu_build.form.done",
  newCopy: "yasu_build.form.new_copy",
  undo: "yasu_build.form.undo",
  clear: "yasu_build.form.clear_selection",
  submit: "yasu_build.form.submit",
} as const;
