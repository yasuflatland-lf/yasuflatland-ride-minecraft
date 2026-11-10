# Documentation

- Scope: ADR identity, metadata, relations and generated index, documentation links and CI checks, note locations, and current topic spec validation.
- Verified at: 9d4b0bbc
- Source: [0205](../adr/0205-structured-adr-metadata-and-current-specs.md)
- Excluded: [0010](../adr/0010-testing-strategy.md): the broader testing strategy; its documentation-check extension is covered by 0205.

## Rules

### ADR file name and title

- Applies to: Markdown files under `docs/adr/`, except its `README.md`, loaded by `parseAdrs`.
- Rule: `checkAdrIdentity` requires a basename matching `NNNN-<suffix>.md`, where the suffix is a nonempty sequence of lowercase ASCII letters, digits and hyphens. The first line must match `# NNNN. <Title>` with a nonempty title and the same number as the filename. File numbers must be unique. The checker does not require the suffix to reproduce the title or enforce word boundaries within it.
- Agreement: Proposed
- Basis: [0205](../adr/0205-structured-adr-metadata-and-current-specs.md) Decision, "Give every ADR a title of `# NNNN. Title` in `NNNN-short-kebab-title.md`, followed by metadata and the Context, Decision, and Consequences sections."
- Implementation: `scripts/docs.mjs` (`parseAdr`, `parseAdrs`, `checkAdrIdentity`), `docs/adr/README.md` (Writing a new ADR)
- Verification: Read `checkAdrIdentity` and `tests/scripts/docs.test.ts`, which includes duplicate-number and invalid-filename fixtures. Not verified: tests were not run; no check of required ADR body sections is implemented.

### Updating design decisions

- Applies to: changes to existing ADRs and their affected topic specs.
- Rule: Update existing ADR text, including Accepted Decisions, to reflect the current specification, keeping the applicable rules, rationale, consequences, spec references, and Open issues consistent. Git preserves earlier revisions. Value, dimension, and threshold tuning, typo fixes, and implementation details that preserve the design approach do not require a new ADR. A separate ADR is warranted when a distinct decision needs its own context, alternatives, and tradeoffs, such as a new architectural boundary, platform constraint, or design approach. Reversing an Accepted decision alone does not require a new ADR. Status continues to record agreement.
- Agreement: Proposed
- Basis: [0205](../adr/0205-structured-adr-metadata-and-current-specs.md) Decision, "Update existing ADR text, including Accepted Decisions, to reflect the current specification; Git preserves earlier revisions."; "Do not create an ADR solely for tuning values, dimensions, thresholds, typo fixes, or implementation details that preserve the design approach."
- Implementation: `AGENTS.md` (Changing a decision), `docs/adr/README.md` (Updating an existing ADR), `docs/specs/README.md`
- Verification: Read the repository guidance and ADR 0205 for consistent editing and new-ADR criteria. This is a contributor workflow rule; the documentation checker does not enforce the choice between editing an ADR and adding one.

### ADR metadata

- Applies to: the metadata block after an ADR's title and before the first line beginning `## `, or the remainder of the file when there is no such heading.
- Rule: `parseAdr` reads `- Name: value` fields in that block; `checkMetadata` rejects other lines beginning `- `, unknown fields, empty values, out-of-order fields, and duplicate fields except relation kinds. Other non-field prose is ignored. `FIELDS` defines the allowed order: Status, Acceptance condition, Decided in, Date, Supersedes, Supersedes in part, Extends, Related, Pull requests. Status and Date are required. Status is exactly Proposed, Accepted or Rejected. Acceptance condition is required with Proposed, forbidden with other statuses, and must not contain the placeholder `PRNUMBER`. Decided in is optional and allowed only with Accepted or Rejected. Decided in and Pull requests use comma-and-space-separated positive issue or PR references, each beginning `#`, without leading zeroes. Date must use `YYYY-MM-DD` and round-trip through the JavaScript date parser as a valid calendar date. Relations use `[NNNN](filename)` with an optional `: <scope>` suffix: Supersedes forbids a scope, Supersedes in part requires a nonblank scope, and Extends and Related allow one.
- Agreement: Proposed
- Basis: [0205](../adr/0205-structured-adr-metadata-and-current-specs.md) Decision, "Use only these metadata fields, in this order, omitting optional fields with no entries:"
- Implementation: `scripts/docs.mjs` (`FIELDS`, `KINDS`, `parseAdr`, `checkMetadata`), `docs/adr/README.md` (Metadata fields and rules)
- Verification: Read the parser and validator against the metadata round-trip properties and status-specific, ordering, duplicate, invalid-date, scope and malformed-field fixtures in `tests/scripts/docs.test.ts`. Not verified: tests were not run; the checker validates the present file without comparing its dates or PR lists with earlier revisions.

