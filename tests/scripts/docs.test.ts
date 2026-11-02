import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  checkAdrIdentity,
  checkIndex,
  checkLinks,
  checkMetadata,
  checkRelationConflicts,
  checkRelationTargets,
  checkSpecAgreement,
  checkSpecBasisSources,
  checkSpecClosure,
  checkSpecFormat,
  checkSpecIndex,
  checkSpecLinks,
  generateIndex,
  parseAdr,
  parseAdrs,
  parseSpec,
  parseSpecs,
  writeIndex,
} from "../../scripts/docs.mjs";

const number = (value: number) => String(value).padStart(4, "0");
const path = (value: number) => `docs/adr/${number(value)}-decision.md`;
const link = (value: number) =>
  `[${number(value)}](${number(value)}-decision.md)`;
const kinds = [
  "Supersedes",
  "Supersedes in part",
  "Extends",
  "Related",
] as const;
const word = fc.stringMatching(/^[a-z][a-z0-9 ]{0,30}$/);
const metadata = fc.record({
  status: fc.constantFrom("Proposed", "Accepted", "Rejected"),
  title: word,
  scope: word,
  day: fc.integer({ min: 1, max: 28 }),
  kind: fc.constantFrom(...kinds),
  optional: fc.boolean(),
});

function document(
  value: number,
  fields = "",
  title = "Decision",
  status = "Accepted",
) {
  const condition =
    status === "Proposed" ? "- Acceptance condition: test passes\n" : "";
  return `# ${number(value)}. ${title}\n\n- Status: ${status}\n${condition}- Date: 2026-10-22\n${fields}\n## Context\n\nContext.\n`;
}

const graph = fc.integer({ min: 2, max: 15 }).chain((size) =>
  fc
    .uniqueArray(
      fc.record({
        source: fc.integer({ min: 2, max: size }),
        targetSeed: fc.nat({ max: 100 }),
        kind: fc.constantFrom(...kinds),
      }),
      {
        selector: (edge) =>
          `${edge.source}:${edge.targetSeed % (edge.source - 1)}`,
        maxLength: size * 2,
      },
    )
    .chain((edges) =>
      fc
        .array(fc.constantFrom("Proposed", "Accepted", "Rejected"), {
          minLength: size,
          maxLength: size,
        })
        .map((statuses) => ({ edges, statuses })),
    )
    .map(({ edges, statuses }) => {
      const relations = edges.map((edge) => ({
        source: edge.source,
        target: 1 + (edge.targetSeed % (edge.source - 1)),
        kind: edge.kind,
      }));
      const files: Record<string, string> = {};
      for (let value = size; value >= 1; value--) {
        const fields = relations
          .filter((edge) => edge.source === value)
          .sort((a, b) => kinds.indexOf(a.kind) - kinds.indexOf(b.kind))
          .map(
            (edge) =>
              `- ${edge.kind}: ${link(edge.target)}${edge.kind === "Supersedes in part" ? ": replaced rule" : ""}\n`,
          )
          .join("");
        files[path(value)] = document(
          value,
          fields,
          "Decision",
          statuses[value - 1],
        );
      }
      return { files, relations, size, statuses };
    }),
);

const specPath = "docs/specs/vehicle.md";
const specIndexPath = "docs/specs/README.md";
const specLink = (value: number) =>
  `[${number(value)}](../adr/${number(value)}-decision.md)`;
const specEntry = "- [Vehicles](vehicle.md): Vehicle rules.";

function specDocument({
  sources = [1],
  excluded = [] as number[],
  basis = [1],
  agreement = "Accepted",
  implementation = "`src/vehicle.ts` (`drive`)",
} = {}) {
  return [
    "# Vehicles",
    "",
    "- Scope: Vehicle rules.",
    "- Verified at: 1c67689e",
    ...sources.map((value) => `- Source: ${specLink(value)}`),
    ...excluded.map((value) => `- Excluded: ${specLink(value)}: Other rules.`),
    "",
    "## Rules",
    "",
    "### Driving",
    "",
    "- Applies to: Vehicles.",
    "- Rule: Drive every tick.",
    `- Agreement: ${agreement}`,
    ...basis.map(
      (value) => `- Basis: ${specLink(value)} Decision, "Drive every tick."`,
    ),
    `- Implementation: ${implementation}`,
    "- Verification: Unit tests.",
    "",
    "## Open issues",
    "",
    "- None.",
    "",
  ].join("\n");
}

