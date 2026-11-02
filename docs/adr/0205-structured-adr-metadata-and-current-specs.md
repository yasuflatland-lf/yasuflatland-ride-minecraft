# 0205. Structured ADR metadata and current specs

- Status: Proposed
- Date: 2026-11-02
- Extends: [0010](0010-testing-strategy.md): docs checks in CI

## Context

There are 202 ADR files numbered 0001 to 0204, with 0160 and 0200 unused. Their metadata uses more than 14 field names. Status mixes agreement with inverse relations such as "extended by" and "superseded in part by". A relation can appear up to three times: on the newer ADR, on the older ADR, and in the hand-written README table. The copies can disagree about the kind or scope of a change.

Design and spike notes are spread across three places: files directly under `docs/`, a nested design directory, and owner-local, uncommitted drafts. A reader must follow the ADR history to find the current rules for a topic.

## Decision

- Give every ADR a title of `# NNNN. Title` in `NNNN-short-kebab-title.md`, followed by metadata and the Context, Decision, and Consequences sections. Keep existing Decision text unchanged; a new ADR records a change to an Accepted decision.
- Use only these metadata fields, in this order, omitting optional fields with no entries:
  - `Status`: exactly one of `Proposed`, `Accepted`, or `Rejected`. It states agreement only, without relations or parentheses.
  - `Acceptance condition: <text>`: optional and only with `Proposed`.
  - `Decided in: #<number>[, #<number>]`: optional and only with `Accepted` or `Rejected`. Part 2/4 fills this field; part 1/4 adds it only where an ADR already names the PR or issue that decided it.
  - `Date: YYYY-MM-DD`: required; existing dates stay unchanged.
  - `Supersedes: [NNNN](file.md)`: the whole older ADR no longer applies, one line per target.
  - `Supersedes in part: [NNNN](file.md): <scope>`: one line per target, with a required short scope naming the replaced rule or section.
  - `Extends: [NNNN](file.md)[: <scope>]`: adds to an older ADR without replacing any rule, one line per target.
  - `Related: [NNNN](file.md)[: <scope>]`: a non-normative link, one line per target. An old parenthetical scope becomes the `: <scope>` suffix.
  - `Pull requests: #N, #N`: optional; keep existing lists.
- Write each relation only as an outgoing line on the newer ADR. Do not store inverse relation fields or relation text in Status. Targets of `Supersedes`, `Supersedes in part`, and `Extends` must have lower numbers; `Related` may point either way. Links use the target's actual filename. Do not repeat a target with the same kind or combine `Supersedes` with another kind for that target.
- Generate the ADR README index between its markers with `pnpm docs`; never edit it by hand. Sort rows by number and show the title, agreement state, and derived inverse relations, ordered as superseded, superseded in part, and extended, with linked numbers sorted within each kind.
- Run `pnpm lint:docs` in CI, extending the testing strategy (0010). Check filenames and titles, metadata fields and values, relation targets and duplicates, the generated index, and relative Markdown links in `docs/`, `README.md`, and `AGENTS.md`.
- Keep spike findings in `docs/spikes/` and committed design notes in `docs/designs/`. Owner-local drafts stay uncommitted.
- Parts 3/4 and 4/4 add `docs/specs/<topic>.md` as the current rules per topic. When a spec and an ADR disagree, the ADR Decision is the source.

## Consequences

Inverse relations exist only in the generated index, so an older ADR needs no metadata edit when a newer ADR replaces or extends it. A relation has one stored kind and scope. Metadata, index, and link errors fail CI rather than waiting for a reader to find them.

A topic spec can go stale. The PR that changes behavior updates the affected spec as well as recording any new decision in an ADR. Specs provide the current rules, while ADRs preserve their reasons and history; disagreements are resolved against the ADR Decision.
