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
const SPEC_INDEX = "docs/specs/README.md";
const SPEC_HEADER = ["Scope", "Verified at", "Source", "Excluded"];
const SPEC_FIELDS = [
  "Applies to",
  "Rule",
  "Agreement",
  "Basis",
  "Implementation",
  "Verification",
];
const problem = (path, line, message) => ({ path, line, message });

export function parseSpec(path, text) {
  const lines = text.split(/\r?\n/);
  const header = [];
  const rules = [];
  const sections = [];
  const openIssues = [];
  let section;
  let rule;
  let current;
  for (let i = 1; i < lines.length; i++) {
    const heading = /^## (.+)$/.exec(lines[i]);
    const subheading = /^### (.+)$/.exec(lines[i]);
    const field = /^- ([^:]+):\s*(.*)$/.exec(lines[i]);
    if (heading) {
      section = heading[1];
      sections.push({ name: section, line: i + 1 });
      rule = undefined;
      current = undefined;
    } else if (subheading) {
      rule = undefined;
      current = undefined;
      if (section === "Rules") {
        rule = { name: subheading[1], line: i + 1, fields: [] };
        rules.push(rule);
      }
    } else if (section === "Open issues") {
      if (/^- \S/.test(lines[i]))
        openIssues.push({ value: lines[i].slice(2), line: i + 1 });
    } else if (field && (!section || rule)) {
      current = { name: field[1], value: field[2], line: i + 1 };
      (rule ? rule.fields : header).push(current);
    } else if (/^\s+\S/.test(lines[i]) && current) {
      current.value = `${current.value} ${lines[i].trim()}`.trim();
    } else if (lines[i].trim()) {
      current = undefined;
    }
  }
  return {
    path,
    title: /^# (.+)$/.exec(lines[0])?.[1],
    header,
    rules,
    sections,
    openIssues,
  };
}

export function parseSpecs(files) {
  return Object.entries(files)
    .filter(
      ([path]) => /^docs\/specs\/[^/]+\.md$/.test(path) && path !== SPEC_INDEX,
    )
    .map(([path, text]) => parseSpec(path, text));
}

export function checkSpecFormat(specs) {
  const errors = [];
  for (const spec of specs) {
    const fail = (line, message) =>
      errors.push(problem(spec.path, line, message));
    const checkFields = (fields, names, repeated, required, line) => {
      let previous = -1;
      const seen = new Set();
      for (const field of fields) {
        const rank = names.indexOf(field.name);
        if (rank < 0) fail(field.line, `Unknown spec field: ${field.name}`);
        else {
          if (rank < previous) fail(field.line, "Spec fields are out of order");
          previous = rank;
          if (seen.has(field.name) && !repeated.includes(field.name))
            fail(field.line, `Duplicate ${field.name}`);
          seen.add(field.name);
        }
        if (!field.value.trim()) fail(field.line, `Empty ${field.name}`);
      }
      for (const name of required)
        if (!seen.has(name)) fail(line, `Missing ${name}`);
    };
    if (!spec.title) fail(1, "Missing spec title");
    checkFields(
      spec.header,
      SPEC_HEADER,
      ["Source", "Excluded"],
      SPEC_HEADER.slice(0, 3),
      1,
    );
    for (const field of spec.header)
      if (
        field.name === "Verified at" &&
        !/^[a-f0-9]{7,12}$/i.test(field.value)
      )
        fail(
          field.line,
          "Verified at must be a 7-12 character hexadecimal SHA",
        );
    if (
      spec.sections.map((section) => section.name).join("\n") !==
      "Rules\nOpen issues"
    )
      fail(1, "Expected exactly Rules then Open issues sections");
    if (!spec.rules.length) fail(1, "Expected at least one rule under Rules");
    for (const rule of spec.rules) {
      checkFields(rule.fields, SPEC_FIELDS, ["Basis"], SPEC_FIELDS, rule.line);
      for (const field of rule.fields)
        if (
          field.name === "Agreement" &&
          !/^(Accepted|Proposed)$/.test(field.value)
        )
          fail(field.line, "Agreement must be Accepted or Proposed");
    }
    if (!spec.openIssues.length) fail(1, "Open issues must contain a bullet");
  }
  return errors;
}