describe("spec documentation checks", () => {
  const files = {
    [path(1)]: document(1),
    [specPath]: specDocument(),
    [specIndexPath]: `# Specs\n\n${specEntry}\n`,
    "src/vehicle.ts": "",
  };

  it("accepts a valid fixture in all six checks and allows absent specs", () => {
    const specs = parseSpecs(files);
    const adrs = parseAdrs(files);
    expect(checkSpecFormat(specs)).toEqual([]);
    expect(checkSpecLinks(specs, adrs, files)).toEqual([]);
    expect(checkSpecAgreement(specs, adrs)).toEqual([]);
    expect(checkSpecBasisSources(specs)).toEqual([]);
    expect(checkSpecClosure(specs, adrs)).toEqual([]);
    expect(checkSpecIndex(files, specs)).toEqual([]);
    expect(parseSpecs({ "docs/specs/nested/ignored.md": "" })).toEqual([]);
    expect(parseSpecs({})).toEqual([]);
    expect(checkSpecFormat([])).toEqual([]);
    expect(checkSpecLinks([], [], {})).toEqual([]);
    expect(checkSpecAgreement([], [])).toEqual([]);
    expect(checkSpecBasisSources([])).toEqual([]);
    expect(checkSpecClosure([], [])).toEqual([]);
    expect(checkSpecIndex({}, [])).toEqual([]);
  });

  it("preserves field lines and joins indented continuations without parsing them as fields", () => {
    fc.assert(
      fc.property(word, (continuation) => {
        const text = specDocument({ sources: [1, 2], basis: [1, 2] })
          .replace(
            "- Rule: Drive every tick.",
            `- Rule:\n  ${continuation}\n  - Detail: More.`,
          )
          .replace(
            "- Verification: Unit tests.",
            "- Verification:\n  Unit tests.",
          );
        const spec = parseSpec(specPath, text);
        expect(spec.header.map((field) => field.name)).toEqual([
          "Scope",
          "Verified at",
          "Source",
          "Source",
        ]);
        expect(spec.rules[0]?.fields.map((field) => field.name)).toEqual([
          "Applies to",
          "Rule",
          "Agreement",
          "Basis",
          "Basis",
          "Implementation",
          "Verification",
        ]);
        const rule = spec.rules[0]?.fields.find(
          (field) => field.name === "Rule",
        );
        expect(rule?.value).toBe(`${continuation.trim()} - Detail: More.`);
        expect(rule?.line).toBe(text.split("\n").indexOf("- Rule:") + 1);
        expect(checkSpecFormat([spec])).toEqual([]);
      }),
    );
  });

  it.each([
    [
      "wrong header order",
      "- Scope: Vehicle rules.\n- Verified at: 1c67689e",
      "- Verified at: 1c67689e\n- Scope: Vehicle rules.",
    ],
    [
      "wrong rule order",
      "- Applies to: Vehicles.\n- Rule: Drive every tick.",
      "- Rule: Drive every tick.\n- Applies to: Vehicles.",
    ],
    ["missing Open issues", "## Open issues", "## Other"],
    ["empty Open issues", "- None.", ""],
    ["invalid SHA", "1c67689e", "not-a-sha"],
    ["missing Source", `- Source: ${specLink(1)}`, ""],
    [
      "Source after Excluded",
      `- Source: ${specLink(1)}`,
      `- Excluded: ${specLink(2)}: Other rules.\n- Source: ${specLink(1)}`,
    ],
    [
      "duplicate Scope",
      "- Scope: Vehicle rules.",
      "- Scope: Vehicle rules.\n- Scope: More.",
    ],
    ["missing rule", "### Driving", "Driving"],
    ["missing field", "- Verification: Unit tests.", ""],
    [
      "duplicate field",
      "- Rule: Drive every tick.",
      "- Rule: Drive every tick.\n- Rule: Again.",
    ],
    ["invalid Agreement", "- Agreement: Accepted", "- Agreement: Rejected"],
    ["unknown field", "- Verification: Unit tests.", "- Test: Unit tests."],
    ["extra section", "## Open issues", "## Extra\n\n## Open issues"],
  ])("rejects planted format violation: %s", (_name, before, after) => {
    expect(
      checkSpecFormat([
        parseSpec(specPath, specDocument().replace(before, after)),
      ]),
    ).not.toEqual([]);
  });

  it("checks every ADR link and only the first implementation path per item", () => {
    const adrs = parseAdrs({ ...files, [path(2)]: document(2) });
    const valid = specDocument({
      sources: [1, 2],
      basis: [1, 2],
      implementation:
        "`src/` (`missing/symbol`, `another/symbol`), `src/vehicle.ts` `ignored/path`",
    });
    expect(checkSpecLinks([parseSpec(specPath, valid)], adrs, files)).toEqual([]);
    const combined = parseSpec(
      specPath,
      specDocument({ sources: [1, 2] }).replace(
        `- Basis: ${specLink(1)}`,
        `- Basis: ${specLink(1)} Decision,\n  ${specLink(2)}`,
      ),
    );
    expect(checkSpecFormat([combined])).toEqual([]);
    expect(checkSpecLinks([combined], adrs, files)).toEqual([]);
    expect(checkSpecAgreement([combined], adrs)).toEqual([]);
    expect(checkSpecBasisSources([combined])).toEqual([]);
    expect(
      checkSpecLinks([combined], parseAdrs({ [path(1)]: document(1) }), files),
    ).not.toEqual([]);
    expect(
      checkSpecLinks(
        [parseSpec(specPath, specDocument({ implementation: "Not implemented" }))],
        adrs,
        files,
      ),
    ).toEqual([]);
    for (const [before, after] of [
      [specLink(1), "[0001](../adr/wrong.md)"],
      [specLink(1), specLink(9999)],
      [`- Basis: ${specLink(1)}`, `- Basis: ${specLink(9999)}`],
      ["`src/vehicle.ts`", "`missing/vehicle.ts`"],
      ["`src/vehicle.ts`", "`src/vehicle.tsx`"],
    ]) {
      expect(
        checkSpecLinks(
          [parseSpec(specPath, specDocument().replace(before, after))],
          adrs,
          files,
        ),
      ).not.toEqual([]);
    }
    expect(
      checkSpecLinks(
        [parseSpec(specPath, specDocument({ excluded: [9999] }))],
        adrs,
        files,
      ),
    ).not.toEqual([]);
  });

  it("derives Agreement from random Basis status sets and rejects Rejected bases", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("Accepted", "Proposed", "Rejected"), {
          minLength: 1,
          maxLength: 12,
        }),
        (statuses) => {
          const basis = statuses.map((_, index) => index + 1);
          const adrs = parseAdrs(
            Object.fromEntries(
              statuses.map((status, index) => [
                path(index + 1),
                document(index + 1, "", "Decision", status),
              ]),
            ),
          );
          const agreement = statuses.every((status) => status === "Accepted")
            ? "Accepted"
            : "Proposed";
          const specs = [
            parseSpec(specPath, specDocument({ basis, agreement })),
          ];
          expect(checkSpecAgreement(specs, adrs).length === 0).toBe(
            !statuses.includes("Rejected"),
          );
          expect(
            checkSpecAgreement(
              [
                parseSpec(
                  specPath,
                  specDocument({
                    basis,
                    agreement:
                      agreement === "Accepted" ? "Proposed" : "Accepted",
                  }),
                ),
              ],
              adrs,
            ),
          ).not.toEqual([]);
        },
      ),
    );
    expect(
      checkSpecAgreement(
        [parseSpec(specPath, specDocument({ agreement: "Proposed" }))],
        parseAdrs({ [path(1)]: document(1, "", "Decision", "Rejected") }),
      ),
    ).not.toEqual([]);
  });

  it("rejects a Basis missing from Source even when it is Excluded", () => {
    const specs = [
      parseSpec(specPath, specDocument({ basis: [1, 2], excluded: [2] })),
    ];
    expect(checkSpecBasisSources(specs)).not.toEqual([]);
    expect(
      checkSpecBasisSources([
        parseSpec(specPath, specDocument({ sources: [1, 2], basis: [1, 2] })),
      ]),
    ).toEqual([]);
  });

  it.each(kinds)("checks closure for %s", (kind) => {
    const adrs = parseAdrs({
      [path(1)]: document(1),
      [path(2)]: document(
        2,
        `- ${kind}: ${link(1)}${kind === "Supersedes in part" ? ": replaced rule" : ""}\n`,
      ),
    });
    const unclosed = checkSpecClosure(parseSpecs(files), adrs);
    expect(unclosed.length).toBe(kind.startsWith("Supersedes") ? 1 : 0);
    for (const options of [{ sources: [1, 2] }, { excluded: [2] }])
      expect(
        checkSpecClosure([parseSpec(specPath, specDocument(options))], adrs),
      ).toEqual([]);
  });

  it("rejects missing, duplicate, unknown, and stale README entries", () => {
    const specs = parseSpecs(files);
    expect(checkSpecIndex({}, specs)).not.toEqual([]);
    for (const text of [
      "# Specs\n",
      `${specEntry}\n${specEntry}\n`,
      `${specEntry}\n- [Unknown](unknown.md): Unknown rules.\n`,
      specEntry.replace("Vehicles", "Stale"),
      specEntry.replace("Vehicle rules.", "Stale scope."),
      "- [Vehicles](vehicle.md)",
    ])
      expect(checkSpecIndex({ [specIndexPath]: text }, specs)).not.toEqual([]);
  });
});

