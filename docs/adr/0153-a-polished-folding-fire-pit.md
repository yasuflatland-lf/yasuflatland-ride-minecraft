# 0153. A polished folding fire pit

- Status: Proposed
- Date: 2026-10-26
- Extends: 0122, 0144, 0147

## Context

The outside camping catalog includes a chair, tent, and table. The owner supplied front, side, interior, and material references for a compact stainless folding fire pit. Its metal surfaces should reflect their surroundings in Vibrant Visuals. The ordinary flint and steel item should ignite it, and another tap should put the fire out.

## Decision

Add `yasu_ride:fire_pit_item` to the outside catalog and craft it from iron ingots and iron bars. Place its persistent entity on a clear ground cell outside vehicle space; three hits fold it back into one item, as with the other portable camp gear. A client-synced `yasu_ride:lit` boolean begins false. An unlit pit accepts only `minecraft:flint_and_steel`; ignition costs one durability in Survival. Any tap on a lit pit extinguishes it. Creative mode leaves the tool undamaged.

Generate the folding frame, shallow faceted basin, shelf, and handle as a 32-pixel atlas model. Its texture set has metalness 255 and roughness 0 or near zero on the polished steel. The ember bone is visible only while lit, and a server interval emits flame and smoke particles for each loaded lit pit. The Resource Pack version advances to 0.1.136 (0015).

## Consequences

Metallic reflections require a client rendering mode that supports the PBR texture set. Legacy rendering still shows the stainless color atlas, lit embers, and particles. The fire is visual: it does not spread or burn players, cook items, or place fire blocks. The server checks loaded lit pits every four ticks for particle emission. If a client shows poor reflections, adjust the atlas roughness after checking on that client.
