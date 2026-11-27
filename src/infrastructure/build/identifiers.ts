import type { BuildMessage } from "../../application/build/ports/feedback";

import type { PressRole } from "../../domain/build/flow/press";

export const BUILD_NAMESPACE = "yasu_build";
export const buildId = (name: string): string => `${BUILD_NAMESPACE}:${name}`;
export const TAP_TARGET_TYPE = buildId("tap_target");
export const SELECTION_WAND_TYPE = buildId("selection_wand");
export const PASTE_ROTATE_TYPE = buildId("paste_rotate");
export const PASTE_PLACE_TYPE = buildId("paste_place");
export const BUILD_UNDO_TYPE = buildId("build_undo");

export function buildItemRole(
  typeId: string | undefined,
): PressRole | undefined {
  if (typeId === SELECTION_WAND_TYPE) return "wand";
  if (typeId === BUILD_UNDO_TYPE) return "undo";
  if (typeId === PASTE_ROTATE_TYPE) return "pasteRotate";
  if (typeId === PASTE_PLACE_TYPE) return "pastePlace";
}

// Copy of the vehicle protection tag; build cannot import that feature (ADR 0046, 0178).
export const LAID_BLOCK_TAG = "yasu_ride:laid";

export const BUILD_MESSAGE: Readonly<
  Record<
    | BuildMessage
    | "heightAimSize"
    | "heightSize"
    | "pasteInactive"
    | "pasteReady"
    | "sneakingPrefix"
    | "undoHint",
    string
  >
> = {
  cutRestored: "yasu_build.message.cut_restored",
  cutIncomplete: "yasu_build.message.cut_incomplete",
  removing: "yasu_build.message.removing",
  building: "yasu_build.message.building",
  pasteChoosePosition: "yasu_build.message.paste_choose_position",
  pasteInactive: "yasu_build.message.paste_inactive",
  pasteReady: "yasu_build.message.paste_ready",
  sneakingPrefix: "yasu_build.message.sneaking_prefix",
  pasteNoTarget: "yasu_build.message.paste_no_target",
  heightSize: "yasu_build.message.height_size",
  heightAimSize: "yasu_build.message.height_aim_size",
  pointSet: "yasu_build.message.point_set",
  endSet: "yasu_build.message.end_set",
  heightAim: "yasu_build.message.height_aim",
  stairTapGoal: "yasu_build.message.stair_tap_goal",
  noStairGoal: "yasu_build.message.no_stair_goal",
  fillMaterialRefused: "yasu_build.message.fill_material_refused",
  materialRefused: "yasu_build.message.material_refused",
  endCleared: "yasu_build.message.end_cleared",
  startCleared: "yasu_build.message.start_cleared",
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
export const TEST_TAP_TARGET_EVENT = buildId("test_tap_target");
export const TEST_INPUT_EVENT = buildId("test_input");
export const TEST_MODE_EVENT = buildId("test_mode");
export const TEST_PRESS_EVENT = buildId("test_press");
export const TEST_EDIT_EVENT = buildId("test_edit");
export const TEST_RESULT_EVENT = buildId("test_result");

export const BUILD_FORM = {
  adjustHeight: "yasu_build.form.adjust_height",
  buildShape: "yasu_build.form.build_shape",
  buildShapeTitle: "yasu_build.form.build_shape_title",
  back: "yasu_build.form.back",
  shapeTitle: "yasu_build.form.shape_title",
  roofTitle: "yasu_build.form.roof_title",
  stairs: "yasu_build.form.stairs",
  terrace: "yasu_build.form.terrace",
  terraceTitle: "yasu_build.form.terrace_title",
  terraceBody: "yasu_build.form.terrace_body",
  stairContentsTitle: "yasu_build.form.stair_contents_title",
  stairPassage: "yasu_build.form.stair_passage",
  stairFillBelow: "yasu_build.form.stair_fill_below",
  stepsOnly: "yasu_build.form.stair_steps_only",
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
  solidTitle: "yasu_build.form.solid_title",
  hollow: "yasu_build.form.hollow",
  cancel: "yasu_build.form.cancel",

  fill: "yasu_build.form.fill",
  copy: "yasu_build.form.copy",
  endPaste: "yasu_build.form.end_paste",
  newCopy: "yasu_build.form.new_copy",
  undo: "yasu_build.form.undo",
  clear: "yasu_build.form.clear_selection",
  submit: "yasu_build.form.submit",
} as const;
