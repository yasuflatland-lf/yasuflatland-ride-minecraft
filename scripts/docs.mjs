import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, posix } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const FIELDS = [
  "Status",
  "Acceptance condition",
  "Decided in",
  "Date",
  "Supersedes",
  "Supersedes in part",
  "Extends",
  "Related",
  "Pull requests",
];
const KINDS = FIELDS.slice(4, 8);
const START = "<!-- adr-index:start -->";
const END = "<!-- adr-index:end -->";
const INDEX = "docs/adr/README.md";
const problem = (path, line, message) => ({ path, line, message });

export function parseAdr(path, text) {
  const lines = text.split(/\r?\n/);
  const title = /^# (\d{4})\. (.+)$/.exec(lines[0]);
  const end = lines.findIndex((line) => /^## /.test(line));
  const fields = [];
  const invalidLines = [];
  for (let i = 1; i < (end < 0 ? lines.length : end); i++) {
    if (!lines[i].trim()) continue;
    const field = /^- ([^:]+): (.*)$/.exec(lines[i]);
    if (field) fields.push({ name: field[1], value: field[2], line: i + 1 });
    else if (lines[i].startsWith("- ")) invalidLines.push(i + 1);
  }
  const relations = fields
    .filter((field) => KINDS.includes(field.name))
    .map((field) => {
      const match = /^\[(\d{4})\]\(([^)]+)\)(?:: (.+))?$/.exec(field.value);
      return {
        ...field,
        target: match?.[1],
        link: match?.[2],
        scope: match?.[3],
      };
    });
  return {
    path,
    number: title?.[1],
    title: title?.[2],
    fields,
    relations,
    invalidLines,
  };
}

export function parseAdrs(files) {
  return Object.entries(files)
    .filter(
      ([path]) =>
        path.startsWith("docs/adr/") && path.endsWith(".md") && path !== INDEX,
    )
    .map(([path, text]) => parseAdr(path, text));
}

export function checkAdrIdentity(adrs) {
  const errors = [];
  const seen = new Set();
  for (const adr of adrs) {
    const match = /^(\d{4})-[a-z0-9-]+\.md$/.exec(basename(adr.path));
    if (!match) errors.push(problem(adr.path, 1, "Invalid ADR file name"));
    if (!adr.number || adr.number !== match?.[1])
      errors.push(
        problem(
          adr.path,
          1,
          "Title must be # NNNN. <Title> and match the file number",
        ),
      );
    if (match && seen.has(match[1]))
      errors.push(problem(adr.path, 1, "Duplicate ADR number"));
    if (match) seen.add(match[1]);
  }
  return errors;
}

export function checkMetadata(adrs) {
  const errors = [];
  for (const adr of adrs) {
    const fail = (line, message) =>
      errors.push(problem(adr.path, line, message));
    for (const line of adr.invalidLines)
      fail(line, "Expected a metadata list field");
    let previous = -1;
    const seen = new Set();
    const status = adr.fields.find((field) => field.name === "Status")?.value;
    for (const field of adr.fields) {
      const rank = FIELDS.indexOf(field.name);
      if (rank < 0) {
        fail(field.line, `Unknown metadata field: ${field.name}`);
        continue;
      }
      if (rank < previous) fail(field.line, "Metadata fields are out of order");
      previous = rank;
      if (!KINDS.includes(field.name) && seen.has(field.name))
        fail(field.line, `Duplicate ${field.name}`);
      seen.add(field.name);
      let valid = field.value.trim().length > 0;
      if (field.name === "Status")
        valid = /^(Proposed|Accepted|Rejected)$/.test(field.value);
      if (field.name === "Date")
        valid =
          /^\d{4}-\d{2}-\d{2}$/.test(field.value) &&
          !Number.isNaN(Date.parse(field.value)) &&
          new Date(field.value).toISOString().slice(0, 10) === field.value;
      if (field.name === "Acceptance condition" && status !== "Proposed")
        valid = false;
      if (field.name === "Decided in" || field.name === "Pull requests")
        valid =
          /^#[1-9]\d*(?:, #[1-9]\d*)*$/.test(field.value) &&
          (field.name !== "Decided in" ||
            status === "Accepted" ||
            status === "Rejected");
      if (KINDS.includes(field.name)) {
        const relation = adr.relations.find((item) => item.line === field.line);
        valid =
          !!relation?.target &&
          (field.name !== "Supersedes in part" || !!relation.scope?.trim()) &&
          (field.name !== "Supersedes" || relation.scope === undefined);
      }
      if (!valid) fail(field.line, `Invalid ${field.name} value`);
    }
    for (const name of ["Status", "Date"])
      if (!seen.has(name)) fail(1, `Missing ${name}`);
    if (status === "Proposed" && !seen.has("Acceptance condition"))
      fail(1, "Missing Acceptance condition");
  }
  return errors;
}

