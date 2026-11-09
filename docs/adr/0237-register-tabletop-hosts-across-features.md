# 0237. Register tabletop hosts across features

- Status: Proposed
- Acceptance condition: review of issue #1441
- Date: 2026-11-09
- Supersedes in part: [0185](0185-put-things-on-the-camp-table-instead-of-sitting-at-it.md): rule 11, tabletop entity lookup and aiming live in shared infrastructure
- Related: [0046](0046-organize-each-layer-by-feature.md): features exchange dependencies through bootstrap

## Context

The [Beach Chair design](../designs/2026-11-09-beach-chair-design.md#table-form) needs resort hosts to accept camp items without imports between features. The shared domain and application placement rules already accept a host type and surface, and infrastructure now recognizes Camp Tables and folded Beach Chairs through the shared registry.

## Decision

Bootstrap creates one `TopHostRegistry` and passes it to camp and resort installation. Camp registers the Camp Table surface, availability predicate, refusal hints, and legacy spot mapping, plus the oven and lantern entity types, host properties, and footprints. Resort receives the registry but registers nothing in this refactor.

Shared infrastructure resolves registered hosts and scans their dimension for registered hosted entities. A host must currently pass its availability predicate. Shared aiming uses the registered surface height. Camp handlers expose a placement callback for future block forwarding and use the same tick deduplication and deferred execution for entity and callback interactions.

Fire Pit placement and the hosted-items guard retain their existing rules. The guard checks host existence regardless of host type; a change of table availability alone does not remove hosted items.

## Consequences

Camp Tables and folded Beach Chairs accept items through the registry. Camp owns its identifiers and legacy marker migration; shared code imports no feature. Hosts register their own surfaces without changing camp handlers; the later Beach Chair integration uses entity interactions and removes the unused forwarding callback. Registry wiring is explicit at installation, and no global registry is created by adapters.
