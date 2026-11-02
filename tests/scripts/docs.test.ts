import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  checkAdrIdentity,
  checkIndex,
  checkLinks,
  checkMetadata,
  checkRelationConflicts,
  checkRelationTargets,
  generateIndex,
  parseAdr,
  parseAdrs,
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
          const status = [statuses[value - 1]];
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
        "- Status: Proposed\n- Acceptance condition: owner decision pending (see #PRNUMBER)",
      errors: [],
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
