// Bundle the built Behavior Pack and Resource Pack into dist/yasuflatland-ride-<version>.mcaddon.
// Both test packs are left out because their scripts and assets belong in the dev world only.
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { bundleMain } from "./build.mjs";
import { generatedStatus } from "./generated-files.mjs";

const BP = "yasu_ride_bp";
const RP = "yasu_ride_rp";
const readManifest = (pack) =>
  JSON.parse(readFileSync(`packs/${pack}/manifest.json`, "utf8"));
const bp = readManifest(BP);
const rp = readManifest(RP);
const fail = (message) => {
  console.error(message);
  process.exit(1);
};

if (!existsSync(`packs/${BP}/scripts/main.js`)) {
  fail(`packs/${BP}/scripts/main.js is missing; run \`pnpm build\` first`);
}

const generated = generatedStatus();
if (!generated.stamped || generated.missing.length > 0) {
  fail(`generated pack files are missing; run \`pnpm build\` first`);
}

// Bedrock refuses to load the Behavior Pack when the Resource Pack version it
// depends on is not installed, so a forgotten bump here breaks every device.
const rpDependency = bp.dependencies.find(
  (dependency) => dependency.uuid === rp.header.uuid,
);
if (!rpDependency) {
  fail(`${BP}/manifest.json has no dependency on ${RP}`);
}
if (rpDependency.version.join(".") !== rp.header.version.join(".")) {
  fail(
    `${BP} depends on ${RP} ${rpDependency.version.join(".")}, but ${RP} is ${rp.header.version.join(".")}`,
  );
}

// The Resource Pack depends back on the Behavior Pack version, so a
// release that bumps the Behavior Pack must update this side too.
const bpDependency = rp.dependencies?.find(
  (dependency) => dependency.uuid === bp.header.uuid,
);
if (!bpDependency) {
  fail(`${RP}/manifest.json has no dependency on ${BP}`);
}
if (bpDependency.version.join(".") !== bp.header.version.join(".")) {
  fail(
    `${RP} depends on ${BP} ${bpDependency.version.join(".")}, but ${BP} is ${bp.header.version.join(".")}`,
  );
}

const version = bp.header.version.join(".");
const expected = process.env.EXPECTED_VERSION?.replace(/^v/, "");
if (expected && expected !== version) {
  fail(`expected version ${expected}, but ${BP}/manifest.json says ${version}`);
}

mkdirSync("dist", { recursive: true });
const archive = `yasuflatland-ride-${version}.mcaddon`;
const out = resolve("dist", archive);
const stage = mkdtempSync(resolve("dist", "stage-"));
try {
  for (const pack of [BP, RP]) {
    cpSync(join("packs", pack), join(stage, pack), { recursive: true });
  }
  await bundleMain({
    outfile: join(stage, BP, "scripts/main.js"),
    testHooks: false,
  });
  execFileSync("zip", ["-r", "-X", "-q", archive, BP, RP, "-x", "*.DS_Store"], {
    cwd: stage,
    stdio: "inherit",
  });
  renameSync(join(stage, archive), out);
} finally {
  rmSync(stage, { recursive: true, force: true });
}
console.log(`packaged ${out}`);
