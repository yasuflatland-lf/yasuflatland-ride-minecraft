// Fail a release when the Resource Pack changed since the previous release tag
// but kept its version: devices keep a cached Resource Pack with the same UUID
// and version, so they would never see the change (ADR 0015).
// Usage: node scripts/check-rp-version.mjs <previous tag>
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const PACK = "packs/yasu_ride_rp";

export function checkResourcePackVersion({
  tag,
  changed,
  generatorInputsChanged = false,
  previousVersion,
  currentVersion,
}) {
  if (!tag || !(changed || generatorInputsChanged)) return null;
  const previous = previousVersion.join(".");
  const current = currentVersion.join(".");
  if (previous !== current) return null;
  return `${PACK} or its generator inputs changed since ${tag}, but its version is ${previous} at ${tag} and ${current} at HEAD; bump header.version, the module version, and the Behavior Pack's dependency on it (ADR 0015)`;
}

// Pipe stderr so a failing command's error message ends with git's own reason
// (execFileSync appends captured stderr to "Command failed: git ...").
export function git(...args) {
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function manifestAt(revision, dir) {
  try {
    return JSON.parse(git("show", `${revision}:${dir}/manifest.json`));
  } catch {
    return undefined;
  }
}

// Use the manifest's POSIX fnmatch semantics, including stars across folders.
// Ignore build-output deletions when comparing against tags that committed them.
export function resourcePackChanges(paths) {
  return JSON.parse(
    execFileSync(
      "python3",
      [
        "-I",
        "-c",
        `
import fnmatch, json, sys
from pathlib import PurePosixPath
sys.path.insert(0, 'tools')
from generated_outputs import OutputManifest
manifest = OutputManifest.load()
paths = [path for path in json.load(sys.stdin)
         if '__pycache__' not in PurePosixPath(path).parts
         and not any(fnmatch.fnmatchcase(path, pattern) for pattern in manifest.untracked_patterns())]
print(json.dumps({
    'changed': any(path.startswith('packs/yasu_ride_rp/') for path in paths),
    'generatorInputsChanged': any(fnmatch.fnmatchcase(path, pattern)
                                 for path in paths for pattern in manifest.inputs()),
}))
`,
      ],
      { input: JSON.stringify(paths), encoding: "utf8" },
    ),
  );
}

function main(tag) {
  if (!tag) {
    console.log("No previous release tag; skipping the Resource Pack check");
    return;
  }
  const current = manifestAt("HEAD", PACK);
  // Packs keep their UUID across folder renames (the Resource Pack moved to
  // packs/yasu_ride_rp after v0.5.0), so find the previous copy by UUID.
  const previousDir = git("ls-tree", "-d", "--name-only", tag, "packs/")
    .split("\n")
    .filter(Boolean)
    .find((dir) => manifestAt(tag, dir)?.header.uuid === current.header.uuid);
  if (!previousDir) {
    console.log(`${PACK} did not exist at ${tag}; skipping the check`);
    return;
  }
  const changes = resourcePackChanges(
    git("diff", "--name-only", "--no-renames", "-z", tag, "HEAD")
      .split("\0")
      .filter(Boolean),
  );
  const failure = checkResourcePackVersion({
    tag,
    ...changes,
    previousVersion: manifestAt(tag, previousDir).header.version,
    currentVersion: current.header.version,
  });
  if (failure) {
    console.error(`::error::${failure}`);
    process.exitCode = 1;
    return;
  }
  console.log(
    changes.changed || changes.generatorInputsChanged
      ? `${PACK} or its generator inputs changed since ${tag} and its version was bumped`
      : `${PACK} is unchanged since ${tag}`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main(process.argv[2]);
}
