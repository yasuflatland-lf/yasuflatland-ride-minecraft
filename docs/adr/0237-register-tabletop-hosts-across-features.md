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

Shared infrastructure resolves registered hosts and scans their dimension for registered hosted entities. A host must currently pass its availability predicate. Both camp item worlds use `topHostView` for the host pose, blocked footprints, and occupancy. Each camp handler uses `registerHostedOnTop` to capture the aim and slot, deduplicate per player per tick, and defer placement for both entity interactions and the Dining Table block callback. Aiming uses the registered surface height. Camp's server test hooks share the registered-host request path.

Camp's tabletop actions use the shared placement rule with the payment and spawn rollback in 0185 for every registered host. `campHostedKind` supplies the guard with each item's world operations and decodes saved markers through `decodeCampHost`. That decoder declares the Fire Pit as a fixed-spot host and shares its legacy Camp Table spot lookup with the registry entry. A fixed-spot host accepts an integer spot index and rejects point coordinates. The guard checks host existence by entity ID, independently of tabletop availability.

## Consequences

Camp Tables and folded Beach Chairs accept items through the registry. Camp owns its identifiers and legacy marker migration; shared code imports no feature. Hosts register their own surfaces without changing camp handlers. The folded Beach Chair uses entity interactions. Registry wiring is explicit at installation, and no global registry is created by adapters.