### Outgoing ADR relations

- Applies to: the relation fields parsed from ADR metadata.
- Rule: Only outgoing relation kinds in `KINDS` are allowed; inverse field names are rejected as unknown metadata. `checkRelationTargets` requires every parsed target to exist and its link to equal the target's actual basename. Supersedes, Supersedes in part and Extends must point to a lower ADR number; Related may point either way, including to the same number. `checkRelationConflicts` rejects a repeated kind and target within an ADR and rejects Supersedes combined with any other kind for the same target. Other combinations of distinct kinds are allowed, including Supersedes in part with Extends.
- Agreement: Proposed
- Basis: [0205](../adr/0205-structured-adr-metadata-and-current-specs.md) Decision, "Write each relation only as an outgoing line on the newer ADR."; "Targets of `Supersedes`, `Supersedes in part`, and `Extends` must have lower numbers; `Related` may point either way."
- Implementation: `scripts/docs.mjs` (`KINDS`, `checkMetadata`, `checkRelationTargets`, `checkRelationConflicts`)
- Verification: Read the relation validators and the random-graph properties and explicit forward Related, wrong-filename, duplicate-kind, Supersedes-conflict and partial-supersession-with-extension fixtures in `tests/scripts/docs.test.ts`. Not verified: tests were not run; relation scopes are checked for syntax, not whether they accurately describe the affected rules.

### Generated ADR index

- Applies to: the generated table in `docs/adr/README.md`.
- Rule: `pnpm run docs` invokes `node scripts/docs.mjs --write`, which rewrites only the ADR index between `<!-- adr-index:start -->` and `<!-- adr-index:end -->`, preserving surrounding text. `writeIndex` requires exactly one ordered pair of those markers. `generateIndex` sorts ADR number strings with `localeCompare`, emits linked numbers, titles and Status values, and escapes table pipes in titles and status text. It derives inverse relations from outgoing Supersedes, Supersedes in part and Extends, in that order, with linked source numbers sorted within each kind; Related produces no inverse entry. `checkIndex` compares the existing text with the generated result and reports stale content or invalid markers. Write mode returns after writing the index and does not run the validation checks.
- Agreement: Proposed
- Basis: [0205](../adr/0205-structured-adr-metadata-and-current-specs.md) Decision, "Generate the ADR README index between its markers with `pnpm run docs`; never edit it by hand."; "Sort rows by number and show the title, agreement state, and derived inverse relations, ordered as superseded, superseded in part, and extended, with linked numbers sorted within each kind."
- Implementation: `scripts/docs.mjs` (`START`, `END`, `INDEX`, `generateIndex`, `writeIndex`, `checkIndex`, `main`), `package.json` (`docs`), `docs/adr/README.md`
- Verification: Read the generation and comparison code, the random-graph ordering properties, and marker, idempotence, surrounding-prose and stale-index fixtures in `tests/scripts/docs.test.ts`. Not verified: tests and index generation were not run; the current generated table was not validated by executing `checkIndex`.

### Documentation links

- Applies to: `README.md`, `AGENTS.md`, and Markdown files recursively under `docs/`, among the tracked and unignored untracked files loaded by `loadFiles`.
- Rule: `checkLinks` masks inline backtick code and backtick or tilde fenced code, then collects inline link and image destinations, reference definitions, and references whose normalized labels resolve to definitions. It resolves relative destinations from the containing document, removes fragments, decodes URL escapes and supported Markdown escapes, and accepts an existing file or a directory containing any loaded file. Empty destinations, fragment-only links, HTTP, HTTPS and mailto destinations are skipped. Fragment existence and remote destinations are not checked; undefined reference labels do not themselves produce an error. Files outside the scope are not scanned for Markdown links.
- Agreement: Proposed
- Basis: [0205](../adr/0205-structured-adr-metadata-and-current-specs.md) Decision, "Check filenames and titles, metadata fields and values, relation targets and duplicates, the generated index, and relative Markdown links in `docs/`, `README.md`, and `AGENTS.md`."
- Implementation: `scripts/docs.mjs` (`loadFiles`, `withoutCode`, `checkLinks`)
- Verification: Read the link scanner and fixtures for escaped destinations, fragments, reference definitions, nested parentheses, directory targets, ignored code and excluded paths in `tests/scripts/docs.test.ts`. Not verified: tests and the repository-wide link check were not run; remote resources and fragment targets are outside the check.