describe("ADR documentation properties", () => {
  it("round-trips generated metadata blocks without losing fields or scopes", () => {
    fc.assert(
      fc.property(metadata, ({ status, title, scope, day, kind, optional }) => {
        const fields = [
          `- Status: ${status}`,
          ...(status === "Proposed"
            ? [`- Acceptance condition: ${scope}`]
            : optional
              ? ["- Decided in: #1187, #1200"]
              : []),
          `- Date: 2026-10-${String(day).padStart(2, "0")}`,
          `- ${kind}: ${link(1)}${kind === "Supersedes" ? "" : `: ${scope}`}`,
          ...(optional ? ["- Pull requests: #1187"] : []),
        ];
        const text = `# 0002. ${title}\n\n${fields.join("\n")}\n\n## Context\n`;
        const parsed = parseAdr(path(2), text);
        expect(parsed.title).toBe(title);
        expect(parsed.number).toBe("0002");
        expect(
          parsed.fields.map((field) => `- ${field.name}: ${field.value}`),
        ).toEqual(fields);
        expect(parsed.relations[0]).toMatchObject({
          target: "0001",
          link: "0001-decision.md",
          scope: kind === "Supersedes" ? undefined : scope,
        });
        expect(checkMetadata([parsed])).toEqual([]);
      }),
    );
  });

  it("sorts random graphs and derives each inverse relation in the required order", () => {
    fc.assert(
      fc.property(graph, ({ files, relations, size, statuses }) => {
        const adrs = parseAdrs(files);
        const rows = generateIndex(adrs).split("\n").slice(2);
        expect(rows).toHaveLength(size);
        for (let value = 1; value <= size; value++) {
          const status: string[] = [statuses[value - 1] ?? ""];
          for (const [kind, inverse] of [
            ["Supersedes", "superseded by"],
            ["Supersedes in part", "superseded in part by"],
            ["Extends", "extended by"],
          ]) {
            const sources = relations
              .filter((edge) => edge.target === value && edge.kind === kind)
              .map((edge) => edge.source)
              .sort((a, b) => a - b);
            if (sources.length)
              status.push(`${inverse} ${sources.map(link).join(", ")}`);
          }
          expect(rows[value - 1]).toBe(
            `| ${link(value)} | Decision | ${status.join("; ")} |`,
          );
        }
        expect(generateIndex([...adrs].reverse())).toBe(generateIndex(adrs));
      }),
    );
  });

  it("keeps all six checks silent on valid graphs and reports planted violations", () => {
    fc.assert(
      fc.property(graph, ({ files }) => {
        const adrs = parseAdrs(files);
        const readme = writeIndex(
          "Before\n<!-- adr-index:start -->\n<!-- adr-index:end -->\nAfter\n",
          adrs,
        );
        const valid = { ...files, "docs/adr/README.md": readme };
        expect(checkAdrIdentity(adrs)).toEqual([]);
        expect(checkMetadata(adrs)).toEqual([]);
        expect(checkRelationTargets(adrs)).toEqual([]);
        expect(checkRelationConflicts(adrs)).toEqual([]);
        expect(checkIndex(valid, adrs)).toEqual([]);
        expect(checkLinks(valid)).toEqual([]);
        const planted = (fields: string) => [
          parseAdr(path(2), document(2, fields)),
        ];
        expect(
          checkAdrIdentity([
            ...adrs,
            parseAdr("docs/adr/0001-duplicate.md", document(1)),
          ]),
        ).not.toEqual([]);
        expect(
          checkAdrIdentity([parseAdr("docs/adr/wrong.md", document(1))]),
        ).not.toEqual([]);
        expect(checkMetadata(planted("- Unknown: value\n"))).not.toEqual([]);
        expect(
          checkRelationTargets(planted(`- Extends: ${link(9999)}\n`)),
        ).not.toEqual([]);
        expect(
          checkRelationConflicts(
            planted(`- Extends: ${link(1)}\n- Extends: ${link(1)}\n`),
          ),
        ).not.toEqual([]);
        expect(
          checkIndex(
            {
              ...valid,
              "docs/adr/README.md": readme.replace("| Decision |", "| Stale |"),
            },
            adrs,
          ),
        ).not.toEqual([]);
        const errors = checkLinks({
          ...valid,
          "README.md": "Heading\n[broken](missing.md#section)\n",
        });
        expect(errors).toEqual([
          {
            path: "README.md",
            line: 2,
            message: "Broken relative link: missing.md",
          },
        ]);
      }),
    );
  });
});

