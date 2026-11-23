# 0237. Register tabletop hosts across features

- Status: Proposed
- Acceptance condition: review of issue #1441
- Date: 2026-11-09
- Supersedes in part: [0185](0185-put-things-on-the-camp-table-instead-of-sitting-at-it.md): rule 11, tabletop entity lookup and aiming live in shared infrastructure
- Related: [0046](0046-organize-each-layer-by-feature.md): features exchange dependencies through bootstrap

## Context

The Beach Chair design needs resort hosts to accept camp items without imports between features. The shared domain and application placement rules already accept a host type and surface, and infrastructure now recognizes Camp Tables and folded Beach Chairs through the shared registry.

## Decision

Bootstrap creates one `TopHostRegistry` and passes it to camp and resort installation. Camp registers the Camp Table surface, availability predicate, refusal hints, and legacy spot mapping, plus the oven and lantern entity types, host properties, and footprints under branded kind IDs assigned in camp. Resort registers the folded Beach Chair and the Dining Table as hosts. Its tabletop test hook looks up the requested item kind in the same registry.

Shared infrastructure resolves registered hosts and scans their dimension for registered hosted entities. A host must currently pass its availability predicate. Shared aiming uses the registered surface height. Camp handlers expose a placement callback for Dining Table block interactions and use the same tick deduplication and deferred execution for entity and callback interactions.

The shared tabletop rule uses the payment and spawn rollback in 0185 for every registered host. Camp declares the Fire Pit as a fixed-spot host when decoding saved item markers. A fixed-spot host accepts an integer spot index and rejects point coordinates. The guard checks host existence regardless of host type; a change of table availability alone does not remove hosted items.

## Consequences

Camp Tables and folded Beach Chairs accept items through the registry. Camp owns its identifiers and legacy marker migration; shared code imports no feature. Hosts register their own surfaces without changing camp handlers. The folded Beach Chair uses entity interactions. Registry wiring is explicit at installation, and no global registry is created by adapters.
