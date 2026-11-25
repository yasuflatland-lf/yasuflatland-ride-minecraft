// Give the dev BDS's Resource Pack a fresh version while counter state is
// retained, and use a time floor to reduce reuse after state loss (ADR 0062).
// Devices cache a Resource Pack by UUID
// and version, so a changed pack served under a used version shows the cached
// copy instead. The committed manifests stay as they are: the rewritten copies
// go to server/data/dev-manifests/ and server/compose.yaml mounts them over the
// packs' manifest.json files.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Releases bump the patch one at a time from small numbers (0.1.50), so a dev
// patch from 10001 up cannot collide with one.
export const DEV_PATCH_BASE = 10000;
// Bedrock rejects a manifest version element above 65535 ("Required
// '/dependencies/2/version' element is the wrong type", checked on BDS 1.26.66):
// patches of 65536 and 482379 failed while 10001 and 65535 loaded. Whole hours
// keep the floor near 8000 in 2026 and under the cap until about 2032.
export const DEV_PATCH_MAX = 65535;
export const DEV_EPOCH_MS = Date.UTC(2026, 0, 1);

export function timeFloor(nowMs) {
  return Math.max(1, Math.floor((nowMs - DEV_EPOCH_MS) / 3_600_000));
}

export const RESOURCE_PACK_UUID = "b5d52b53-d112-4da1-9c1a-b95db192f94a";

// The last counter in the state file, or 0 when it is missing or unreadable.
export function readCounter(stateText) {
  try {
    const counter = JSON.parse(stateText ?? "").counter;
    return Number.isSafeInteger(counter) && counter > 0 ? counter : 0;
  } catch {
    return 0;
  }
}

export function devPackVersion(committedVersion, counter) {
  const [major, minor] = committedVersion;
  return [major, minor, DEV_PATCH_BASE + counter];
}

export function rewriteResourcePack(manifest, version) {
  return {
    ...manifest,
    header: { ...manifest.header, version: [...version] },
    modules: manifest.modules.map((module) => ({
      ...module,
      version: [...version],
    })),
  };
}

export function rewriteBehaviorPack(manifest, version) {
  return {
    ...manifest,
    dependencies: manifest.dependencies.map((dependency) =>
      dependency.uuid === RESOURCE_PACK_UUID
        ? { ...dependency, version: [...version] }
        : dependency,
    ),
  };
}

function readOptional(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return undefined;
  }
}

const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));

// Bumps the counter in <dataDir>/dev-pack-version.json and writes the rewritten
// manifests to <dataDir>/dev-manifests/<pack>/manifest.json.
export function writeDevManifests({ packsDir, dataDir, now = Date.now() }) {
  const statePath = join(dataDir, "dev-pack-version.json");
  const counter = Math.max(
    readCounter(readOptional(statePath)) + 1,
    timeFloor(now),
  );
  if (DEV_PATCH_BASE + counter > DEV_PATCH_MAX)
    throw new Error(
      `dev pack patch ${DEV_PATCH_BASE + counter} is above ${DEV_PATCH_MAX}, which Bedrock rejects; the time floor has run out`,
    );
  const committedRp = readJson(join(packsDir, "yasu_ride_rp/manifest.json"));
  const version = devPackVersion(committedRp.header.version, counter);
  const resourcePack = rewriteResourcePack(committedRp, version);
  const behaviorPack = rewriteBehaviorPack(
    readJson(join(packsDir, "yasu_ride_bp/manifest.json")),
    version,
  );
  for (const [pack, manifest] of [
    ["yasu_ride_rp", resourcePack],
    ["yasu_ride_bp", behaviorPack],
  ]) {
    const dir = join(dataDir, "dev-manifests", pack);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "manifest.json"),
      `${JSON.stringify(manifest, null, 2)}\n`,
    );
  }
  writeFileSync(statePath, `${JSON.stringify({ counter }, null, 2)}\n`);
  return { version, resourcePack, behaviorPack };
}