### Documentation checks in CI

- Applies to: the quick job of the Unit Tests workflow on pull requests and pushes to main, and local `pnpm lint:docs` runs.
- Rule: `package.json` maps `lint:docs` to `node scripts/docs.mjs --check`; `.github/workflows/unit-test.yml` runs it as `pnpm run lint:docs` in the quick job. Check mode loads files, parses ADRs and specs, and collects diagnostics from every checker before setting a failing exit code if any exist. `checkAdrIdentity` checks names, titles and unique numbers; `checkMetadata` checks metadata syntax, order and values; `checkRelationTargets` checks target existence, filenames and normative direction; `checkRelationConflicts` checks duplicate and incompatible relations; `checkIndex` checks the generated ADR table; `checkLinks` checks relative documentation destinations. It also runs `checkSpecFormat` for spec structure and fields, `checkSpecLinks` for ADR links and recognized implementation paths, `checkSpecAgreement` for agreement derived from Basis statuses and rejected bases, `checkSpecBasisSources` for Basis inclusion in Source, `checkSpecClosure` for superseding ADR inclusion, `checkSpecCoverage` for live ADR coverage across specs, and `checkSpecIndex` for matching topic entries. The spec checks are detailed below.
- Agreement: Proposed
- Basis: [0205](../adr/0205-structured-adr-metadata-and-current-specs.md) Decision, "Run `pnpm lint:docs` in CI, extending the testing strategy (0010)."
- Implementation: `package.json` (`lint:docs`), `.github/workflows/unit-test.yml` (`quick`), `scripts/docs.mjs` (`loadFiles`, `main`, `checkAdrIdentity`, `checkMetadata`, `checkRelationTargets`, `checkRelationConflicts`, `checkIndex`, `checkLinks`, `checkSpecFormat`, `checkSpecLinks`, `checkSpecAgreement`, `checkSpecBasisSources`, `checkSpecClosure`, `checkSpecCoverage`, `checkSpecIndex`)
- Verification: Read the package command, workflow triggers and step, and the complete check-mode call list. `tests/scripts/docs.test.ts` contains fixtures for each checker. Not verified: the documentation command, tests and CI workflow were not run; the workflow's success on this checkout is not established.

### Spike and design note locations

- Applies to: repository spike findings and committed design notes.
- Rule: The repository has spike findings under `docs/spikes/` and committed design notes under `docs/designs/`. ADR 0205 documents these locations and keeping owner-local drafts uncommitted; the documentation script has no placement or draft-commit check.
- Agreement: Proposed
- Basis: [0205](../adr/0205-structured-adr-metadata-and-current-specs.md) Decision, "Keep spike findings in `docs/spikes/` and committed design notes in `docs/designs/`. Owner-local drafts stay uncommitted."
- Implementation: `docs/spikes/`, `docs/designs/`, `docs/adr/0205-structured-adr-metadata-and-current-specs.md` (Decision), `scripts/docs.mjs` (`main`)
- Verification: Listed both note directories and `docs/`. Root-level documents are `docs/installing-on-a-realm.md`, `docs/installing-on-ipad.md`, `docs/manual-test.md`, `docs/releasing.md` and `docs/upgrading.md`; their titles and opening text describe installation, testing, releases or upgrades, rather than misplaced spike or design notes. `docs/specs/README.md` describes the separate topic-spec location. Not verified: no check enforces note placement or that owner-local drafts remain uncommitted; no audit of owner-local files was performed.

### Current topic specs

