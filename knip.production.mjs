import config from "./knip.json" with { type: "json" };

export default {
  ...config,
  // Knip discovers test:game in the full run but skips it in production mode.
  entry: [...config.entry, "scripts/game-test.mjs!"],
};