function specLinks(fields) {
  return fields.flatMap((field) =>
    [...field.value.matchAll(/\[(\d{4})\]\(([^)]+)\)/g)].map((match) => ({
      number: match[1],
      link: match[2],
      line: field.line,
    })),
  );
}

// A root-level file such as `package.json` has no slash, so a known file
// extension also marks a token as a path.
function isPathToken(token) {
  return (
    token !== undefined &&
    (token.includes("/") ||
      /^[\w.-]+\.(?:json|md|mjs|cjs|ts|js|py|ya?ml|toml)$/.test(token))
  );
}

function implementationPaths(value) {
  const paths = [];
  let depth = 0;
  let found = false;
  // Commas inside symbol lists or backticks do not start another path item.
  for (const token of value.matchAll(/`([^`]+)`|[(),]/g)) {
    if (token[0] === "(") depth++;
    else if (token[0] === ")") depth = Math.max(0, depth - 1);
    else if (!depth && token[0] === ",") found = false;
    else if (!depth && !found && isPathToken(token[1])) {
      paths.push(token[1]);
      found = true;
    }
  }
  return paths;
}

export function checkSpecLinks(specs, adrs, files) {
  const errors = [];
  const targets = new Map(adrs.map((adr) => [adr.number, adr]));
  const paths = Object.keys(files);
  for (const spec of specs) {
    const fields = [
      ...spec.header.filter((field) =>
        ["Source", "Excluded"].includes(field.name),
      ),
      ...spec.rules.flatMap((rule) =>
        rule.fields.filter((field) => field.name === "Basis"),
      ),
    ];
    for (const field of fields) {
      const links = specLinks([field]);
      if (!links.length)
        errors.push(
          problem(spec.path, field.line, `Missing ADR link in ${field.name}`),
        );
      for (const link of links) {
        const target = targets.get(link.number);
        if (!target || link.link !== `../adr/${basename(target.path)}`)
          errors.push(
            problem(
              spec.path,
              link.line,
              `Invalid spec ADR link: ${link.number}`,
            ),
          );
      }
    }
    for (const rule of spec.rules)
      for (const field of rule.fields.filter(
        (field) => field.name === "Implementation",
      ))
        for (const target of implementationPaths(field.value))
          if (
            !Object.hasOwn(files, target) &&
            !paths.some((path) =>
              path.startsWith(`${target.replace(/\/$/, "")}/`),
            )
          )
            errors.push(
              problem(
                spec.path,
                field.line,
                `Missing implementation path: ${target}`,
              ),
            );
  }
  return errors;
}

export function checkSpecAgreement(specs, adrs) {
  const errors = [];
  const statuses = new Map(
    adrs.map((adr) => [
      adr.number,
      adr.fields.find((field) => field.name === "Status")?.value,
    ]),
  );
  for (const spec of specs)
    for (const rule of spec.rules) {
      const basis = specLinks(
        rule.fields.filter((field) => field.name === "Basis"),
      );
      const agreement = rule.fields.find((field) => field.name === "Agreement");
      const expected = basis.every(
        (link) => statuses.get(link.number) === "Accepted",
      )
        ? "Accepted"
        : "Proposed";
      if (agreement?.value !== expected)
        errors.push(
          problem(
            spec.path,
            agreement?.line ?? rule.line,
            `Agreement must be ${expected}`,
          ),
        );
      for (const link of basis)
        if (statuses.get(link.number) === "Rejected")
          errors.push(
            problem(spec.path, link.line, `Rejected Basis ADR: ${link.number}`),
          );
    }
  return errors;
}

export function checkSpecBasisSources(specs) {
  const errors = [];
  for (const spec of specs) {
    const sources = new Set(
      specLinks(spec.header.filter((field) => field.name === "Source")).map(
        (link) => link.number,
      ),
    );
    for (const rule of spec.rules)
      for (const link of specLinks(
        rule.fields.filter((field) => field.name === "Basis"),
      ))
        if (!sources.has(link.number))
          errors.push(
            problem(
              spec.path,
              link.line,
              `Basis ADR must be a Source: ${link.number}`,
            ),
          );
  }
  return errors;
}

export function checkSpecClosure(specs, adrs) {
  const errors = [];
  for (const spec of specs) {
    const sources = specLinks(
      spec.header.filter((field) => field.name === "Source"),
    );
    // Only the first link of an Excluded line names the excluded ADR; later
    // links sit inside its reason.
    const included = new Set([
      ...sources.map((link) => link.number),
      ...spec.header
        .filter((field) => field.name === "Excluded")
        .flatMap((field) => specLinks([field]).slice(0, 1))
        .map((link) => link.number),
    ]);
    for (const source of sources)
      for (const adr of adrs)
        if (
          !included.has(adr.number) &&
          adr.relations.some(
            (relation) =>
              ["Supersedes", "Supersedes in part"].includes(relation.name) &&
              relation.target === source.number,
          )
        )
          errors.push(
            problem(
              spec.path,
              source.line,
              `Source or Excluded must include superseding ADR: ${adr.number}`,
            ),
          );
  }
  return errors;
}

export function checkSpecCoverage(specs, adrs) {
  const errors = [];
  const sources = new Set(
    specs.flatMap((spec) =>
      specLinks(spec.header.filter((field) => field.name === "Source")).map(
        (link) => link.number,
      ),
    ),
  );
  for (const adr of adrs) {
    const status = adr.fields.find((field) => field.name === "Status")?.value;
    const superseded = adrs.some(
      (other) =>
        other !== adr &&
        other.relations.some(
          (relation) =>
            relation.name === "Supersedes" && relation.target === adr.number,
        ),
    );
    if (
      (status === "Accepted" || status === "Proposed") &&
      !superseded &&
      !sources.has(adr.number)
    )
      errors.push(problem(adr.path, 1, "Live ADR is not a Source of any spec"));
  }
  return errors;
}

export function checkSpecIndex(files, specs) {
  const text = files[SPEC_INDEX];
  if (text === undefined)
    return specs.length ? [problem(SPEC_INDEX, 1, "Missing spec index")] : [];
  const errors = [];
  const seen = new Set();
  const targets = new Map(specs.map((spec) => [basename(spec.path), spec]));
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const entry = /^- \[([^\]]+)\]\(([^)]+\.md)\)(?:: (.*))?$/.exec(line);
    if (!entry) continue;
    const [, title, file, scope] = entry;
    const spec = targets.get(file);
    if (seen.has(file))
      errors.push(
        problem(SPEC_INDEX, index + 1, `Duplicate spec entry: ${file}`),
      );
    seen.add(file);
    if (!spec)
      errors.push(
        problem(SPEC_INDEX, index + 1, `Unknown spec entry: ${file}`),
      );
    else if (
      title !== spec.title ||
      scope !== spec.header.find((field) => field.name === "Scope")?.value
    )
      errors.push(
        problem(SPEC_INDEX, index + 1, `Stale spec title or Scope: ${file}`),
      );
  }
  for (const file of targets.keys())
    if (!seen.has(file))
      errors.push(problem(SPEC_INDEX, 1, `Missing spec entry: ${file}`));
  return errors;
}

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
      if (field.name === "Acceptance condition")
        valid =
          valid && status === "Proposed" && !field.value.includes("PRNUMBER");
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
  const specs = parseSpecs(files);
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
    ...checkSpecFormat(specs),
    ...checkSpecLinks(specs, adrs, files),
    ...checkSpecAgreement(specs, adrs),
    ...checkSpecBasisSources(specs),
    ...checkSpecClosure(specs, adrs),
    ...checkSpecCoverage(specs, adrs),
    ...checkSpecIndex(files, specs),
  ];
  for (const error of errors)
    console.error(`${error.path}:${error.line}: ${error.message}`);
  if (errors.length) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href)
  main(process.argv[2]);