- Applies to: direct `docs/specs/<topic>.md` files except `docs/specs/README.md`; nested Markdown files are not parsed as specs.
- Rule: `parseSpec` reads a first-line Markdown title, header fields, Rules subheadings and their fields, and Open issues bullets, joining indented field continuations. `checkSpecFormat` requires nonempty header values in `SPEC_HEADER` order: Scope, Verified at, Source, Excluded; Scope, Verified at and Source are required, Source and Excluded may repeat, and other header fields or duplicates are rejected. Verified at must match the hexadecimal SHA pattern and length defined in `checkSpecFormat`; commit existence is not checked. The only level-two sections must be Rules then Open issues, with at least one rule and one Open issues bullet. Each rule requires nonempty fields in `SPEC_FIELDS` order: Applies to, Rule, Agreement, Basis, Implementation, Verification; only Basis may repeat. Agreement must be Accepted or Proposed. `checkSpecLinks` requires each Source, Excluded and Basis field to contain an ADR link and validates every recognized numbered ADR link against the actual `../adr/` filename; it also checks recognized implementation paths for an existing loaded file or a directory containing one. `implementationPaths` recognizes only the first path-like backticked token per comma-separated item outside parentheses, allowing parenthesized symbols without path checks. `checkSpecAgreement` requires Accepted when every Basis ADR is Accepted, otherwise Proposed, and rejects any Rejected Basis ADR. `checkSpecBasisSources` requires every Basis number to appear in Source; Excluded does not satisfy it. `checkSpecClosure` requires each ADR that directly Supersedes or Supersedes in part a Source to appear as a Source or the first ADR link of an Excluded field; Extends and Related do not require inclusion. `checkSpecCoverage` requires every Accepted or Proposed ADR not targeted by any full Supersedes relation to be a Source of some spec, regardless of the superseding ADR's status; partial supersession and Excluded entries do not remove that requirement. `checkSpecIndex` requires a topic bullet for every parsed spec, with link text matching its title and the text after `: ` matching its Scope exactly, and rejects recognized duplicate or unknown entries. These checks validate structure and references; they do not verify Basis quotations, verification claims, or whether a rule accurately describes its implementation.
- Agreement: Proposed
- Basis: [0205](../adr/0205-structured-adr-metadata-and-current-specs.md) Decision, "Parts 3/4 and 4/4 add `docs/specs/<topic>.md` as the current rules per topic; the implementation is the source of truth; the spec states what the implementation does and lists each difference from an ADR under Open issues for a person to fix by editing the ADR or adding a superseding ADR."
- Implementation: `scripts/docs.mjs` (`SPEC_INDEX`, `SPEC_HEADER`, `SPEC_FIELDS`, `parseSpec`, `parseSpecs`, `implementationPaths`, `checkSpecFormat`, `checkSpecLinks`, `checkSpecAgreement`, `checkSpecBasisSources`, `checkSpecClosure`, `checkSpecCoverage`, `checkSpecIndex`), `docs/specs/README.md`
- Verification: Read all spec parsers and checkers against `tests/scripts/docs.test.ts`, including planted format violations, implementation-path recognition, randomized Basis statuses, closure, coverage and index fixtures. Not verified: tests and documentation checks were not run; `docs/specs/README.md` has no entry for this new file and was left unchanged as requested, so `checkSpecIndex` would report a missing entry.

## Open issues

- ADR 0205 Context says "There are 202 ADR files numbered 0001 to 0204, with 0160 and 0200 unused"; the repository now has 203 numbered ADR files through 0205, with 0160 and 0200 still unused (`docs/adr/`); the ADR needs an edit or a superseding ADR.
- ADR 0205 Decision says every ADR has metadata followed by Context, Decision and Consequences sections; the implementation checks identity and metadata but never requires those body sections (`scripts/docs.mjs`, `checkAdrIdentity`, `parseAdr`, `checkMetadata`); the ADR needs an edit or a superseding ADR.
- ADR 0205 Decision says Acceptance condition is optional with Proposed; the implementation requires it for every Proposed ADR and rejects the `PRNUMBER` placeholder (`scripts/docs.mjs`, `checkMetadata`); the ADR needs an edit or a superseding ADR.
- ADR 0205 Decision says "Part 2/4 fills this field" for Decided in; the repository has no ADR metadata line beginning `- Decided in:` (a repository-wide metadata search found zero), and the implementation never requires that field (`docs/adr/`, `scripts/docs.mjs`, `checkMetadata`); the ADR needs an edit or a superseding ADR.
- ADR 0205 Decision names ADR and relative Markdown link checks for CI and describes topic specs only in its final bullet; the implementation additionally enforces spec format, ADR and implementation links, derived agreement, Basis sources, supersession closure, live ADR coverage and the spec index (`scripts/docs.mjs`, `checkSpecFormat`, `checkSpecLinks`, `checkSpecAgreement`, `checkSpecBasisSources`, `checkSpecClosure`, `checkSpecCoverage`, `checkSpecIndex`), with some of these documented in `docs/specs/README.md`; the ADR needs an edit or a superseding ADR.
- ADR 0205 Decision says spike findings belong in `docs/spikes/`, committed design notes in `docs/designs/`, and owner-local drafts stay uncommitted; the implementation has these directories but no check enforcing those boundaries or the draft restriction (`docs/spikes/`, `docs/designs/`, `scripts/docs.mjs`, `main`); the ADR needs an edit or a superseding ADR.
- ADR 0205 Decision says "existing dates stay unchanged"; the implementation validates calendar dates but does not compare them with earlier revisions (`scripts/docs.mjs`, `checkMetadata`); the ADR needs an edit or a superseding ADR.
