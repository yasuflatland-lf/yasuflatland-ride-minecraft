import config from "./knip.json" with { type: "json" };

const testPack = "!src/test-pack/**";

export default {
  ...config,
  entry: [...config.entry, testPack],
  project: [...config.project, testPack],
};
