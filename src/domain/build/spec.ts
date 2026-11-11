// Limits the build feature reads (ADR 0178).
export const BUILD_SPEC = Object.freeze({
  reach: 64, // blocks along the view ray before an aim counts as air
  heightSliderFallback: false,
  worldTopY: 319,
  worldBottomY: -64,
  // A held touch repeats itemUse every 4-6 ticks on mobile (ADR 0024).
  pressDebounceTicks: 10,
  pasteRepeatTicks: 10,
  // Exceeds held itemUse repeats (4-6 ticks, ADR 0024) but admits taps below 10 ticks.
  rotateDebounceTicks: 7,
  maxVolume: 100_000, // largest selection an edit accepts
  maxCopyVolume: 32_768, // largest selection copy accepts; copy reads in one tick
  maxTerrainSide: 32, // longest x or z side a terrain operation accepts (ADR 0233)
  blocksPerTick: 4_096, // changes applied per tick across all edit jobs
  undoDepth: 10, // total history entries per player across all kinds
  modeEnterTicks: 6, // ticks to enter build mode (ADR 0178 Decision 3)
  modeLeaveTicks: 6, // ticks to leave build mode (ADR 0178 Decision 3)
  outlineInterval: 10, // ticks between outline redraws
  outlineMaxPoints: 512, // particles per outline
  denseOutlinePerBlock: 4, // particles per block on the horizontal edges of a height-step outline
});
