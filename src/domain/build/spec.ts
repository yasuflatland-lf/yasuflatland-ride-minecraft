// Limits the build feature reads (ADR 0178).
export const BUILD_SPEC = Object.freeze({
  reach: 64,
  heightSliderFallback: false,
  worldTopY: 319,
  maxVolume: 100_000, // largest selection an edit accepts
  maxCopyVolume: 32_768, // largest selection copy accepts; copy reads in one tick
  blocksPerTick: 4_096, // changes applied per tick across all edit jobs
  undoDepth: 10, // edits kept per player
  modeEnterTicks: 6, // ticks to enter build mode (ADR 0178 Decision 3)
  modeLeaveTicks: 6, // ticks to leave build mode (ADR 0178 Decision 3)
  outlineInterval: 10, // ticks between outline redraws
  outlineMaxPoints: 512, // particles per outline
});
