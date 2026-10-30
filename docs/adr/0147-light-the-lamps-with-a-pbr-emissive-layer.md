# 0147. Light the lamps with a PBR emissive layer

- Status: Accepted
- Date: 2026-10-25
- Extends: 0020, 0115, 0136
- Amended in part by: [0192](0192-suv-detailed-body.md) (Proposed)

## Context

The owner wants every vehicle's switched lamps to glow at maximum PBR emissivity (#598). The existing render controllers switch lamp bones between `entity` and `entity_emissive`, which only supplies the legacy alpha-mask glow. Each kind has a palette atlas whose lamp colors stay the same across all sixteen paints. A texture set on a paint atlas would emit even with the lights off because texture sets are static.

[Microsoft's Vibrant Visuals resource pack documentation](https://learn.microsoft.com/en-us/minecraft/creator/documents/vibrantvisuals/vvresourcepacks?view=minecraft-bedrock-stable) supports entity texture sets under `textures/entity` and requires the `pbr` capability and engine version 1.21.120 or newer. These are stable Resource Pack features, requiring neither experimental toggles nor beta APIs (0001). The owner approved both manifest changes. BDS 1.26.52.3 already exceeds that minimum (0136).

## Decision

Generate one default-paint lit atlas, one MER atlas, and one texture set per kind, shared by all paints. The lit atlas keeps every non-lamp texel unchanged and sets the lamp swatches' alpha to 0 for the legacy full-bright material. MER uses RGB `(0, 255, 255)` for lit swatches and `(0, 0, 255)` elsewhere, with alpha 255 throughout: metalness 0, emissivity at its maximum 255 only on lamps, and roughness 255. Each generator declares `EMISSIVE_LIT`, `MER_LIT`, `MER_OFF`, and name-derived `LIT_SLOTS` locally; isolated Python execution prevents importing a shared helper.

| Kind | Lit swatches | Overlay bones | Switch |
|---|---|---|---|
| SUV | `light` | `headlights` (headlights and fog lamps) | `yasu_ride:headlights` |
| Sports boat | `light` | `headlights` | `yasu_ride:headlights` |
| Camper | `lens`, `dome` | `headlights`, `ceiling_lights` | `yasu_ride:headlights`, `yasu_ride:ceiling_lights`, independently |
| Bulldozer | `lens`, `amber` | `headlights`, `beacon` | `yasu_ride:headlights` for both |

Append a conditional `.lit` render controller using the same geometry, `Texture.lit`, and `Material.lamp_lit` (`entity_emissive`). Hide every bone by default, then show only the table's bones while their properties are on. The camper overlay runs when either light property is on. The base pass keeps `Material.lamp` (`entity`) for those bones and hides each exactly while its corresponding property is on, avoiding double drawing. Existing visibility rules and the bulldozer monitor pass stay intact. The camper ceiling rim keeps MER_OFF and its existing color alpha. Bone animations apply in both passes, including flight, bank, doors, and tracks.

Each texture set has format `1.16.100`, a `color` of `<kind>_lit`, and `metalness_emissive_roughness` of `<kind>_lit_mer`. Add `capabilities: ["pbr"]`, raise the Resource Pack's `min_engine_version` to `[1, 21, 120]`, and bump its header, module, and Behavior Pack dependency from 0.1.127 to 0.1.128 (0015). Pack changes require a server restart, not `/reload`.

### Device verification

The owner confirmed the lamp glow on a Vibrant Visuals device on 2026-10-26 (#598), using the checks L1-L8 in [the manual checklist](../manual-test.md). The planned overlay was kept, and no fallback was applied. The device model, game build, and the result of each row are not recorded here.

The fallback stays defined for a device that behaves differently. If MER fails with `entity_emissive`, or alpha-0 lenses disappear, switch the overlay to `Material.lamp` and make the lit swatches alpha 255, which loses the legacy full-bright lamps. Automated in-game tests cannot cover this because rendering is client side.

## Consequences

The PBR effect requires Vibrant Visuals or a compatible ray tracing renderer; some mobile devices will show no PBR change. Legacy devices are intended to keep the alpha-mask glow. The previously opaque camper and sports boat headlights now become full-bright when switched on there too. With lights off, the paint atlases and lens appearance stay unchanged. The owner's device check above confirmed the Vibrant Visuals result.

Clients older than Minecraft 1.21.120 will refuse the Resource Pack. The Behavior Pack's `min_engine_version` stays unchanged on purpose: the Resource Pack is what needs the newer engine, and a world that includes both packs is refused on the Resource Pack alone. The compatibility change was stated in the pull request. The scripts, properties, light blocks, light reach, and levels do not change. Tail/brake lights, turn signals, hover glow discs, and the monitor remain outside this decision. The tent lantern is left for a later decision. Previews and icons retain the existing renderer's lamp colors.