describe("ADR validation edge cases", () => {
  it.each([
    {
      block: "- Status: Proposed",
      errors: [{ line: 1, message: "Missing Acceptance condition" }],
    },
    {
      block:
        "- Status: Proposed\n- Acceptance condition: test passes\n- Decided in: #1",
      errors: [{ line: 5, message: "Invalid Decided in value" }],
    },
    {
      block: "- Status: Accepted\n- Acceptance condition: test passes",
      errors: [{ line: 4, message: "Invalid Acceptance condition value" }],
    },
    {
      block:
        "- Status: Proposed\n- Acceptance condition: owner decision pending (see #1188)",
      errors: [],
    },
    {
      block:
        "- Status: Proposed\n- Acceptance condition: device checks pass (tracked in PRNUMBER)",
      errors: [{ line: 4, message: "Invalid Acceptance condition value" }],
    },
  ])("checks status-specific metadata: $block", ({ block, errors }) => {
    expect(
      checkMetadata([
        parseAdr(
          path(2),
          `# 0002. Decision\n\n${block}\n- Date: 2026-10-22\n\n## Context`,
        ),
      ]),
    ).toEqual(errors.map((error) => ({ path: path(2), ...error })));
  });

  it.each([
    "- Status: Superseded",
    "- Status: Accepted\n- Status: Accepted",
    "- Status: Accepted\n- Acceptance condition: test passes",
    "- Status: Proposed\n- Decided in: #1",
    "- Status: Accepted\n- Decided in: 1",
    "- Status: Accepted\n- Date: 2026-02-30",
    "- Date: 2026-10-22\n- Status: Accepted",
    "- Status: Accepted\n- Date: 2026-10-22\n- Supersedes in part: [0001](0001-decision.md)",
    "- Status: Accepted\n- Date: 2026-10-22\n- Supersedes: [0001](0001-decision.md): scope",
    "- Status: Accepted\n- Date: 2026-10-22\n- Extended by: [0003](0003-decision.md)",
    "- Status: Accepted\n- Date: 2026-10-22\n- Invalid metadata",
  ])("rejects invalid metadata: %s", (block) => {
    expect(
      checkMetadata([
        parseAdr(path(2), `# 0002. Decision\n\n${block}\n\n## Context`),
      ]).length,
    ).toBeGreaterThan(0);
  });

  it("checks actual filenames, lower normative targets, and allows forward Related links", () => {
    const target = parseAdr(path(2), document(2));
    const source = (field: string) =>
      parseAdr(path(1), document(1, `${field}\n`));
    expect(
      checkRelationTargets([source(`- Related: ${link(2)}`), target]),
    ).toEqual([]);
    expect(
      checkRelationTargets([source(`- Extends: ${link(2)}`), target]),
    ).toHaveLength(1);
    expect(
      checkRelationTargets([source("- Related: [0002](wrong.md)"), target]),
    ).toHaveLength(1);
    expect(
      checkRelationTargets([source(`- Extends: ${link(1)}`)]),
    ).toHaveLength(1);
    for (const fields of [
      `- Supersedes: ${link(1)}\n- Related: ${link(1)}\n`,
      `- Related: ${link(1)}\n- Supersedes: ${link(1)}\n`,
    ])
      expect(
        checkRelationConflicts([parseAdr(path(2), document(2, fields))]),
      ).toHaveLength(1);
    expect(
      checkRelationConflicts([
        parseAdr(
          path(2),
          document(
            2,
            `- Supersedes in part: ${link(1)}: rule\n- Extends: ${link(1)}\n`,
          ),
        ),
      ]),
    ).toEqual([]);
  });

  it("preserves surrounding prose and rejects absent, reversed, or duplicate markers", () => {
    const text =
      "Before\n<!-- adr-index:start -->\nold\n<!-- adr-index:end -->\nAfter\n";
    const result = writeIndex(text, []);
    expect(result).toBe(
      `Before\n<!-- adr-index:start -->\n${generateIndex([])}\n<!-- adr-index:end -->\nAfter\n`,
    );
    expect(writeIndex(result, [])).toBe(result);
    for (const invalid of [
      "",
      "<!-- adr-index:end --><!-- adr-index:start -->",
      `${text}<!-- adr-index:end -->`,
    ]) {
      expect(() => writeIndex(invalid, [])).toThrow();
      expect(checkIndex({ "docs/adr/README.md": invalid }, [])).toHaveLength(1);
    }
  });

  it("resolves links with fragments, escapes, reference definitions, and nested parentheses", () => {
    const files = {
      "README.md":
        '[doc](docs/a.md#section) ![image](docs/a%20b.png) [nested](docs/a(b).md) [title](docs/a.md "Title") [angle](<docs/a b.png>) [reference][id]\n[id]: docs/a.md#section\n',
      "docs/a.md":
        "[up](../README.md) [anchor](#here) [web](https://example.com) [email](mailto:a@example.com)",
      "docs/a b.png": "",
      "docs/a(b).md": "",
    };
    expect(checkLinks(files)).toEqual([]);
    expect(
      checkLinks({ "AGENTS.md": "[x][id]\n[id]: missing.md" }).length,
    ).toBeGreaterThan(0);
    expect(checkLinks({ "src/ignored.md": "[x](missing.md)" })).toEqual([]);
  });

  it("accepts directory links only when they contain a known file", () => {
    expect(
      checkLinks({
        "README.md": "[ADRs](docs/adr/) [root](./)",
        "docs/adr/README.md": "[designs](../designs)",
        "docs/designs/nested/plan.md": "",
      }),
    ).toEqual([]);
    expect(
      checkLinks({
        "README.md": "[missing](docs/design/)",
        "docs/designs/plan.md": "",
      }),
    ).toEqual([
      {
        path: "README.md",
        line: 1,
        message: "Broken relative link: docs/design/",
      },
    ]);
  });

  it("ignores inline code and backtick or tilde fenced examples while preserving line numbers", () => {
    const text = [
      "`[x](missing.md)` and ``[x](missing.md) `example` ``",
      "```markdown",
      "[x](missing.md)",
      "````",
      "~~~",
      "[x](missing.md)",
      "~~~",
      "[real](missing.md)",
    ].join("\n");
    expect(checkLinks({ "docs/test.md": text })).toEqual([
      {
        path: "docs/test.md",
        line: 8,
        message: "Broken relative link: missing.md",
      },
    ]);
    expect(checkLinks({ "README.md": "`[real](missing.md)``" })).toHaveLength(
      1,
    );
  });
});