export function checkRelationTargets(adrs) {
  const targets = new Map(adrs.map((adr) => [adr.number, adr]));
  const errors = [];
  for (const adr of adrs)
    for (const relation of adr.relations) {
      if (!relation.target) continue;
      const target = targets.get(relation.target);
      if (!target)
        errors.push(
          problem(
            adr.path,
            relation.line,
            `Missing relation target ${relation.target}`,
          ),
        );
      else if (relation.link !== basename(target.path))
        errors.push(
          problem(
            adr.path,
            relation.line,
            `Relation link must be ${basename(target.path)}`,
          ),
        );
      if (relation.name !== "Related" && relation.target >= adr.number)
        errors.push(
          problem(
            adr.path,
            relation.line,
            "Normative relation must point to a lower ADR number",
          ),
        );
    }
  return errors;
}

export function checkRelationConflicts(adrs) {
  const errors = [];
  for (const adr of adrs) {
    const seen = new Map();
    for (const relation of adr.relations) {
      if (!relation.target) continue;
      const kinds = seen.get(relation.target) ?? new Set();
      if (kinds.has(relation.name))
        errors.push(
          problem(
            adr.path,
            relation.line,
            "Duplicate relation kind and target",
          ),
        );
      else if (
        kinds.size &&
        (relation.name === "Supersedes" || kinds.has("Supersedes"))
      )
        errors.push(
          problem(
            adr.path,
            relation.line,
            "Supersedes cannot coexist with another relation to the same target",
          ),
        );
      kinds.add(relation.name);
      seen.set(relation.target, kinds);
    }
  }
  return errors;
}

export function generateIndex(adrs) {
  const sorted = [...adrs].sort((a, b) =>
    (a.number ?? "").localeCompare(b.number ?? ""),
  );
  const link = (adr) => `[${adr.number}](${basename(adr.path)})`;
  const cell = (value) => value.replaceAll("|", "\\|");
  const rows = sorted.map((adr) => {
    const status = [
      adr.fields.find((field) => field.name === "Status")?.value ?? "",
    ];
    for (const [kind, inverse] of [
      ["Supersedes", "superseded by"],
      ["Supersedes in part", "superseded in part by"],
      ["Extends", "extended by"],
    ]) {
      const sources = sorted.filter((source) =>
        source.relations.some(
          (relation) =>
            relation.name === kind && relation.target === adr.number,
        ),
      );
      if (sources.length)
        status.push(`${inverse} ${sources.map(link).join(", ")}`);
    }
    return `| ${link(adr)} | ${cell(adr.title ?? "")} | ${cell(status.join("; "))} |`;
  });
  return ["| No. | Decision | Status |", "| --- | --- | --- |", ...rows].join(
    "\n",
  );
}

export function writeIndex(text, adrs) {
  const start = text.indexOf(START);
  const end = text.indexOf(END);
  if (
    start < 0 ||
    end < start ||
    text.indexOf(START, start + START.length) >= 0 ||
    text.indexOf(END, end + END.length) >= 0
  )
    throw new Error("Expected one ordered pair of ADR index markers");
  return `${text.slice(0, start + START.length)}\n${generateIndex(adrs)}\n${text.slice(end)}`;
}

export function checkIndex(files, adrs) {
  const text = files[INDEX] ?? "";
  try {
    if (writeIndex(text, adrs) === text) return [];
  } catch {
    return [
      problem(INDEX, 1, "Expected one ordered pair of ADR index markers"),
    ];
  }
  return [
    problem(
      INDEX,
      text.slice(0, text.indexOf(START)).split("\n").length,
      "ADR index is stale; run pnpm run docs",
    ),
  ];
}

