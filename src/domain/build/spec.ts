import { ticks } from "../shared/ticks";

// Limits the build feature reads (ADR 0178).
export const BUILD_SPEC = Object.freeze({
  reach: 64, // blocks along the view ray before an aim counts as air
  // The spike confirmed taps at 3 blocks. Five is an unmeasured starting value
  // pending iPad measurements. Keep it below reach.
  touchTapReach: 5,
  // Bound per-column work so paste previews cannot scan the full world height.
  groundSearchDepth: 64,
  // Cells one ground snap may read; matches the one-tick read bound of copy.
  groundProbeBudget: 32_768,
  // Ticks a preview reuses a snap for an unchanged target box; presses re-probe.
  groundCacheTicks: ticks(20),
  heightSliderFallback: false,
  // ADR 0254 leaves room to walk over each tread and the landing.
  stairHeadroom: 3,
  worldTopY: 319,
  worldBottomY: -64,
  // A held touch repeats itemUse every 4-6 ticks on mobile (ADR 0024).
  pressDebounceTicks: ticks(10),
  pasteRepeatTicks: ticks(10),
  pasteFacingHysteresisDegrees: 10, // prevents flicker near diagonal gaze boundaries
  facingMinHorizontal: 1e-3, // excludes near-vertical gaze from facing selection
  // Exceeds held itemUse repeats (4-6 ticks, ADR 0024) but admits taps below 10 ticks.
  rotateDebounceTicks: ticks(7),
  maxVolume: 100_000, // largest selection an edit accepts
  maxCopyVolume: 32_768, // largest selection copy accepts; copy reads in one tick
  maxTerrainSide: 32, // longest x or z side a terrain operation accepts (ADR 0233)
  blocksPerTick: 4_096, // changes applied per tick across all edit jobs
  undoDepth: 10, // total history entries per player across all kinds
  modeEnterTicks: ticks(6), // ticks to enter build mode (ADR 0178 Decision 3)
  modeLeaveTicks: ticks(6), // ticks to leave build mode (ADR 0178 Decision 3)
  outlineInterval: ticks(10), // ticks between outline redraws
  outlineMaxPoints: 512, // particles per outline
  markerHorizontalEdgeSteps: 4,
  denseOutlinePerBlock: 4, // particles per block on the horizontal edges of a height-step outline
});