// Mask code while preserving offsets so diagnostics retain their original lines.
function withoutCode(text) {
  let fence;
  const masked = text
    .split("\n")
    .map((line) => {
      const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
      if (fence) {
        if (
          marker &&
          marker[1][0] === fence[0] &&
          marker[1].length >= fence.length &&
          !marker[2].trim()
        )
          fence = undefined;
        return " ".repeat(line.length);
      }
      if (marker) {
        fence = marker[1];
        return " ".repeat(line.length);
      }
      return line;
    })
    .join("\n");
  const runs = [...masked.matchAll(/`+/g)];
  let result = "";
  let cursor = 0;
  for (let i = 0; i < runs.length; i++) {
    const open = runs[i];
    const closing = runs.findIndex(
      (run, index) => index > i && run[0].length === open[0].length,
    );
    if (closing < 0) continue;
    const end = runs[closing].index + runs[closing][0].length;
    result +=
      masked.slice(cursor, open.index) +
      masked.slice(open.index, end).replace(/[^\n]/g, " ");
    cursor = end;
    i = closing;
  }
  return result + masked.slice(cursor);
}

export function checkLinks(files) {
  const errors = [];
  const paths = Object.keys(files);
  for (const [path, text] of Object.entries(files)) {
    if (
      !(
        path === "README.md" ||
        path === "AGENTS.md" ||
        (path.startsWith("docs/") && path.endsWith(".md"))
      )
    )
      continue;
    const masked = withoutCode(text);
    const definitions = new Map();
    const destinations = [];
    const normalize = (label) =>
      label.trim().replace(/\s+/g, " ").toLowerCase();
    for (const match of masked.matchAll(
      /^ {0,3}\[([^\]]+)\]:\s*(<[^>]*>|\S+)/gm,
    )) {
      definitions.set(normalize(match[1]), match[2]);
      destinations.push({ value: match[2], index: match.index });
    }
    for (const match of masked.matchAll(
      /!?\[([^\]\n]*)\]\(\s*(<[^>]*>|(?:[^\s()\\]|\\.|\([^()]*\))*)(?:\s+["'][^\n]*["'])?\s*\)/g,
    ))
      destinations.push({ value: match[2], index: match.index });
    for (const match of masked.matchAll(
      /!?\[([^\]\n]+)\](?:\[([^\]\n]*)\])?(?![(:])/g,
    )) {
      const value = definitions.get(normalize(match[2] || match[1]));
      if (value) destinations.push({ value, index: match.index });
    }
    for (const { value, index } of destinations) {
      const target = value.replace(/^<|>$/g, "").split("#")[0];
      if (!target || /^(https?:|mailto:)/i.test(target)) continue;
      let decoded;
      try {
        decoded = decodeURIComponent(target.replace(/\\([\\()[\] ])/g, "$1"));
      } catch {
        decoded = target;
      }
      const resolved = posix
        .normalize(posix.join(posix.dirname(path), decoded))
        .replace(/\/$/, "");
      if (
        !Object.hasOwn(files, resolved) &&
        !paths.some((file) =>
          file.startsWith(resolved === "." ? "" : `${resolved}/`),
        )
      )
        errors.push(
          problem(
            path,
            text.slice(0, index).split("\n").length,
            `Broken relative link: ${target}`,
          ),
        );
    }
  }
  return errors;
}

function loadFiles(root) {
  const files = {};
  const paths = execFileSync(
    "git",
    ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
    { cwd: root, encoding: "utf8" },
  ).split("\0");
  for (const path of paths) {
    if (!path || !existsSync(join(root, path))) continue;
    files[path] = path.endsWith(".md")
      ? readFileSync(join(root, path), "utf8")
      : "";
  }
  return files;
}

function main(mode) {
  if (!["--write", "--check"].includes(mode))
    throw new Error("Usage: node scripts/docs.mjs --write|--check");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const files = loadFiles(root);
  const adrs = parseAdrs(files);
  if (mode === "--write") {
    writeFileSync(join(root, INDEX), writeIndex(files[INDEX], adrs));
    return;
  }
  const errors = [
    ...checkAdrIdentity(adrs),
    ...checkMetadata(adrs),
    ...checkRelationTargets(adrs),
    ...checkRelationConflicts(adrs),
    ...checkIndex(files, adrs),
    ...checkLinks(files),
  ];
  for (const error of errors)
    console.error(`${error.path}:${error.line}: ${error.message}`);
  if (errors.length) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(process.argv[2]);
