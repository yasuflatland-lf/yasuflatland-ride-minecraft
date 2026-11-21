# Model conventions and rendered previews

- Scope: The rules every vehicle model file follows (front direction, bone names, rotation assemblies), the block geometry rule for invisible blocks, the shared texture tooling the generators use, the camper preview texture density limit, and how the SUV, sports boat, camper, bulldozer and scooter README previews and the pack icons are rendered from the model files and kept fresh.
- Verified at: 7267bd8a
- Source: [0255](../adr/0255-forbid-visible-coplanar-faces-with-a-ratcheted-model-test.md)
- Source: [0252](../adr/0252-budget-client-entity-texture-memory.md)
- Source: [0009](../adr/0009-vehicle-model-conventions.md)
- Source: [0016](../adr/0016-readme-preview-rendered-from-model.md)
- Source: [0027](../adr/0027-readme-previews-in-three-poses.md)
- Source: [0045](../adr/0045-submarine-preview.md)
- Source: [0049](../adr/0049-pack-icons-rendered-from-model.md)
- Source: [0057](../adr/0057-skip-model-check-when-inputs-unchanged.md)
- Source: [0056](../adr/0056-sports-boat-previews.md)
- Source: [0067](../adr/0067-camper.md)
- Source: [0251](../adr/0251-add-the-scooter-kind.md)
- Source: [0101](../adr/0101-give-invisible-blocks-a-hidden-cube.md)
- Source: [0108](../adr/0108-two-items-on-each-shelf-board-and-the-table.md)
- Source: [0123](../adr/0123-a-fridge-in-place-of-the-camper-shelf.md)
- Source: [0147](../adr/0147-light-the-lamps-with-a-pbr-emissive-layer.md)
- Source: [0167](../adr/0167-compound-rotation-assemblies-as-a-vehicle-neutral-rule.md)
- Source: [0190](../adr/0190-ribbed-camper-shell-atlas.md)
- Source: [0248](../adr/0248-treat-generated-pack-files-as-build-outputs.md)
- Source: [0193](../adr/0193-shared-texture-tooling.md)
- Source: [0197](../adr/0197-emit-camper-hover-particles-below-the-discs.md)
- Source: [0234](../adr/0234-plated-camper-mirrors-and-a-simpler-camper-exterior.md)
- Source: [0240](../adr/0240-resort-furniture-family.md)
- Source: [0247](../adr/0247-precise-camping-gear-rotations-textures-and-cube-budget.md)
- Source: [0256](../adr/0256-cull-buried-faces-at-generation.md)
- Excluded: [0241](../adr/0241-dining-table-top-blocks.md): Dining Table physics and hosted-item clearance belong to the resort gear topic
- Excluded: [0166](../adr/0166-tilted-two-axis-sports-boat-helm-assemblies.md): the sports boat helm assembly and its wheel exception; 0167 replaces its one-assembly limit, and the helm geometry belongs to the sports boat topic
- Excluded: [0170](../adr/0170-measure-suv-side-view-proportions.md): replaces the SUV collision dimensions of 0009, which the SUV body and seats topic states
- Excluded: [0136](../adr/0136-bulldozer.md): extends 0027 and 0045 with the bulldozer previews, which belong to the bulldozer topic; the bulldozer, camping gear, chair and tent preview sets drawn by the same renderer are not stated here
- Excluded: [0068](../adr/0068-park-the-camper-with-room-blocks.md): parked room behavior belongs to the camper topic
- Excluded: [0069](../adr/0069-camper-right-hand-drive.md): the cab layout belongs to the camper topic
- Excluded: [0199](../adr/0199-square-the-camper-front-and-fold-the-grille.md): front geometry belongs to the camper topic
- Excluded: [0226](../adr/0226-lean-and-fold-the-camper-front-panels.md): front panel shape belongs to the camper topic
- Excluded: [0192](../adr/0192-suv-detailed-body.md): SUV texture regions and materials are outside the camper companion-map scope

## Rules

### Render budget

- Applies to: Every geometry in the release and test Resource Packs.
- Rule: Count every cube and each face listed in its UV object. A box-UV cube contributes six faces. Faces × 4 estimates the vertex count. Update the geometry's fixture with every geometry change so reviewers can see the difference in counts.
- Agreement: Proposed
- Basis: [0248](../adr/0248-treat-generated-pack-files-as-build-outputs.md) defines how tests obtain generated geometry. [Issue #2181](https://github.com/yasuflatland-lf/yasuflatland-ride-minecraft/issues/2181) defines the counts.
- Implementation: `tests/packs/renderBudget.test.ts` and `tests/packs/fixtures/render-budget/`.
- Verification: `pnpm test` compares both counts to the fixture for each geometry identifier.

### Coplanar faces

- Applies to: Each geometry in the main and test Resource Packs.
- Rule: A geometry's visible coplanar face count must match its baseline. A pair counts when faces on different cubes point the same way, lie on the same plane, overlap by more than 0.0001 square model pixels, and differ by more than 12 in a mean RGB channel. Each face must sample a texel with nonzero alpha. Mutually exclusive bones and pairs of ground-contact `down` faces are exempt. Use a trim offset of at least 0.01 model pixels when separating faces.
- Agreement: Accepted
- Basis: [0255](../adr/0255-forbid-visible-coplanar-faces-with-a-ratcheted-model-test.md) Decision.
- Implementation: The [ratchet test](../../tests/packs/coplanarFaces.test.ts) uses the bound textures and exclusive bone slots in its [configuration](../../tests/packs/coplanarFaces.config.ts). Update the [geometry fixture](../../tests/packs/fixtures/coplanar/) when removing findings. An absent fixture means zero and `cleanBones` records bones that must remain free of findings.
- Verification: `pnpm test tests/packs/coplanarFaces.test.ts tests/packs/coplanarFaces.support.test.ts` checks current geometry counts and verifies the exclusions on small models.

### Client entity texture memory

- Applies to: Resource Pack client entity textures and their texture-set companion maps.
- Rule: Collect `description.textures` from every `entity/**/*.ce.json` and the string-valued `metalness_emissive_roughness`, `heightmap` and `normal` companions. Count each distinct pack file once at PNG width x height x 4 bytes. Exclude the two absent vanilla player textures (`steve` and `cape_invisible`), not missing pack assets. The measured total is 142,175,904 bytes (135.589508 MiB) and `ENTITY_TEXTURE_BUDGET_BYTES` is 136 MiB. To update the budget, measure again and round up to an 8 MiB multiple, never above 208 MiB. Stop and report measurements above that ceiling in the issue. Reject two files with identical decoded colour and MER pairs (MER pixels or uniform values), or identical MER pixels, regardless of PNG compression. Failures list the ten largest files with decoded MiB. Shared and mirrored regions and separate lit, fixed and paint geometries must preserve sampled texels and byte-identical committed previews.
- Agreement: Accepted
- Basis: [0252](../adr/0252-budget-client-entity-texture-memory.md) Decision; the iPad joined at view-distance 32 with about 162 MiB of scooter textures plus the rest of the pack without crashing.
- Implementation: `tests/packs/textureMemory.test.ts`.
- Verification: `pnpm exec vitest run tests/packs/textureMemory.test.ts` and the normal `pnpm test` suite. Temporarily enlarging one scooter paint texture to 2048 x 2048 must exceed the budget; restore it after checking the diagnostic.

The camping gear item texture atlas generation and ordering are specified in [Camper interior](camper-interior.md#item-texture-generation).

### Camper preview texture density

- Applies to: The four `camper-*.png` README previews only.
- Rule: Textured faces split at texel boundaries and merge adjacent equal colors. Along each face axis, if the texel cell count exceeds `ceil(edge length * CAMPER_CELLS_PER_UNIT)`, replace those breaks with that many uniform cells (at least one), sampling the texel under each cell center. Faces below the limit retain their exact patches. The cap is 16 cells per model unit: the fitted camera reaches at most about 16.64 supersampled or 5.55 final pixels per model unit, leaving over two cells per final pixel. This bounds preview geometry for the cab PAD's 184 by 48 texels mapped onto one-model-pixel strips and kitchen counter, range and burner faces mapping whole laminate and stainless regions, up to 192 by 192 texels, onto sub-unit strips without changing generated geometry, UVs, other previews, or icons. The face cache includes the cap.
- Agreement: Accepted
- Basis: [0067](../adr/0067-camper.md) Decision, "Limit each face axis to `max(1, ceil(edge length * 16))` cells, replacing excessive texel breaks with uniform breaks and sampling each cell center."
- Implementation: `tools/render_preview.py` (`CAMPER_CELLS_PER_UNIT`, `CAMPER_POSES`, `textured_face`, `collect_boat`).
- Verification: `tests/tools/renderPreview.test.ts` checks unchanged patches below the cap, capped cell counts and coverage, and midpoint colors with mirrored UVs and merging enabled or disabled; `pnpm model:check` checks preview freshness.

### Scooter README previews

- Applies to: The five `scooter-*.png` previews only.
- Rule: `render_scooter` draws the default white paint. It reads `scooter.geo.json`, `scooter_paint.geo.json`, `scooter_fixed.png` and `scooter_paint.png`. It uses `build().full_geometry` to rejoin the shipped fixed and paint faces in source order, then stacks the textures. `scooter_lit.geo.json` and `scooter_lit.png` supply the separate lit projection through texel centres, including oppositely mirrored UVs. The front-left, side and rear views stay in the road pose with the hover glow bones left out, as the render controller hides them on the ground. Only `scooter-flying-headlights.png` uses the flying pose: `build_flight_pose` reads the wheel folds from `animation.yasu_ride.scooter.wheels_folded` into a `FlightPose` with `SCOOTER_FLIGHT_LIFT` (24.0 model pixels), and `static_pose` raises the stand. The wheels are folded, the `glow_*` discs are drawn, rounded pools of light lie on the ground, and the shadow is fainter (`FLIGHT_SHADOW_ALPHA`). The `headlights` and `tail_lights` are on at dusk. These four views reuse the bulldozer's camera directions. Flight has its own frame, fitted to the vehicle and glow pools without the headlight beam, so it does not rescale the road views. A fifth picture, `scooter-taillights.png`, stays in the road pose without hover glow bones and lights the lamps at dusk from the rear three-quarter and frames only the `tail_lights` bone with padding (`frame_bones`, `frame_pad`), so it is rendered apart from the shared scale. Four more close-ups show the low underbody from below at the front-right (`scooter-underbody.png`), the running board from above at the front-left (`scooter-floor.png`), the front wheel from the front-left (`scooter-wheel-front.png`), and the rear wheel from the rear-left (`scooter-wheel-rear.png`). They use white paint in the road pose without hover discs, with lamps off, daylight and `MAIN_BRIGHTNESS`. Their optional `frame_box = ((x0,y0,z0), (x1,y1,z1))` selects a region in Bedrock model coordinates before the renderer mirrors x, overriding whole-bone framing without hiding geometry. `frame_pad` can expand either frame. Each close-up renders separately, preserving the camera and scale of all five existing previews. Only the lit lens glows: the lit texture and MER mask follow the opaque texels of the head lens and tail lens regions, so no bezel, hood, plate or rectangular panel glows. Faces use the camper's texel mapping with merged texels and the same 16-cells-per-unit cap, so the alpha-cut panels keep their silhouettes. The scene is part of the shared renderer; there is no scooter pack icon.
- Agreement: Proposed
- Basis: [0251](../adr/0251-add-the-scooter-kind.md) Decision, "Generate it with `tools/gen_scooter.py`"; [0067](../adr/0067-camper.md) Decision, "Limit each face axis to `max(1, ceil(edge length * 16))` cells, replacing excessive texel breaks with uniform breaks and sampling each cell center."
- Implementation: `tools/render_preview.py` (`render_scooter`, `FlightPose`, `build_flight_pose`, `static_pose`, `SCOOTER_POSES`, `SCOOTER_FLIGHT_LIFT`, `SCOOTER_LIT_TEXTURE`, `SCOOTER_LIT_GEOMETRY`, `project_lit_texture`, `scooter_glow_pools`, `ground_layers`, `Scene`, `SCENES`); `docs/images/scooter-front-left.png`; `docs/images/scooter-flying-headlights.png`; `docs/images/scooter-side.png`; `docs/images/scooter-rear.png`; `docs/images/scooter-floor.png`
- Verification: `tests/tools/renderPreview.test.ts` "renders the flying headlights from the camper's front angle plus four ground previews", "raises the stand, folds the wheels and frames flight with rounded pools instead of the beam" and "registers ordered top-level scene builders with frozen results"; `tests/tools/previewManifest.test.ts` checks all five files are owned by the scooter preview generator; `pnpm model:check` checks their freshness. Not verified: how the curved panels compare with the photos beyond the rendered images.

### Scooter generator foundation

- Applies to: Scooter generator primitives, area geometry, placeholders, and texture regions.
- Rule: `tools/gen_scooter.py` exposes an importable `build()` and writes the generated
  fixed `scooter.geo.json`, paint-only `scooter_paint.geo.json`, lit-only `scooter_lit.geo.json`, paint textures, material maps, compact lit textures, and item icon. Dimensions live in `scooter_dims.py`;
  `scooter_atlas.py` classifies paint separately from other materials and reuses the
  camper MaxRects packer. Area builders register local region faces before packing;
  each face resolves once and remains bound to its region for the atlas audit.
  `region_atlas.SharingPlan` matches exact and mirrored pixel rows within equal
  material and lit-membership keys. The first region in name order owns the slot.
  Copies use its position and placement flips, expressed as signed face UV sizes. Most repeated content is a
  mirrored panel tile inside a sheet region (body, cowl, shield, head and engine
  patch sheets), which region sharing cannot see, so each sheet first passes its
  tiles through `region_atlas.share_tiles` and lays out only the stored ones; a
  face on a copy samples the stored tile through the same `UvRect.to_atlas` flip
  rule. The fixed and PAINT registries are packed separately, each within the existing
  2048-side limit. After UV relocation, the generator writes `.cache/generated/scooter_source.geo.json`
  from `build().source_geometry`. `partition_geometry` assigns every source face
  to exactly one of the fixed and paint passes. `select_faces` then removes faces
  that sample only alpha-0 texels and drops cubes with no faces left. Every face on
  `headlights`, `tail_lights` and `glow_*` stays in its assigned pass. The paint atlas then uses one region per distinct retained-face texel rectangle,
  dropping unreferenced texels inside sheets. Identical or mirrored rectangles within
  a `share_key` group occupy one slot. Relocating the UVs preserves the sampled texels
  of every shipped face, including transparent borders, with the same geometry, quads
  and absolute UV sizes. The atlas shrinks from 1168 x 1992 to 1302 x 1204,
  saving 3,036,192 decoded bytes per stored paint (0252).
  The fixed colour and MER are stored once; 15 stored paint colours share the uniform
  paint MER value `[0, 0, 90]` in their texture sets, with no paint MER PNG.
  Paint, MER and lit-mask writers
  visit each unique storage rectangle once. Audits verify every bound face's covered
  texels against its local region pixels; sharing preserves all preview bytes.
  `UvRect.texels()` returns half-open `TexelRect` cell bounds for signed UV sizes,
  rounding all edges, including collapsed origins, to six decimals before floor/ceil.
  A collapsed axis selects exactly one cell. Audits clamp those bounds locally.
  `AtlasImage` validates RGBA byte length and clips alpha queries to the image,
  returning tight nonzero-alpha bounds or reporting the query clear.
  Capped preview samples round midpoint coordinates to nine decimal places before
  texel selection, preserving integer boundary samples when atlas regions move.
  Nonserialized region metadata supplies placement and tile flips to the preview sampler;
  mirrored integer ties select the reflected texel cell, while pack geometry and
  UV values remain the rendered inputs.
  `scooter_kit.py` builds panels and tubes in the spike frame, then mirrors their x
  coordinates and rotations into Bedrock coordinates without replacing cube objects.
  Compound rotations require named assemblies under ADR 0167.
  The rear saddle uses thin, planar triangular panels with alpha-cut outlines in one
  leather region; cube bounding rectangles and panel margins must not extend its visible
  silhouette. Its 162 cubes belong to `rear_seat`. The south-facing licence plate reads
  `MDR` over `39` from behind. On the device a side face runs U the other way than the
  generators assume, so `mirror_to_game` flips U on every north, south, east and west face
  (negative U width); the alpha-cut panel masks and the plate raster stay authored in the
  generators' own orientation. Up and down faces are untouched. A cut-out plate keeps only its
  outer face textured (`profile_plate(..., outer=...)`), because the inner face would show
  through as a mirrored ghost. The scooter preview poses flip the side faces back because the
  preview renderer reads them the other way round (`flip_side_u` in `tools/render_preview.py`).
  The rear lamp uses the spike's 0.9 group scale and 16-point, n=3 superellipse
  housing rings, with half-widths 0.82 to 1.21 and half-heights 0.46 to 0.69 before
  scaling. Its broad red lens has a vertical gradient and top highlight, a pale
  bezel with a dark outline, and a closed chrome tube rim. The short ribbed grey
  housing has a contact skirt embedded 0.1 units into the calibrated cowl wall.
  A separate eight-segment red dome sits on a chrome base above the lens, with
  two chrome cage arcs. Side flanges have dark insets, and two thin chrome
  straps trim the tapered lower housing. Chrome stays on `body`; the red lens
  and dome stay on `tail_lights`. The main face uses `lens_tail_glow`.
  The 3.0 by 3.3 plate sits directly below the housing and tilts by -0.36 radians,
  with its bottom projecting backwards clear of the cowl. Its 128 by 140 texture
  carries a blue border and large `MDR` over `39`, with four chrome corner studs
  and a thin chrome lower tube bracket.

The fixed bone order is `root`, `body`, `steer`, `wheel_front_fold`, `wheel_front`,
`glow_front`, `wheel_front_strut`, `headlights`, `wheel_rear_fold`, `wheel_rear`,
`glow_rear`, `wheel_rear_strut`, `wheel_rear_stem`, `stand`, `tail_lights`, `seat_0`, `seat_1`.
Fold and seat bones remain empty, and the two strut bones carry the strut rod cubes (the collars stay on `steer` and `body`); no bone has a rest rotation. The rear stem bone `wheel_rear_stem` (parent `body`, pivot at the cowl underside, y 13.26) carries the thin stem between the rear sleeve and the cowl: the `wheels` ground clip scales it flat (y scale 0) so the road silhouette is unchanged, and the three fold clips extend it to full length over the drop. Road previews skip it.
The strut bones follow only the fold position (the drop, never the roll), are never children of a fold bone, and use the axle pivots and parent to `steer` (front) and `body` (rear).
They cannot descend from any fold bone: all three wheel fold clips give each strut
only the corresponding fold bone's position keys, keeping it vertical while the wheel rolls. The `struts`
area follows `stand` and reserves separate front and rear builders. The steering
pivot lies on the 20.9-degree axis through the grounded front hub; axles are 23.6
model pixels apart. The running area supplies both wheels and suspension.
Whitewall discs use 256 by 256 texels over 7.48 model units, keeping both circular boundaries within
0.04 units of their ideal radii. The 64-segment black tyre skin preserves each
panel's tangent frame and takes no panel margin, so its outer envelope stays within
0.03 units of the 4.3-unit tread circle and cannot overlap the whitewall. Wheel and
fold bones retain their axle pivots. Each fixed or paint atlas across the running, stand, body, floor, rear, engine, head, and shield areas stays within 2048 by 2048
texels. The scooter requests this side limit from the shared packer, which searches
wider layouts and rejects regions that cannot fit without reducing texture detail.
Scooter previews merge adjacent texels and cap dense faces at 16 cells per model unit.

`tools/scooter_stand.py` builds the centre stand independently of the wheel and fork area.

The body area replaces the body placeholder with the tail, cowls, frame cover,
and deck and roll skins. The floor area (`tools/scooter_floor.py`) supplies the edge tubes, chrome rails,
and rubber treads. Their `body_cowl`, `body_tail`, `body_frame`, and `body_floor` assemblies
own all compound body panels and trim.
Body regions register idempotently before faces are constructed. Neighboring
mask tiles each contribute one transparent texel, preserving a two-texel gap. Curved surfaces
use broad alpha-cut panels, with seven slot rows only on the rider's right cowl,
grey joint piping, and chrome floor rails and opening trim. The combined body and floor budget is
1,130 cubes (1,005 for body and 125 for floor; currently 1,002 and 120); the production sampling reduces the spike's surface
and trim segments. Warped or concave quads split into convex triangle masks to
preserve closure coverage. Material sheets keep the mask regions cheap to pack;
the paint gradient spans the shell instead of restarting on each panel.

The rear area supplies the seat, lamp housing, tail lens, and plate through
`rear_seat`, `rear_lamp`, `rear_dome`, `rear_cage`, `rear_flange`, and
`rear_plate`. Only the red lens and dome belong to
`tail_lights`; the remaining rear geometry stays on `body`. Seat alpha masks use
24 texels per model unit and pack in descending height order so the combined
atlas fits the 2048-texel side limit. The rear allocation is 370 cubes, of which 363 are used.

The engine area supplies 319 cubes on `body`: the compact
cast housing, slotted fan disc, tilted cylinder fins, kick lever and rubber pad,
forward-looping exhaust header, shallow kidney muffler, and two body brackets.
Its named assemblies are `engine_casting` (42), `engine_fan` (32), `engine_kick`
(18), `engine_muffler` (114), and `engine_header` (66).

The head area replaces the steering and headlight placeholders with 510 cubes: 437 on `steer` and 73 on `headlights`.
Its collar, horn casting, bib, instrument bezel, lamp rim, controls, levers, and
mirrors retain the spike ring counts. Named `head_*` assemblies carry compound
panels; alpha-cut profiles and world-position paint shading keep the casting
smooth. Small atlas regions carry the silver reflector, text-free dial, dark
mirror glass, and chrome mirror backs.

The whole-vehicle budget is the sum of `AREA_CUBE_ALLOCATION` in
`tools/scooter_dims.py`; generation enforces each allocation and the
6,000-cube ceiling. The current allocations total 3,700 cubes; the generated model
has 3,666 cubes, including 32 glow cubes. The kind's entity and driving rules are in [Scooter](scooter.md).

`tools/scooter_shield.py` contributes 582 cubes: 284 on `body` and 298 on `steer`,
within a 585-cube allocation. The crowned shield, shoulder, side plates, chrome
outline, flaring spine and 0.8-scale horn stay on `body`;
the valanced front fender, curled lips, two bolts and crown shadow stay on `steer`.
Broad panels use shaded alpha-cut masks, with twisted patches split at their
measured vertices. The registered assemblies are `shield_face` (105),
`shield_trim` (66), `shield_ridge` (110), and `shield_fender` (295).
Floor runs, rails, floor-edge tubes, treads, the rider-side frame cover and suspension remain outside this area. The floor area builds the rails, edge tubes and treads; the body area builds the deck, roll skins and frame cover, and the running area builds the suspension.

The sixteen paints follow the shared dye order. Khaki and white preserve the ivory
atlas byte-for-byte, with white declared as the default paint
(ADR 0076). Recolouring affects only paint regions and retains their shading and alpha.
Material maps distinguish polished chrome, semi-gloss paint, rough rubber and leather,
smooth lenses, the plate, and cast metal. The switched lit maps cover `head_lens`,
`lens_head`, `lens_tail_glow`, and `lens_amber`; mirror glass and transparent cutouts do not glow.
A transparent 16 by 16 item icon shows the scooter facing right.

- Agreement: Proposed
- Basis: [0009](../adr/0009-vehicle-model-conventions.md), front direction and model bones; [0167](../adr/0167-compound-rotation-assemblies-as-a-vehicle-neutral-rule.md), named compound assemblies and the pending device confirmation of rotation order.
- Implementation: `tools/scooter_textures.py`, `tools/gen_scooter.py`, `tools/face_crop.py`, `tools/scooter_dims.py`, `tools/scooter_atlas.py`, `tools/scooter_kit.py`, `tools/generators.json`.
- Verification: `tests/tools/scooterTextures.test.ts` checks dye order, fixed and paint region separation, recoloured
  texels, ivory identity, material finishes, lamp masks, texture sets, and icon transparency,
  plus the separate atlas sizes and decoded colour storage and the stored tile count of every panel sheet;
  `tests/tools/regionAtlas.test.ts` checks that `share_tiles` stores no mirrored
  pair twice and maps every tile's faces onto its own texels.
  `tests/tools/scooterKit.test.ts` checks panel planes, tube alignment, mirrored
  corners, local UV resolution, measured dimensions, and deterministic builds.
  `tests/tools/scooterPaintRegions.test.ts` verifies pass ownership and recoloured face samples.
  `tests/packs/scooterModel.test.ts` pins the bone contract, assembly membership,
  whitewall circularity and tyre clearance, atlas bounds, and per-area budgets
  against the generated model and Python builders. `pnpm model:check` checks
  `docs/images/scooter-side.png` and `scooter-front-left.png` freshness.
  `tests/tools/scooterRear.test.ts` projects the generated plate face corners through its
  rotation and checks every rear-view texel against the expected upright lettering.
  `tests/tools/scooterShield.test.ts` checks symmetry, the flaring spine, standalone
  deterministic builds, region registration, finite geometry, compound membership,
  the horn scale, fender bolts, and continuous crown texture coverage.

### Camper generator modules

- Applies to: Camper geometry generation and the final cube ownership fixture.
- Rule: `region_atlas.RegionRegistry` owns immutable named texture regions and material classifications. `region_atlas` delegates deterministic MaxRects packing to `atlas_pack.search`. See [Atlas packing and cache](testing-and-ci.md#atlas-packing-and-cache) for the order trials and disk cache. Packing resolves `RegionRef.uv` in atlas texels without rotation or resampling; default gutters are two transparent texels between regions. The nested swatch atlas remains the 114 by 228 `base` region, with local swatch/hardware coordinates unchanged. A base-only pack keeps origin `(0, 0)`, geometry and texture bytes. `camper_kit.prepare_layout()` calls each area's optional `register_regions(registry)` hook in `AREA_ORDER` before a single shared pack. Layout access and the first swatch face prepare this final layout lazily, so independent `build()` calls use the same coordinates. No area resolves UVs during registration. The base region may move, and the lit swatch mask, mirror texture and mirror MER mask follow its final origin. `render_atlas` returns RGBA bytes; generation retains explicit face bindings, assigns remaining faces to the registered region containing their complete UV rectangle, and rejects faces outside all regions. It audits exact pixel-function output, region bounds/separation, and both endpoints of every emitted face. Area builders return fresh bone cube lists without file writes. The orchestrator preserves bone order and writes final ownership ranges alongside the assets. The soft-furnishing area replaces the original dinette and bedding upholstery; its three FABRIC regions join the interior materials before packing, so base UVs and companion maps follow the resulting relocated origin. Generate only `camper.png` as the khaki colour atlas, with the existing lit and mirror companion maps; do not generate per-paint files. The client base pass uses `Texture.default` directly. Item, README, and pack-icon previews use the same khaki atlas. Camper previews cap dense textured faces at `CAMPER_CELLS_PER_UNIT = 16` cells per model pixel along each edge. Round rotated edge lengths to six decimal places before taking the cell-count ceiling so trigonometric noise cannot change tessellation. Lower-density UVs retain their texel boundaries; generated pack textures retain full resolution.
- Agreement: Accepted
- Basis: [0067](../adr/0067-camper.md) Decision, "The orchestrator preserves bone order and writes final ownership ranges to `tests/packs/fixtures/camper-areas.json` without adding cube fields"
- Implementation: `tools/gen_camper.py`; `tools/camper_kit.py`; `tools/region_atlas.py`; `tools/atlas_pack.py`; `tools/camper_regions.py`; `tools/camper_golden.py`; `tools/generators.json`; `tests/packs/fixtures/camper-areas.json`; area modules listed below.
- Verification: `tests/tools/atlasPack.test.ts` compares packing results and bounded failures against the frozen original tuple implementation and checks rectangle overlap and containment properties. `tests/tools/regionAtlas.test.ts` covers deterministic packing, gutters, bounds, UV mapping, flipped placements and byte corruption. `tests/tools/camperRegions.test.ts` covers shower material declarations, approved per-region RGBA hashes, the 950 added cubes after cleanup and builds against a caller's packed registry with a relocated base. `tests/tools/camperGolden.test.ts` checks `camper_golden.py compare --golden-dir DIR [--area NAME]` with temporary compressed-model/region fixtures: match exits 0, mismatch prints a unified diff and exits 1; area selection compares the selected area's cube geometry by bone and its used regions. The CLI reads current pack geometry, registry placements and area ranges, and golden `packed_origin` values. Area labels are exact: module and spike feature names that differ appear as missing content on the corresponding side; there is no inferred aliasing. Geometry comparisons use actual selected cubes, including when an ownership range is stale. Local golden artifacts are never imported or committed. `tests/packs/camperAreas.test.ts` "assigns every final camper cube to exactly one area range", "builds independent areas repeatedly without changing the shared atlas"; `pnpm model:check` checks fixture freshness. Other areas retain their geometry and base-local atlas pixels when new regions move the packed base; the fifteen unused colour atlases are removed. `tests/tools/camperAtlas.test.ts` "writes only the khaki colour atlas and companion maps" checks generation into an empty directory.

`tools/gen_camper.py` loads the following area builders through `tool_loader.load_tool`,
then performs wheel-well cuts on the merged body and dinette seats, extracts lamps and
glass, mirrors the model, and writes the existing assets. Each builder exposes `AREA`
and `build() -> AreaCubes`, and loads only shared tools. `tools/camper_kit.py` owns
shared dimensions, cube helpers, the palette, and base atlas allocations. It registers the
soft area's fabric regions before packing. `AreaCubes.merge` concatenates cube lists in call order and preserves bone insertion
order; the orchestrator separately retains the existing bone draw order.

| Build order | Module                           | Geometry area                                                    |
| ----------- | -------------------------------- | ---------------------------------------------------------------- |
| 1           | `tools/camper_shell.py`          | Ceiling, window frames, W, vent lid, service and storage hatches |
| 2           | `tools/camper_surfaces.py`       | Carpet floor, wall veneer, backsplash tile and oak dinette table |
| 3           | `tools/camper_curtains.py`       | Side-window curtains, inserted after their respective panes      |
| 4           | `tools/camper_door.py`           | Entry door, fixed surround, fold-out step                        |
| 5           | `tools/camper_front.py`          | Nose, grille, windshield, cab-over, front lamps, mirrors         |
| 6           | `tools/camper_rear.py`           | Rear profile, lamps, bumper, ladder                              |
| 7           | `tools/camper_roof.py`           | Air conditioners, vents, edge rails, rack                        |
| 8           | `tools/camper_running.py`        | Chassis, wheels, hover glows                                     |
| 9           | `tools/camper_cab.py`            | Dashboard, controls, pedals and steering                         |
| 10          | `tools/camper_cab_seats.py`      | Rounded cab bucket seats and upholstery                          |
| 11          | `tools/camper_bed_bunk.py`       | Wooden lower-bed base, upper deck and posts                      |
| 12          | `tools/camper_fridge.py`         | Fridge carcass and doors                                         |
| 13          | `tools/camper_kitchen.py`        | Counter, sink, range and burner                                  |
| 14          | `tools/camper_kitchen_fronts.py` | Drawers and overhead cabinet fronts                              |
| 15          | `tools/camper_room.py`           | Hollow lower kitchen carcass                                     |
| 16          | `tools/camper_shower.py`         | Shower room, toilet, shower head, door                           |
| 17          | `tools/camper_ceiling.py`        | Planter hook and ceiling lamps                                   |
| 18          | `tools/camper_dinette.py`        | Empty area hook; surfaces owns the table and soft owns seating   |
| 19          | `tools/camper_soft.py`           | Dinette seats and bed/bunk upholstery                            |
| 20          | `tools/camper_arches.py`         | Interior wheel-well panels                                       |

The generator also writes `tests/packs/fixtures/camper-areas.json` through `Outputs.fixture_json` with `indent=2` and a trailing newline,
relative to the repository root. It maps each area's original cube indices through the
buried-face cull, skips fully removed cubes, and merges adjacent surviving indices.
Each area's bone entry is an inclusive `[first, last]` range or a list of such ranges for
interleaved cubes. No ownership field enters a cube.
`tests/packs/camperAreas.test.ts` checks that the ranges cover every cube exactly once.
`pnpm generate` and `pnpm model` recreate this ignored build fixture. Its generator keeps two-space indentation; parsed-content checks remain available through `tools/run_generators.py --check`.

### Preview checks in CI

- Applies to: preview and icon freshness checks in the unit workflow.
- Rule: Pull requests select preview scenes through `tools/select_model_scenes.py` and check each selected manifest entry in the `model-scene` matrix with fail-fast disabled. The SUV scene owns pack icons and the gear scene owns item icons. Non-render entries run separately in `model-others`. Main pushes run every scene plus the full `pnpm run model:check`, which remains available locally. Selection rules, skipped-job handling, and workflow tests are specified in [testing and CI](testing-and-ci.md#conditional-model-checks) and [ADR 0057](../adr/0057-skip-model-check-when-inputs-unchanged.md).

- Agreement: Accepted
- Basis: [0057](../adr/0057-skip-model-check-when-inputs-unchanged.md) Decision, per-scene selection and full main checks.
- Implementation: `.github/workflows/unit-test.yml`, `tools/select_model_scenes.py`, `tools/generators.json`, `tools/run_generators.py`.
- Verification: `tests/tools/modelCheckWorkflow.test.ts` checks matrix and aggregate gate wiring; `tests/tools/selectModelScenes.test.ts` checks selection rules. Live GitHub matrix behavior and wall-clock timing require a pull-request run.

### Front of every vehicle model

- Applies to: the geometry files `suv.geo.json`, `camper.geo.json`, `sportsboat.geo.json` and `bulldozer.geo.json`.
- Rule: The front of a vehicle is the model's -z side and its rear is +z. The sports boat generator builds the bow at +z and rotates the model half a turn about the y axis just before writing, so the written file has the bow at -z. The preview renderer relies on this: the headlight beam is drawn toward lower z.
- Agreement: Accepted
- Basis: [0009](../adr/0009-vehicle-model-conventions.md) Decision, "The front of the entity is the model's -z side"
- Implementation: `packs/yasu_ride_rp/models/entity/yasu_ride/suv.geo.json`; `packs/yasu_ride_rp/models/entity/yasu_ride/camper.geo.json`; `packs/yasu_ride_rp/models/entity/yasu_ride/sportsboat.geo.json`; `packs/yasu_ride_rp/models/entity/yasu_ride/bulldozer.geo.json`; `packs/yasu_ride_rp/models/entity/yasu_ride/scooter.geo.json`; `tools/gen_sportsboat.py` (`turn_around`); `tools/render_preview.py` (`ground_layers`, `water_layers`)
- Verification: `tests/packs/model.test.ts` "faces -z: front wheels, front doors and front seats sit at lower z than the rear ones"; `tests/packs/bulldozerModel.test.ts` "keeps the front at -z"; `tests/packs/resourcePack.test.ts` "turns each rear hub to face the rear, with the prop behind its wheel". Not verified: no test asserts the front direction of the camper or the sports boat file directly (the camper and boat tests only state it in comments and derive other positions from it), and the models in game on any device.

### Bone names

- Applies to: the five vehicle geometries, every mode.
- Rule: Every vehicle geometry has the bones `root`, which has no parent, and `body`, whose parent is `root`. A part that exists on a vehicle uses the standard bone names: the SUV has `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr`, `door_fl`, `door_fr`, `door_rl`, `door_rr` and `seat_0` to `seat_3`; the camper has the four `wheel_*` bones and `seat_0` to `seat_3` but names its entry door `door_entry`, not `door_f*`, and also has `door_glass`; the bulldozer has `seat_0` as its only seat, one door bone `door_l` and `door_glass`, and no wheel bones; the sports boat has no wheel, door or seat bones; the scooter has `wheel_front` and `wheel_rear` (under `steer` and the fold bones `wheel_front_fold` and `wheel_rear_fold`), `seat_0` and `seat_1`, and no door bones. The positions of the wheel and door pivots are stated in the SUV body and seats topic.
- Agreement: Accepted
- Basis: [0009](../adr/0009-vehicle-model-conventions.md) Decision, "Standardize the bone names as follows: `root`, `body`, `wheel_fl` / `wheel_fr` / `wheel_rl` / `wheel_rr`, `door_fl` / `door_fr` / `door_rl` / `door_rr`, `seat_0`–`seat_3`"
- Implementation: `packs/yasu_ride_rp/models/entity/yasu_ride/suv.geo.json`; `packs/yasu_ride_rp/models/entity/yasu_ride/camper.geo.json`; `packs/yasu_ride_rp/models/entity/yasu_ride/sportsboat.geo.json`; `packs/yasu_ride_rp/models/entity/yasu_ride/bulldozer.geo.json`
- Verification: `tests/packs/model.test.ts` "has all the conventional bones"; `tests/packs/camper/shell.test.ts` "connects every standard bone to root without cycles"; `tests/packs/bulldozerModel.test.ts` "has exactly the bone contract, each bone parented to body except root, body, blade, blade_wide, the lift rods, and door_glass". `tests/packs/sportsboat.test.ts` asserts the sports boat bone list. Not verified: the models in game.

### Exhaust locator

- Applies to: the SUV and camper geometries, locators on `body`.
- Rule: The SUV and the camper each mark the exhaust position with a locator named `exhaust` on `body`. The sports boat and the bulldozer have no `exhaust` locator; they name their outlets `jet_left`, `jet_right` and `thruster`.
- Agreement: Accepted
- Basis: [0009](../adr/0009-vehicle-model-conventions.md) Decision, "Mark the exhaust position with the locator `exhaust`"
- Implementation: `packs/yasu_ride_rp/models/entity/yasu_ride/suv.geo.json` (`body` locators); `packs/yasu_ride_rp/models/entity/yasu_ride/camper.geo.json` (`body` locators)
- Verification: `tests/packs/model.test.ts` "has the exhaust locator on body"; `tests/packs/camper/shell.test.ts` (the `body` locator list and `locators?.exhaust`). Not verified: where the exhaust particles show in game.

### Compound rotations only in registered assemblies

- Applies to: every cube written by the SUV, camper, sports boat and bulldozer generators, and by the generators that check with an empty table (camping gear, gas lantern, monitors); every shipped vehicle model test.
- Rule: A cube may carry rotation about two or more axes only when it belongs to a named assembly registered in its generator's `ASSEMBLIES` table; every other cube has at most one non-zero axis. A rotation angle counts as non-zero beyond a tolerance of 1e-6. Before writing a model, the generator calls `assert_axes` with the final cubes and a mapping from assembly name to its member cubes in the final coordinate frame, and `assert_axes` raises `ValueError` for a compound cube that is not an equal-by-value member. When it is also given the generator's table, it raises when an assembly is missing from the table, is registered with a non-zero count but not supplied, or holds a different number of cubes than the table declares. The bulldozer monitor screens are checked with an empty mapping. The shipped-model tests share `assertOneAxis` and `multipleAxes` from `tests/packs/oneAxis.ts` and each declares its own membership.
- Agreement: Proposed
- Basis: [0167](../adr/0167-compound-rotation-assemblies-as-a-vehicle-neutral-rule.md) Decision, "A cube may carry two or more non-zero Euler axes only when it belongs to a named assembly built through `tilt_assembly` and registered in its generator's `ASSEMBLIES` table. Other cubes retain at most one axis."; [0167](../adr/0167-compound-rotation-assemblies-as-a-vehicle-neutral-rule.md) Decision, "It rejects multi-axis cubes outside those lists, using a non-zero tolerance of 1e-6."; [0167](../adr/0167-compound-rotation-assemblies-as-a-vehicle-neutral-rule.md) Decision, "The bulldozer monitor is checked too."; [0167](../adr/0167-compound-rotation-assemblies-as-a-vehicle-neutral-rule.md) Decision, "Shipped-model tests share `tests/packs/oneAxis.ts`, with `multipleAxes` and `assertOneAxis`, and declare their own membership tables."; [0167](../adr/0167-compound-rotation-assemblies-as-a-vehicle-neutral-rule.md) Consequences, "`assert_axes(cubes, assemblies, table)` also checks that each assembly holds exactly the declared number of cubes"
- Implementation: `tools/cube_tilt.py` (`assert_axes`, `axis_count`, `compound_cubes`); `tools/gen_model.py` (`ASSEMBLIES`); `tools/suv_cabin.py` (`ASSEMBLIES`); `tools/gen_camper.py` (`ASSEMBLIES`); `tools/gen_sportsboat.py` (`ASSEMBLIES`); `tools/gen_bulldozer.py` (`ASSEMBLIES`); `tools/monitor.py`; `tests/packs/oneAxis.ts`
- Verification: `tests/packs/oneAxis.test.ts` "requires membership by cube value for any pair of nonzero axes", "allows unregistered cubes with at most one axis beyond the tolerance"; "allows compound rotations only in declared assemblies (ADR 0167)" in `tests/packs/model.test.ts`, `tests/packs/camper/shell.test.ts` and `tests/packs/bulldozerModel.test.ts`; `tests/tools/cubeTilt.test.ts` "requires a declared assembly for compound tilt results". `tests/tools/cubeTilt.test.ts` also checks rotations at the 1e-6 tolerance. The dev-only `yasu_ride_test:rotation_probe` compares compound rotations with one-axis references; device confirmation is pending the owner. Not verified: the count check of `assert_axes` has no direct test, and the generators' own `assert_axes` calls run only when a generator runs (`pnpm model:check`).

### Tilting an assembly

- Applies to: `tilt_assembly` in `tools/cube_tilt.py`, and the generators that call it.
- Rule: `tilt_assembly(cubes, pivot, axis, degrees, assembly=None, assemblies=None)` moves the cubes rigidly about one line through `pivot` along the x axis (any other axis raises `ValueError`). The default `assemblies` table is empty. When a tilted cube ends up with rotation about more than one axis, `assembly` must be a key of `assemblies`, otherwise `ValueError` is raised. A tilt of zero degrees returns copies and is still rejected when a cube is already compound and `assembly` is not registered. The cube's rotation is composed in the order z outermost, then y, then x innermost, with the tilt applied on the left of the cube's own matrix (`cube_matrix`).
- Agreement: Proposed
- Basis: [0167](../adr/0167-compound-rotation-assemblies-as-a-vehicle-neutral-rule.md) Decision, "`tilt_assembly(cubes, pivot, axis, degrees, assembly=None, assemblies=None)` requires the name to be a key in the supplied table whenever a result carries multiple axes."; [0167](../adr/0167-compound-rotation-assemblies-as-a-vehicle-neutral-rule.md) Decision, "The default table is empty; unknown or missing names fail with `ValueError`, including a zero-degree tilt of an already compound cube."; [0167](../adr/0167-compound-rotation-assemblies-as-a-vehicle-neutral-rule.md) Decision, "Preserve the rotation-order assumption from 0166: `Rz(-rz) * Ry(ry) * Rx(-rx)`, z outermost and x innermost."
- Implementation: `tools/cube_tilt.py` (`tilt_assembly`, `cube_matrix`); `tools/gen_sportsboat.py` (calls with `assembly="wheel"` and `assembly="throttle_lever"`); `tools/gen_noga_chair.py`
- Verification: `tests/tools/cubeTilt.test.ts` "tilt_assembly (ADR 0166)" cases, including "composes the tilt after the cube's own z turn, Rx * Rz", "changes nothing for 0 degrees" and "requires a declared assembly for compound tilt results". Not verified: that the rotation order matches the game for a compound cube; 0167 says confirmation on a device is pending and no check is recorded.

### Buried face culling

- Applies to: per-face UV geometry passed to the shared generation pass.
- Rule: Cull a face only when a distinct, solid, opaque cube in the same non-excluded bone contains all four corners after a 0.001 px outward shift. Check containment in the occluder's local frame. The normal axis is strict and the two lateral axes allow an inclusive 1e-6 px tolerance. Verify opacity across every texture that can draw each occluder face. Exclude bones that bind blend materials, and exclude all bones of a block using the blend render method.
- Agreement: Proposed
- Basis: [0256](../adr/0256-cull-buried-faces-at-generation.md).
- Implementation: [tools/face_cull.py](../../tools/face_cull.py). `tools/gen_camper.py` culls the rounded camper and drawer-item geometries using their bound colour textures. It excludes the camper's glass bones and the drawers' sugar pot bones and writes a tracked policy record for each geometry. The SUV checks all 16 paint textures and the lit texture, with no excluded bones. Its generator writes the counts and bindings to the [SUV policy record](../../tests/packs/fixtures/face-cull/yasu_ride.suv.json). The scooter generator culls the mirrored, rounded geometry before splitting the render passes. It checks each occluder face in its fixed or paint UV space, including all paint variants, and excludes `glow_*`, `headlights`, and `tail_lights` because the lit pass remaps their UVs. It writes a tracked policy record for each of the fixed and paint geometries.
- Verification: [tests/tools/faceCull.test.ts](../../tests/tools/faceCull.test.ts) checks containment and opacity. [tests/packs/faceCullPolicy.test.ts](../../tests/packs/faceCullPolicy.test.ts) checks recorded textures and exclusions against the pack's render bindings.

### Camping gear geometry kit

- Applies to: Camping gear geometry built through the shared pure Python kit.
- Rule: Rings reuse the panel ring corner overlap. Lofts build local pitch before yaw, and each loft panel spans every corner of its band so a tapered band leaves no corner gap; stepped panels take each vertex from the step end on the visible side and span the hidden end along the edge. Tubes use yaw and local pitch without roll. Compound cubes require a registered assembly. `COMPOUND_TILTS = False` selects yaw-only loft steps and tube stairs with rise at most 0.5 px. Extrusions use conservative horizontal slabs. Plates use texture alpha bounds, or conservative strips with holes when `ALPHA_CUT_PLATES = False`. Builders are deterministic, copy caller data, and check the active rotation rule.
- Agreement: Proposed
- Basis: [0247](../adr/0247-precise-camping-gear-rotations-textures-and-cube-budget.md) Rotation rule.
- Implementation: `tools/gear_kit.py`
- Verification: `tests/tools/gearKit.test.ts` "closes rings with overlapping yaw-only edges and validates sizes", "closes constant lofts in both modes and builds local pitch before yaw" (including growing and shrinking outlines, outward and inward), "extrudes convex and concave profiles without gaps and with exact bounds", "plates use exact alpha bounds or conservative strips avoiding offset holes", "tubes contain segment endpoints and switch to yaw-only stairs". Client verification remains pending under ADR 0247.

### Shared decor pair layouts

- Applies to: Camping gear pair block geometry generated by `tools/gen_camping_gear.py`.
- Rule: Frozen `PairLayout(name, ends)` values in `PAIR_LAYOUTS` define exactly `board` (`((0, -3.5), (0, 3.5))`) and `table` (`((3.3, 0), (-3.7, 0))`). `PAIRS` selects a layout per kind: shelf, cabinet and fridge use board; table uses table. Generate `models/blocks/yasu_ride/<layout.name>_decor_pair.geo.json` once per layout with identifier `geometry.yasu_ride.<layout.name>_decor_pair`. Blocks retain their saved identifiers, per-kind heights and door settings, and `end{end}_{item_id}` visibility bones. Drawers retain their independent geometry. The old shelf, cabinet and fridge geometry files are removed. Check mode reports every orphan `*_decor_pair.geo.json` without writing; regeneration removes orphans.
- Agreement: Proposed
- Basis: [0108](../adr/0108-two-items-on-each-shelf-board-and-the-table.md) Decision / The pair blocks; [0123](../adr/0123-a-fridge-in-place-of-the-camper-shelf.md) Decision / Blocks.
- Implementation: `tools/gen_camping_gear.py` (`PairLayout`, `PAIR_LAYOUTS`, `PAIRS`, `pair_geometry`, `pair_block`, `main`).
- Verification: `tests/tools/decorPairLayout.test.ts` checks layout values, immutability, every pair block reference, the exact geometry file set and orphan detection/removal. `tests/packs/campingGear.test.ts` resolves geometry through block identifiers and checks item offsets, visibility and budgets. In-game rendering remains a device check.

### Shared texture modules

- Applies to: the generators in `tools/` that write textures: SUV, camper, sports boat, bulldozer, camping gear, and the generators that use `tools/mer_atlas.py`.
- Rule: Generators import their sibling tools through `load_tool(name)` in `tools/tool_loader.py`, which is cached with `functools.cache` and loads the file with `importlib`. Because isolated Python (`-I`) leaves the script directory off the import path, a generator first puts its own directory on `sys.path`. Four shared modules hold the texture code. `tools/mer.py` holds the validated `Mer` value (each channel an integer from 0 to 255), `MER_OFF`, `MER_LIT` and `mer_painter`, and does no I/O. `tools/texture_io.py` holds `Outputs`, `rgba_bytes`, `texture_set_doc` and `write_texture_set` (a 1.16.100 texture set with at most one relief map). `tools/lit_textures.py` holds `build_lit_textures`, which writes `<kind>_lit.png`, `<kind>_lit_mer.png` and `<kind>_lit.texture_set.json` from a colour callback and an `is_lit` test. `tools/texture_variants.py` holds `UniformMer`, `Variant`, `VariantTextures` and `write_variants`, which preserve the first name for each distinct (colour, MER) pair and share equal MER content. A variant may explicitly supply `UniformMer` only when every sampled texel of its pass has the same MER value; there is no automatic detection. The writer compares uniform values by value and writes `value.rgba()[:3]` as a list in the texture set without a MER PNG. Only scooter paint uses `UniformMer(MER_BY_MATERIAL[atlas.Material.PAINT])`, or `[0, 0, 90]`; scooter fixed keeps its MER PNG. The existing leftover cleanup removes the old `scooter_paint_mer.png` or reports it stale under `--check`. Because generated textures are gitignored, `write_variants` also removes, through `Outputs.remove`, any `<variant>.png`, `<variant>_mer.png`, `<variant>.texture_set.json`, `<kind>_mer.png` or caller-listed `retired` PNG it did not store this run (the camper retires `camper_interior_mer`), so a checkout generated under the per-variant layout drops those files. The SUV, sports boat, camper, sofas and bulldozer use it. Resort preview and item rendering resolve the optional `texture` field in `tools/resort_gear.json`, falling back to `geometry`; both sofas use `sofa_single.png`. `gen_item_catalog.py` and `render_preview.py` also load `texture_io`; `gen_sounds.py` is outside the model generator plan.
- Agreement: Proposed
- Basis: [0193](../adr/0193-shared-texture-tooling.md) Decision, "Generators load shared modules with `tool_loader.load_tool`:"; [0193](../adr/0193-shared-texture-tooling.md) Decision, "`tools/mer.py`: a validated `Mer(metalness, emissive, roughness)` value with `rgba()`, the constants `MER_OFF` and `MER_LIT`, and `mer_painter(lookup, default)`. It does no I/O."; [0193](../adr/0193-shared-texture-tooling.md) Decision, "`tools/lit_textures.py`: `build_lit_textures` writes `<kind>_lit.png`, `<kind>_lit_mer.png` and `<kind>_lit.texture_set.json` from a colour callback and an `is_lit` test."; [0167](../adr/0167-compound-rotation-assemblies-as-a-vehicle-neutral-rule.md) Decision, "`tools/tool_loader.py` exposes cached `load_tool(name)` through `functools.cache` and `importlib`."
- Implementation: `tools/tool_loader.py` (`load_tool`); `tools/mer.py` (`Mer`, `MER_OFF`, `MER_LIT`, `mer_painter`); `tools/texture_io.py` (`texture_set_doc`, `write_texture_set`); `tools/lit_textures.py` (`build_lit_textures`); `tools/gen_camper.py`; `tools/gen_sportsboat.py`; `tools/gen_bulldozer.py`; `tools/gen_model.py`; `tools/mer_atlas.py`
- Verification: `tests/tools/mer.test.ts` "validates channels and preserves them in RGBA", "paints the lookup value or the supplied default"; `tests/tools/textureIo.test.ts` "accepts one relief variant and preserves texture sets without relief"; `tests/packs/litTextures.test.ts` "generates a matching color atlas, maximum-emissive MER mask, and exact texture set". Not verified: no test covers `tool_loader.py` on its own, or the `sys.path` bootstrap.

### Writing and comparing generated textures

- Applies to: `Outputs` in `tools/texture_io.py`, used by `--check` runs of the generators.
- Rule: `Outputs` is the sole asset writer for every generator in `tools/generators.json`, including the catalog and renderer. `Outputs.touched` records each written or checked `Path`. `rgba` accepts packed renderer pixels and preserves compression level 9 and RGB pack icons. `Outputs(check)` writes JSON and PNG files, or, when `check` is true, writes nothing and compares. `Outputs.json(path, doc)` accepts a document and writes `json.dumps(doc, separators=(",", ":"), ensure_ascii=False) + "\n"` as UTF-8, without caller formatting parameters. `Outputs.fixture_json(path, doc)` writes the camper ownership fixture and `suv.anim.json` with `indent=2` and a trailing newline. Both methods compare parsed JSON values, so whitespace does not affect freshness. PNGs are compared by decoded pixel rows, not bytes, so zlib packing differences do not matter. `Outputs.remove(path)` deletes an output a generator no longer writes, or under `--check` lists it as stale with the reason `no longer generated`; a missing path is ignored. Every stale path is collected, and `finish` exits with the header and the full list of stale paths; a file that cannot be read or decoded is listed with the reason in parentheses. `rgba_bytes(width, height, pixel)` packs RGB or RGBA callbacks in row-major order using `(*pixel(x, y), 255)[:4]`. `png` uses it to pad RGB texels with alpha 255, and takes a `compress_level` (the default is zlib's) so each generator keeps its PNG bytes.
- Agreement: Proposed
- Basis: [0193](../adr/0193-shared-texture-tooling.md) Decision, "`tools/texture_io.py`: `Outputs(check)` writes JSON and PNG files, or under `--check` compares JSON parsed and PNGs by decoded pixel rows, collects every stale path, and reports them in `finish`, appending the exception reason in parentheses when reading or decoding fails."; [0193](../adr/0193-shared-texture-tooling.md) Decision, "`png` accepts RGB or RGBA texels and pads RGB texels with alpha 255 once before writing or comparing. `png` takes a `compress_level` so each generator keeps its PNG bytes"
- Implementation: `tools/texture_io.py` (`Outputs`, `Outputs.json`, `Outputs.fixture_json`, `Outputs.png`, `Outputs.rgba`, `Outputs.finish`); `tools/mer_atlas.py` (`write_or_check`)
- Verification: `tests/tools/textureIo.test.ts` "compares JSON and PNG content and reports every stale file". `tests/tools/textureIo.test.ts` also checks compact UTF-8 JSON, indented fixtures, semantic freshness after reformatting, touched paths including missing files, and exact rendered RGB/RGBA PNG bytes at compression level 9.

### Block geometry

- Applies to: every block in `packs/yasu_ride_bp/blocks/` that names a custom geometry, in the block or in a permutation.
- Rule: A geometry named by a block exists in the Resource Pack, has at least one cube, and its lowest cube starts at y 0, the bottom of the cell. The client hides every custom-geometry block in a chunk that holds a block with a cube-less geometry, so no block geometry may be without cubes.
- Agreement: Accepted
- Basis: [0101](../adr/0101-give-invisible-blocks-a-hidden-cube.md) Decision, "No block in the packs uses a geometry without cubes"; [0101](../adr/0101-give-invisible-blocks-a-hidden-cube.md) Decision, "Every custom geometry that a Behavior Pack block names must exist in the Resource Pack, have at least one cube, and start at y = 0, the bottom of the cell (finding F2 of #410)."
- Implementation: `packs/yasu_ride_rp/models/blocks/yasu_ride/`; `packs/yasu_ride_bp/blocks/yasu_ride/`
- Verification: `tests/packs/blockGeometry.test.ts` "names a geometry that exists and has at least one cube (F1)", "starts every block geometry at the bottom of the cell (F2)" (the file walks every block file, so a new block is covered). Not verified: the client behavior itself (the 2026-10-21 screenshots in 0101 Context are the only evidence, and no later client check is recorded).

### Invisible blocks use the hidden cube

- Applies to: blocks that must draw nothing: the deck floor, the camper room blocks, and the tent blocks listed in `INVISIBLE_BLOCKS` in the test.
- Rule: `geometry.yasu_ride.deck_floor` has one 1 x 1 x 1 px cube in bone `root`, from (-0.5, 0, -0.5) to (0.5, 1, 0.5). Every block that names it does so as `{"identifier": "geometry.yasu_ride.deck_floor", "bone_visibility": {"root": false}}`, so the cube is hidden. The set of blocks that name this geometry is exactly the list in `INVISIBLE_BLOCKS`; adding a block to the set means adding it to that list.
- Agreement: Accepted
- Basis: [0101](../adr/0101-give-invisible-blocks-a-hidden-cube.md) Decision, "`geometry.yasu_ride.deck_floor` has one 1 x 1 x 1 px cube in bone `root`, from (-0.5, 0, -0.5) to (0.5, 1, 0.5): at the bottom middle of the cell, starting at y = 0"; [0101](../adr/0101-give-invisible-blocks-a-hidden-cube.md) Decision, "Every block that must draw nothing names it as `{\"identifier\": \"geometry.yasu_ride.deck_floor\", \"bone_visibility\": {\"root\": false}}`"
- Implementation: `packs/yasu_ride_rp/models/blocks/yasu_ride/deck_floor.geo.json`; `packs/yasu_ride_bp/blocks/yasu_ride/deck_floor.block.json`; `packs/yasu_ride_bp/blocks/yasu_ride/camper_floor.block.json`
- Verification: `tests/packs/blockGeometry.test.ts` "hides the cube of every invisible block"; `tests/packs/deckFloor.test.ts` "references the hidden-cube model and hides its bone (ADR 0101)". Not verified: that no 1 px dot shows on a client that draws hidden bones (0101 asks for a manual check); the manual-test rows B17, C72 and C73 in `docs/manual-test.md` have empty result cells.

### Preview renderer determinism

- Applies to: `tools/render_preview.py`, every image it writes.
- Rule: The renderer uses only the Python standard library. A scene is a frozen `Scene(name, build)` dataclass, and the ordered `SCENES` registry lists the suv, boat, camper, bulldozer, scooter, and gear scenes in preview insertion order. `SCENE_NAMES` holds their names. `select_scenes(names)` keeps `SCENES` order, drops duplicates, and raises `ValueError` naming the unknown scene and the valid names. A scene owns the images and icons its builder returns, and `render` and `raster_jobs` take a `scenes` parameter; omitting it renders all of them. Each vehicle kind builds its scenes independently and returns a frozen `SceneResult` containing its preview jobs and optional icon job. The SUV builder owns the pack icon because it uses the SUV camera and polygons. The renderer computes sine and cosine with its own series (`sin_cos`) and does not call `math.sin` or `math.cos`, so the same model renders to the same pixels on a Mac and on the Linux CI runner. Face shading is fixed (`SHADE_UP`, `SHADE_Z`, `SHADE_X`, `SHADE_DOWN`), a soft shadow lies under the vehicle (`SHADOW_*`), and the background of every preview image is transparent (the pack icon has its own opaque background). A check run compares decoded pixels of every image with the committed one, not PNG bytes. Camper previews keep opaque texture faces as compact descriptors until rasterization, then use the existing texel subdivision and shading in original polygon order. A supersampled depth probe skips a descriptor only when its whole face is behind already drawn opaque geometry; depth ties remain. Mixed-alpha and emissive faces use the existing eager path. Deferred faces use the same density cap as eager faces; visible faces cache unshaded patches for reuse across poses, and framing uses opaque face corners without expanding them. Hidden faces remain compact descriptors.
- Agreement: Accepted
- Basis: [0016](../adr/0016-readme-preview-rendered-from-model.md) Decision, "It uses Minecraft's fixed face shading (top 1.0, north/south 0.8, east/west 0.6, bottom 0.5), a soft ground shadow, and a transparent background"; [0016](../adr/0016-readme-preview-rendered-from-model.md) Decision, "The renderer avoids `math.sin` and `math.cos`, whose last bit can differ between platforms, so a Mac and the Linux CI runner produce identical pixels. The check compares decoded pixels, not PNG bytes, because zlib builds do not all compress identically"; [0027](../adr/0027-readme-previews-in-three-poses.md) Decision, "Everything else in 0016 stays: the standard library only, no `math.sin` or `math.cos`, a transparent background, and `pnpm model:check` comparing decoded pixels of every image in CI"
- Implementation: `tools/render_preview.py` (`sin_cos`, `SHADE_UP`, `SHADE_DOWN`, `SHADE_Z`, `SHADE_X`, `SHADOW_LAYERS`, `main`)
- Verification: `tests/tools/renderPreview.test.ts` "turns a rotated bone's cubes about its pivot the way the game does", "ScreenFit maps quads the same after pickling", "registers ordered top-level scene builders with frozen results", "defers opaque texture patches without changing perspective, ties, glass or lighting" (including a pickle round trip). Not verified: no test compares Mac and Linux output; the identity of pixels across platforms rests on `pnpm model:check` passing in CI.

### Preview scene selection and timing

- Applies to: `tools/render_preview.py` command-line rendering and checks.
- Rule: Repeatable `--scene NAME` selects from `suv`, `boat`, `camper`, `bulldozer`, `scooter`, and `gear`, preserving registry order and dropping duplicates. Unknown names fail with the valid names. The option works with the default render, `--check`, `--icons`, and `--timing`; it cannot be combined with `--gear`, `--view`, or `--beach-chair-form`. Only selected scenes' previews and owned icons are built, written, or compared. A subset check does not require other scenes' files. With `--scene --timing`, stderr includes `scene=<name> build=<seconds> jobs=<count>` for each selected scene before the existing `PHASE_TIMING` summary. Build seconds cover that scene's job construction; jobs counts raster jobs, so the single SUV pack-icon job can produce multiple pack files. Without `--scene`, the full render and `pnpm model:check` retain their existing behavior.
- Agreement: Accepted
- Basis: [0016](../adr/0016-readme-preview-rendered-from-model.md) Decision (deterministic previews and decoded-pixel comparison); scene selection preserves that comparison contract.
- Implementation: `tools/render_preview.py` (`main`, `select_scenes`, `raster_jobs`).
- Verification: `tests/tools/renderPreview.test.ts` checks CLI validation, SUV subset comparisons without writes or other scenes' files, selected timing lines, and the output partition including owned icons using small scene fixtures without rasterization. `pnpm model:check` verifies the full committed output set.

### Model freshness check

- Applies to: `pnpm model`, `pnpm model:check`, and the model checking jobs in `.github/workflows/unit-test.yml`.
- Rule: `pnpm model` runs the generators with compact JSON output and then `tools/render_preview.py` last via `afterGenerators: true`, without invoking Biome, writing the previews into `docs/images` and the pack icons. `pnpm model:check` runs `pnpm generate` to ensure fresh packs, then `python3 -I tools/run_generators.py --check`, which checks every generator's output by comparing parsed JSON and decoded pixels, with `tools/render_preview.py` last. It fails naming stale files and verifies output ownership against `tools/generators.json`. CI selects scenes and other generators through `model-plan` and checks them in `model-scene` and `model-others`, as specified in Preview checks in CI above. Main pushes retain the full check.
- Agreement: Proposed
- Basis: [0027](../adr/0027-readme-previews-in-three-poses.md) Decision, "Everything else in 0016 stays: the standard library only, no `math.sin` or `math.cos`, a transparent background, and `pnpm model:check` comparing decoded pixels of every image in CI"; [0193](../adr/0193-shared-texture-tooling.md), generated-output declarations and ownership; [0057](../adr/0057-skip-model-check-when-inputs-unchanged.md), per-scene CI selection
- Implementation: `package.json` (`model`, `model:check`); `tools/run_generators.py`; `tools/render_preview.py` (`main`); `.github/workflows/unit-test.yml` (`model-plan`, `model-others`, `model-scene` jobs)
- Verification: `tests/tools/selectModelScenes.test.ts` checks selection for tools, caches, reads, outputs, unrelated art, docs, and package changes. `tests/tools/modelCheckWorkflow.test.ts` checks manifest coverage, the matrix, and aggregate skip handling. A pull request that skips the job relies on each generator declaring its external reads. Live GitHub setup and skip behavior remain unverified locally.

### Generated pack files are build outputs

- Applies to: generated pack assets and the camper ownership fixture.
- Rule: Outputs from `tools/run_generators.py --list-outputs --untracked` are ignored and never committed. `pnpm generate` recreates them, and build and Vitest ensure generation automatically. README previews, rendered item icons, all three pack icons, and face-culling policy records remain committed. `.gitignore` has exactly the untracked patterns in manifest order. Biome uses these Git ignores, with no generated-output exclusions or Linguist attributes.
- Agreement: Proposed
- Basis: [0248](../adr/0248-treat-generated-pack-files-as-build-outputs.md) Decision.
- Implementation: `.gitignore`; `biome.json`; `tools/generators.json`; `package.json`.
- Verification: `tests/tools/generatedOutputs.test.ts` checks ignore-list equality and whether manifest outputs are tracked; `tests/tools/ensureGenerated.test.ts` checks recreation and cache invalidation.

### Generator output and input declarations

- Applies to: every entry in `tools/generators.json` and its generated assets.
- Rule: Each entry has an optional `id`, defaulting to its `script`; ids must be unique, while entries may share a script. Output ownership reports identify entries by id. Each entry declares repository-relative `outputs` globs and `reads` paths outside `tools/`. Set `tracked: true` to retain all of an entry's outputs or list individual output patterns in `trackedOutputs`. `tools/**` is an implicit input, excluding paths containing `__pycache__`. `OutputManifest.load(path=PLAN)` exposes immutable `GeneratedOutput(generator, pattern, tracked)` values through `outputs()`, one owner through `matches(repo_path)`, the deduplicated input union through `inputs()`, and non-retained patterns through `untracked_patterns()`. Matching uses POSIX `fnmatch` semantics; stars match across folders. The renderer declares previews, rendered item icons, and the three pack icons with `tracked: true`. The preview renderer has six entries, `render_preview.py:<scene>` for `suv`, `boat`, `camper`, `bulldozer`, `scooter`, and `gear`, each with `--scene <scene>`, scene-specific reads, and the shared `after` list. SUV owns its previews and all three pack icons; gear owns its previews and rendered item icons; each other scene owns its vehicle previews. All six retain the pack manifest validation reads from `--icons`. The scooter preview reads `scooter.png` for its ivory default paint, and `scooter_lit.geo.json` with `scooter_lit.png` for its lamps and hover glow. It projects matching lit faces into base-atlas coordinates for combined texel sampling and uses the lit geometry for hover pools, preserving the preview pixels. White shares the stored `scooter` texture with khaki; no `scooter_white.png` is produced. `--only ID [ID ...]` selects entries in manifest order, deduplicates ids, and verifies ownership for exactly those entries in write or `--check` mode. It bypasses `after` dependencies and the after-generators barrier, so callers must run `pnpm generate` first. Unknown ids fail with the valid ids listed. It rejects `--ensure`, `--status`, and listing flags, and never invalidates or writes the generation stamp. The runner lists outputs with `--list-outputs [--untracked]`, inputs with `--list-inputs`, and performs no formatting step. The plan has no `format` key. Biome uses Git ignores to skip build outputs and formats hand-written JSON normally. The complete item texture atlas uses compact JSON generated from `tools/item_texture_base.json` and the gear spec. `--report-touched FILE` writes JSON Lines containing each generator id and every repo-relative path its `Outputs` instances wrote or checked. The generated `.gitignore` section equals `untracked_patterns()` in plan order; tracked renderer outputs and face-cull policy records stay committed.
- Agreement: Proposed
- Basis: [0193](../adr/0193-shared-texture-tooling.md) Decision, "`tools/generators.json` is the authoritative plan for every generator's `outputs` and `reads` outside `tools/`."
- Implementation: `tools/generators.json`; `tools/generated_outputs.py`; `tools/run_generators.py`; `tools/texture_io.py`; `.gitignore`.
- Verification: `tests/tools/generatedOutputs.test.ts` exercises Python manifest matching for exact paths, `*`, and `**`; checks every reported output against exactly one owner; requires every retained pattern to match a tracked file and no untracked output pattern to match tracked files; excludes the explicit hand-written pack model and texture allowlist; checks ignore patterns and CLI lists against the manifest and verifies Biome uses Git ignores; and verifies `afterGenerators` ordering in write and check modes. The complete check run follows the same output calls as a write run without mutating files.

### On-demand pack generation

- Applies to: `pnpm generate`, build, Vitest, packaging, and the dev command drivers.
- Rule: `pnpm generate` runs `python3 -I tools/run_generators.py --ensure`. SHA-256 covers the Python version string and sorted paths and contents matched by `OutputManifest.inputs()`, excluding `__pycache__`. The ignored `.cache/generated/stamp.json` stores `fingerprint` and concrete `outputs`. Matching inputs and present recorded outputs skip work; changed inputs, missing outputs, and a missing or invalid stamp regenerate. Independent generators run in parallel with `ProcessPoolExecutor`, one process per generator; `after: [id, ...]` declares real dependencies, with unknown dependencies and cycles rejected. The item catalog reads source specs independently of camping gear. The renderer declares dependencies on the asset producers and runs after other generators. `--ensure` skips entries marked `afterGenerators: true`. Outputs from those entries are excluded from build-output freshness checks and the stamp; their outputs under `packs/` are checked separately as retained outputs. This selection depends on `afterGenerators`, not the script file name. The SUV animation source template `tools/templates/suv.anim.json` and item atlas base `tools/item_texture_base.json` let both regenerate without reading their previous outputs. A failure names the generator id, preserves its exit code, and leaves no stamp. Successful generation atomically writes the stamp with the final fingerprint. Build and Vitest ensure assets before bundling or test collection. Dev commands build stale or missing assets and bundles; packaging reports missing assets, including committed rendered pack textures and icons, with “run `pnpm build` first”. Missing renderer outputs require restoration or `pnpm model`; ensure still skips rendering. `--status` returns read-only JSON freshness and missing-output information. `pnpm model` still forces everything, including previews and icons; `pnpm model:check` ensures packs then checks every generator's output and output ownership with `run_generators.py --check`. Pack bytes and manifests do not change in this step of the series.
- Agreement: Proposed
- Basis: [0193](../adr/0193-shared-texture-tooling.md) Decision, on-demand generation, dependency ordering, source templates, stamp and command integration.
- Implementation: `tools/run_generators.py`; `tools/generators.json`; `tools/templates/`; `tools/item_texture_base.json`; `scripts/build.mjs`; `scripts/generated-files.mjs`; `scripts/server-up.mjs`; `scripts/game-test.mjs`; `scripts/package.mjs`; `tests/support/generatedSetup.ts`; `vitest.config.ts`; `package.json`; `.gitignore`.
- Verification: `tests/tools/ensureGenerated.test.ts` runs a temporary copy of the tools against a temporary output root, checking the cache, input edits and path changes, missing outputs, bytecode exclusion, invalid stamps, failure exit codes, concurrent execution, and dependency ordering. `tests/scripts/generatedFiles.test.ts` checks conditional builds and packaging rejection. Deleting all `--list-outputs --untracked` matches and running tests and build must recreate build outputs without dirtying Git status.

### Resort alpha cut-outs and photo-angle review renders

- Applies to: Resort Gear geometries listed in `tools/resort_gear.json` and named review views in `tools/render_preview.py`.
- Rule: A piece with `cutout: true` skips texels with alpha below `CUTOUT_ALPHA` (128) after each UV lookup, for both textured patches and single-color faces. Skipped texels produce neither opaque nor see-through faces. Alpha 128 through 254 keeps the existing translucent rendering, including water; alpha 255 remains opaque. Pieces without cut-outs keep the existing alpha behavior. `render_gear` derives its opt-in geometry filenames from the Resort Gear list, so existing previews remain unchanged. `--view NAME --out DIR` renders one transparent 800 by 800 px review image as `DIR/NAME.png`, without ground layers or bloom. `PHOTO_VIEWS` contains, in order, `topFront`, `side`, `leftFront`, `lidOpen`, `sinkFront`, `sinkBowl`, `sinkTap`, `sinkBowlTop`, `sinkDrain`, `sinkLeg`, `sinkNet`, and `sinkWood`. The first four select the `toilet` piece; the rest select `washstand`, looked up by name in `tools/resort_gear.json`. Each preset copies the reference viewer's world-space position, target, and vertical field of view (30 degrees), with square aspect. Positions apply after the renderer's x mirror, in the game's frame; generators must account for that mirror when copying reference geometry. Perspective scale uses `sin_cos` for the half-angle tangent. Polygons are clipped in world space to depth at least 0.2 before projection, so close-up views handle surfaces behind the eye. `lidOpen` defaults to a 91-degree opening. `--lid DEGREES` overrides that default, accepts only 0 through 91 inclusive, and requires a named view. Posing deep-copies the geometry and adds negative game x rotation to the `lid` bone at its pivot, raising the front (-z) edge. A requested lid pose without a `lid` bone fails. Missing pieces fail with a message naming the piece and `tools/resort_gear.json`; Toilet and Washstand are registered. Toilet review and item previews apply the rest animation to hide foam before posing the lid. Named views require `--out`, omit positional `output_dir`, and reject `--check`, `--icons`, and `--beach-chair-form`. They are review aids outside `pnpm model` and `pnpm model:check`. `--timing` applies only to the full render and `--check`, rejects `--gear`, a named `--view`, and `--beach-chair-form`, and prints one stderr line after the outputs are written, `PHASE_TIMING raster_jobs=<s> rasterize_all=<s> total=<s> cpu_count=<n> jobs=<n>` with seconds to two decimals (built by the pure `format_timing`); stdout and the files do not change. Other modes require positional `output_dir` and reject `--out`; the three-number `--view X Y Z` form remains available with `--beach-chair-form`.
- Agreement: Proposed
- Basis: [0240](../adr/0240-resort-furniture-family.md), Resort Gear metadata and previews; issue #1565, Resort Toilet and Washstand tooling decisions; the owner's uncommitted reference viewer supplies the camera presets and lid opening.
- Implementation: `tools/render_preview.py` (`CUTOUT_GEOMETRY_FILES`, `collect_boat`, `PHOTO_VIEWS`, `Camera.looking_at`, `PhotoScreenFit`, `open_lid`, `render_photo_view`, `main`).
- Verification: `tests/tools/renderPreview.test.ts` checks threshold behavior through rasterization, per-patch alpha lookup, preset order and reference values, target centering, vertical field of view, clipping, pickling, lid direction and immutable posing, default and overridden lid angles, missing lid bones, and CLI errors. `pnpm model:check` checks existing generated outputs. Washstand photo-angle renders are available from its model generator; owner approval is pending. Toilet geometry awaits its model issue.

### Camping gear validation and review views

- Applies to: the 20 items in `tools/camping_gear.json` and their previews, including the painted `alarm_clock`, `instant_camera`, and `binoculars`.
- Rule: The generator limits each decomposed item to 256 cubes and each pair block to 512 visible cubes, counting two copies of the largest standing item. The shipped `alarm_clock`, `instant_camera`, and `binoculars` use 237, 249, and 248 cubes, respectively, and atlas cells 11, 12, and 13. Diagnostics name the item and actual and allowed counts. Every face must fit inside one swatch or its item's assigned tile, excluding the 4-texel cell gutter. Three-axis cubes are forbidden; compound cubes must match a registered assembly. Non-glass sampled alpha must be 0 or 255. Glass must sample alpha 64 through 192 and may also sample 0 or 255. Tiled gear previews map each texel; non-glass tiled items skip alpha below `CUTOUT_ALPHA` (128), while glass retains translucent patches. Swatch-only previews retain their existing pixels and shading. `--gear ID --view NAME [NAME ...] --out DIR` writes transparent 512 by 512 px images as `DIR/ID-NAME.png`, each fitted independently without ground or bloom. Views are `front`, `back`, `left`, `right`, `top`, and `threeQuarter`, in that order; omitting `--view` renders all six. The top view places model front (-z) at the bottom. Gear review mode requires `--out`, omits positional `output_dir`, rejects `--check`, `--icons`, `--beach-chair-form`, and `--lid`, and stays outside `pnpm model` and `pnpm model:check`.
- Agreement: Proposed
- Basis: [0247](../adr/0247-precise-camping-gear-rotations-textures-and-cube-budget.md), cube budget, rotation, atlas and alpha rules; issue #1595 review view contract.
- Implementation: `tools/gear_validate.py`; `tools/gen_camping_gear.py` (`validate`); `tools/render_preview.py` (`gear_tiled`, `collect_gear`, `GEAR_VIEWS`, `render_gear`, `main`).
- Verification: `tests/packs/gearItems.test.ts` checks cube budgets, registered assemblies, bounds, atlas color and alpha, and the shipped models at both pair ends for the selected gear. Its item-specific checks include the clock’s floor contacts, the camera’s painted tile coverage and lens opacity, and the binoculars’ lens colors; `tests/tools/gearValidate.test.ts`; `tests/tools/renderPreview.test.ts` detects tiles for the percolator, enamel kettle, toaster, transistor radio, sugar pot, mug pair, saucepan, potted plant, cactus pot, and macrame planter; `tests/packs/campingGear.test.ts` checks pair bounds and a 4,500,000-byte file ceiling based on ADR 0247's 4.24 MiB estimate for 8,192 stored cubes; `pnpm model:check` checks existing preview pixels. See [Camping gear](camping-gear.md#open-issues) for the tiled Macrame Hanging Planter geometry, assembly, budget, and decor material, verified by `tests/packs/macrameplanter.test.ts`.

### SUV preview set

- Applies to: the four SUV images `suv-front-left.png`, `suv-headlights.png`, `suv-flying.png` and `suv-submarine.png` in `docs/images`, and the SUV row of the `README.md` table.
- Rule: `tools/render_preview.py <resource pack> <output dir>` renders the four poses listed in `POSES`: on the ground, headlights on, flying, and under water. All four use one camera and one scale, fitted to the union of the four scenes, so the vehicle has the same size and position in each. The images are `WIDTH` by `HEIGHT` pixels with a `MARGIN` around the union, supersampled by `SUPERSAMPLE`. The main pictures are lifted by `MAIN_BRIGHTNESS`. The README shows the four side by side in one row of its table, headed "SUV on the ground", "Headlights on", "Flying" and "Under water". The model files, the textures and the animation file the poses read are `GEOMETRY`, `TEXTURE`, `LIT_TEXTURE` and `ANIMATIONS`.
- Agreement: Accepted
- Basis: [0027](../adr/0027-readme-previews-in-three-poses.md) Decision, "`tools/render_preview.py <resource pack> <output dir>` writes three images into `docs/images`: `suv-front-left.png` (on the ground, as before), `suv-headlights.png` (headlights on), and `suv-flying.png` (flying). The README shows them side by side"; [0027](../adr/0027-readme-previews-in-three-poses.md) Decision, "All three use one camera and one scale, fitted to the union of the three scenes, so the vehicle has the same size and position in each and the flying one sits 1.5 blocks higher, the takeoff height of 0021"; [0045](../adr/0045-submarine-preview.md) Decision, "`tools/render_preview.py` writes a fourth image, `docs/images/suv-submarine.png`, with the same camera and scale as the other three, fitted to the union of all four scenes. The README shows it as a fourth column, \"Under water\""
- Implementation: `tools/render_preview.py` (`POSES`, `render`, `fit`, `fit_views`, `WIDTH`, `HEIGHT`, `MARGIN`, `SUPERSAMPLE`, `MAIN_BRIGHTNESS`); `docs/images/suv-front-left.png`; `docs/images/suv-headlights.png`; `docs/images/suv-flying.png`; `docs/images/suv-submarine.png`; `README.md`
- Verification: the selected scene checks on pull requests and full `pnpm model:check` on main compare all four images with the model. Not verified: no unit test renders a whole SUV pose or checks the shared scale; nothing checks the README table.

### SUV headlights pose

- Applies to: `suv-headlights.png`.
- Rule: Lamps are on and the scene is at dusk. The vehicle is dimmed and tinted by `NIGHT_TINT`. The lit parts are the texels of `suv_lit.png` whose alpha is 0 on the bones listed in `SUV_LIT_BONES` (`headlights` and `tail_lights`); they are moved toward white by `LIT_GAIN` and bloom. A widening pool of light, `BEAM_LAYERS` quads long `BEAM_LENGTH` model pixels, lies on the ground ahead of the front (the -z side); it stops far short of the real reach of the headlights.
- Agreement: Accepted
- Basis: [0027](../adr/0027-readme-previews-in-three-poses.md) Decision, "the rest of the vehicle is dimmed and tinted blue for dusk, and a widening pool of warm light lies on the ground ahead"; [0027](../adr/0027-readme-previews-in-three-poses.md) Decision, "The pool stops about 2 blocks out instead of the real 27 (0024), so the vehicle keeps its size"
- Implementation: `tools/render_preview.py` (`collect`, `ground_layers`, `NIGHT_TINT`, `SUV_LIT_BONES`, `SUV_CUTOUT_BONES`, `LIT_GAIN`, `BEAM_LAYERS`, `BEAM_LENGTH`, `BEAM_SPREAD`)
- Verification: `tests/tools/renderPreview.test.ts` "lights only the lit texture's alpha-0 texels in their own brightened color", "skips transparent texels only on cutout bones", "shades every texel normally when the lamps are off". Not verified: the light pool and dusk tint have no test; they are illustrations, not the game's lighting.

### SUV flying pose

- Applies to: `suv-flying.png`, and the flying pose used for the pack icons.
- Rule: The SUV uses `FlightPose` and `build_flight_pose`, shared with the scooter. `build_flight_pose` reads the selected kind's wheel folds and takes its lift as an explicit argument. The SUV is lifted by `FlightPose.lift`, set to `SUV_FLIGHT_LIFT` (24.0 model pixels), which is the climb of `SUV_SPEC.takeoffTicks` ticks at `SUV_SPEC.takeoffClimb` per tick. The wheels take the rotation and position of each `wheel_*` bone in `animation.yasu_ride.suv.wheels_folded`, read from `suv.anim.json`. The `glow_*` discs are drawn, a small blue pool lies on the ground under each disc (`GLOW_POOL_*`), the shadow is fainter (`FLIGHT_SHADOW_ALPHA`), and the flight arms and the rear glass are drawn. The sealed windows, the props and the submarine arms are not.
- Agreement: Accepted
- Basis: [0027](../adr/0027-readme-previews-in-three-poses.md) Decision, "the `glow_*` discs are drawn, small blue pools lie on the ground under each disc, and the shadow is fainter"; [0027](../adr/0027-readme-previews-in-three-poses.md) Decision, "the flying one sits 1.5 blocks higher, the takeoff height of 0021"
- Implementation: `tools/render_preview.py` (`FlightPose`, `build_flight_pose`, the optional `flight` parameter of `collect`, `collect_boat`, and `ground_layers`, `SUV_FLIGHT_LIFT`, `GLOW_POOL_LAYERS`, `GLOW_POOL_ALPHA`, `FLIGHT_SHADOW_ALPHA`); `packs/yasu_ride_rp/animations/yasu_ride/suv.anim.json` (`animation.yasu_ride.suv.wheels_folded`); `src/domain/vehicle/kinds/suv/spec.ts` (`SUV_SPEC.takeoffTicks`, `SUV_SPEC.takeoffClimb`)
- Verification: `tests/tools/renderPreview.test.ts` checks animation selection, immutable fold data, fold rotation and position, lift and mirroring in both collectors, unchanged faces with `flight=None`, inherited folds, and flight ground lighting. `pnpm model:check` checks every existing preview and icon for unchanged pixels. The lift is documented as derived from the takeoff spec; no test parses TypeScript to compare it.

### Bloom

- Applies to: the emissive faces of the SUV poses (group `lamp` and group `disc`).
- Rule: Emissive faces get a bloom: a box blur of `BLOOM_PASSES` passes of radius `BLOOM_RADIUS` output pixels, added to the image, with the strength of each group in `BLOOM`. The `lamp` bloom is added only where the lamps are visible. The `disc` bloom is drawn through the vehicle (`through_body`) and added only where the vehicle does not cover the pixel, because the discs under the folded tires cannot be seen from above.
- Agreement: Accepted
- Basis: [0027](../adr/0027-readme-previews-in-three-poses.md) Decision, "Emissive faces get a bloom: a box blur, 3 passes of radius 6 output pixels, added to the image."; [0027](../adr/0027-readme-previews-in-three-poses.md) Decision, "The discs sit under the folded tires and cannot be seen from above, so their bloom is drawn through the vehicle but only added where the vehicle does not cover the pixel"
- Implementation: `tools/render_preview.py` (`BLOOM`, `BLOOM_RADIUS`, `BLOOM_PASSES`, `add_bloom`, `rasterize`)
- Verification: the selected scene checks on pull requests and full `pnpm model:check` on main. Not verified: no unit test covers `add_bloom`.

### SUV submarine pose

- Applies to: `suv-submarine.png`.
- Rule: The rear wheels and props take the rotation and position of the bones in `animation.yasu_ride.suv.submerged`, turned the right-handed way (x and y only), and moved along the model's axes; the props' spin is a Molang expression, so they are drawn at rest. The pose shows `windows_sealed`, the props, the submarine arms (`sub_arm_*`) and `rear_glass`, and hides the `glow_*` discs and the flight arms. Every surface takes the blue-green tint `WATER_TINT`, over a translucent blue-green seabed (`SEABED_*`) that fades out from the footprint of the vehicle.
- Agreement: Accepted
- Basis: [0045](../adr/0045-submarine-preview.md) Decision, "The pose shows `windows_sealed`, the props, the submarine arms and the rear glass, as the render controller and the form controller do in game, and hides the glow discs and the flight arms"; [0045](../adr/0045-submarine-preview.md) Decision, "The props' spin is a Molang expression and is drawn at rest"; [0045](../adr/0045-submarine-preview.md) Decision, "Every surface takes a blue-green tint, `WATER_TINT` (0.55, 0.78, 0.92), over a translucent blue-green seabed that fades out from the vehicle's footprint"
- Implementation: `tools/render_preview.py` (`collect`, `submerged_parts`, `ground_layers`, `WATER_TINT`, `SEABED_COLOR`, `SEABED_LAYERS`, `SEABED_ALPHA`, `SEABED_MARGIN`); `packs/yasu_ride_rp/animations/yasu_ride/suv.anim.json` (`animation.yasu_ride.suv.submerged`)
- Verification: `tests/packs/resourcePack.test.ts` "turns each rear hub to face the rear, with the prop behind its wheel", "holds each turned wheel with an arm from the body to the hub, in front of the prop (ADR 0043)" (they pin the turn direction on the pack data, which the renderer copies). Not verified: no test checks the rendered pose; the direction the renderer turns the parts is not compared with those tests.

### Sports boat previews

- Applies to: `sportsboat-afloat.png`, `sportsboat-headlights.png`, `sportsboat-rear.png`, `sportsboat-top.png` in `docs/images`, and the sports boat row of the `README.md` table.
- Rule: The renderer writes four boat images from `sportsboat.geo.json` and the default black texture `sportsboat.png`. `afloat` and `headlights` (lamps on, dusk) are seen from the SUV's front-left view, `rear` from the rear-left corner (`BOAT_REAR_VIEW`), and `top` from straight above (`BOAT_TOP_VIEW`) with the world's -x pointing up in the image, so the bow points right. Poses seen from the same direction share one camera and frame; each view is centered on its own, and all four share one scale that is separate from the SUV's and is the largest that keeps every view inside `MARGIN`. The image size and margin are the SUV's. The README shows the four in one row of its table, headed "Sports boat on the water", "Headlights on", "From the rear" and "From above".
- Agreement: Accepted
- Basis: [0056](../adr/0056-sports-boat-previews.md) Decision, "`tools/render_preview.py` also writes four boat images into `docs/images`, all in the default black texture: `sportsboat-afloat.png` and `sportsboat-headlights.png` (headlights on at dusk) from the SUV's front-left view, `sportsboat-rear.png` from the rear-left corner, and `sportsboat-top.png` from straight above."; [0056](../adr/0056-sports-boat-previews.md) Decision, "The top view looks along `(0, 1, 0)` with the world's -x pointing up in the image, so the bow points right and the long hull fills the landscape frame"; [0056](../adr/0056-sports-boat-previews.md) Decision, "Poses seen from the same direction share one camera and frame. Each view is centered on its own, and all four share one scale, separate from the SUV's"
- Implementation: `tools/render_preview.py` (`BOAT_POSES`, `BOAT_REAR_VIEW`, `BOAT_TOP_VIEW`, `BOAT_TOP_SCREEN_UP`, `render_boat`, `fit_views`); `docs/images/sportsboat-afloat.png`; `docs/images/sportsboat-headlights.png`; `docs/images/sportsboat-rear.png`; `docs/images/sportsboat-top.png`; `README.md`
- Verification: the selected scene checks on pull requests and full `pnpm model:check` on main compare the four images. Not verified: no unit test renders a boat pose or checks the shared frame and scale; nothing checks the README table. `docs/manual-test.md` row B25 compares `sportsboat-top.png`, `sportsboat-rear.png` and `sportsboat-afloat.png` with the game (not `sportsboat-headlights.png`), and its result cells are empty.

### Sports boat water, glass and rotations

- Applies to: the four sports boat images.
- Rule: A cube's x and z rotations are negated before drawing (`game_turn`), because in game they turn the other way from the renderer's `rotate()`; this applies to bone rotations and their parents' rotations as well as to cubes. Faces whose texel alpha is below 255 are drawn see-through: blended over whatever opaque surface is behind them, farthest first. The water is a see-through plane at `BOAT_WATERLINE` model pixels above the feet, in `BOAT_WATER_LAYERS` layers that fade out `BOAT_WATER_MARGIN` pixels beyond the hull's footprint, and the hull below it shows through. With the headlights on, a beam `BOAT_BEAM_LENGTH` pixels long lies on the water ahead of the lamps, with the SUV's dusk tint, spread (`BEAM_SPREAD`) and bloom.
- Agreement: Accepted
- Basis: [0056](../adr/0056-sports-boat-previews.md) Decision, "The boat's cube x rotations are negated before drawing, so the tower struts, the helm display, and the jet bucket hoods lean the way they do in game"; [0056](../adr/0056-sports-boat-previews.md) Decision, "Faces whose texel alpha is below 255 are drawn see-through: blended over whatever opaque surface is behind them, farthest first"; [0056](../adr/0056-sports-boat-previews.md) Decision, "The water is a see-through blue plane at the waterline, 7.2 model pixels (0.45 blocks) above the feet, in 10 layers that fade out 14 pixels beyond the hull's footprint."; [0056](../adr/0056-sports-boat-previews.md) Decision, "With the headlights on, a beam lies on the water ahead of the lamps, 40 pixels long, with the SUV's dusk tint, spread, and bloom"
- Implementation: `tools/render_preview.py` (`game_turn`, `bone_turns`, `collect_boat`, `water_layers`, `rasterize`, `BOAT_WATERLINE`, `BOAT_WATER_LAYERS`, `BOAT_WATER_ALPHA`, `BOAT_WATER_MARGIN`, `BOAT_BEAM_LENGTH`)
- Verification: `tests/tools/renderPreview.test.ts` "turns a rotated bone's cubes about its pivot the way the game does", "carries a parent bone's rotation to its child bones", "leaves bones outside the rotated chain where they are". Not verified: no test covers the see-through blending, the water or the beam; the waterline against the boat's real draft; the pictures against the game.

### Pack icons

- Applies to: `pack_icon.png` in `packs/yasu_ride_bp`, `packs/yasu_ride_rp` and `packs/yasu_ride_test_bp`.
- Rule: `tools/render_preview.py <resource pack> <output dir> --icons <pack dir> ...` draws one icon from the SUV model, in the flying pose with the lamps on and no dusk tint, with the same rasterizer as the previews and its own framing: a square `ICON_SIZE` pixel RGB PNG with no text, logos or badges, the vehicle spanning `ICON_FILL` of the width, on the background `ICON_BACKGROUND` with one diagonal band `ICON_BAND_COLOR` of `ICON_BAND_HEIGHT` of the image height, and a circle of `GLOW_DISC_COLOR` on screen under each folded wheel, centered under the projected bottom center of its `glow_*` plate, composited behind the vehicle. The disc alpha falls linearly from `GLOW_DISC_ALPHA` at the center to zero at `GLOW_DISC_REACH` times the wheel radius, and the icon gets no bloom. The release packs get identical icons; the pack named `ICON_GRAYSCALE_PACK` (`yasu_ride_test_bp`) gets a grayscale copy. `--icons` must include that pack and each pack directory must hold a `manifest.json`; `pnpm model` writes all three and `pnpm model:check` compares them with the committed files.
- Agreement: Accepted
- Basis: [0049](../adr/0049-pack-icons-rendered-from-model.md) Decision, "Extend `tools/render_preview.py` with `--icons <pack dir> ...`, using the same model, flying pose, camera, and supersampled rasterizer as the previews."; [0049](../adr/0049-pack-icons-rendered-from-model.md) Decision, "Render a 256 by 256 RGB icon with the headlights on and the vehicle occupying 80% of its width, without text, logos, or badges (0009)"; [0049](../adr/0049-pack-icons-rendered-from-model.md) Decision, "Use charcoal `#16181C`, an orange `#F28C28` diagonal band 18% of the image height, and cyan `#5AD7FF` discs beneath the folded wheels."; [0049](../adr/0049-pack-icons-rendered-from-model.md) Decision, "Disc alpha falls linearly from 0.9 at the center to zero at 1.6 times the wheel radius; composite them behind the vehicle."; [0049](../adr/0049-pack-icons-rendered-from-model.md) Decision, "Give the release packs identical icons and the test pack a grayscale copy. `pnpm model` writes all three; `pnpm model:check` compares decoded pixels alongside the previews"
- Implementation: `tools/render_preview.py` (`render_icon`, `main`, `grayscale`, `ICON_SIZE`, `ICON_FILL`, `ICON_BACKGROUND`, `ICON_BAND_COLOR`, `ICON_BAND_HEIGHT`, `GLOW_DISC_COLOR`, `GLOW_DISC_ALPHA`, `GLOW_DISC_REACH`, `ICON_GRAYSCALE_PACK`); `packs/yasu_ride_bp/pack_icon.png`; `packs/yasu_ride_rp/pack_icon.png`; `packs/yasu_ride_test_bp/pack_icon.png`
- Verification: `tests/packs/icons.test.ts` "contains a 256 by 256 RGB PNG at the pack root", "gives both release packs the same icon", "gives the test pack a grayscale icon"; the selected scene checks on pull requests and full `pnpm model:check` on main. Not verified: the colors, the band, the disc falloff and the 80 percent width have no test; the icon in a client pack list.

### Sofa generation and preview

- Applies to: Sofa (Single) and Sofa (Double).
- Rule: `tools/gen_sofa.py` builds frame, cushions and feet from a width in cells. The amber weave keeps its physical pitch when widened, with horizontal strands on the arm tops and fronts and vertical strands on the sides. Beige cushions and silver feet use solid palette swatches. Neither sofa has a throw cushion (the `throw_cushions` count is 0). The double has one continuous seat pad with one back pad per cell. The atlas is a 1024 by 1024 RGBA PNG. Sofa previews merge adjacent equal-color texels into rectangles and share corner coordinates; item icons reuse their preview geometry to limit renderer memory without changing the output pixels. `pnpm model` emits both models and their identical texture pixels, and renders a transparent 128-pixel preview and 32-pixel item icon with per-face texture mapping. `pnpm model:check` checks their committed renderings against generated packs.
- Agreement: Proposed
- Basis: [0240](../adr/0240-resort-furniture-family.md); Dining set design.
- Implementation: `tools/gen_sofa.py`; `tools/render_preview.py` (`small_models`, `ICON_NAMES`, `render_gear`); `package.json`.
- Verification: `tests/tools/sofa.test.ts`; `tests/packs/sofas.test.ts`; `tests/tools/renderPreview.test.ts`. Owner review against the reference photos and PC/mobile checks remain pending.

### Camper companion maps and interior finishes

- Applies to: Camper atlas generation and client texture sets.
- Rule: All four lit/mirror companion maps and `camper_mer.png` use `Layout.size`. Lamp masks resolve lens, marker_amber, marker_red, dome and glow through the registered `base` origin; only these lit MER texels are `(0,255,255)`. The mirror mask resolves the nested 16 x 32 `mirror_chrome` tile through that origin; only its mirror MER texels are `(255,0,26)`. Other companion MER texels are `(0,0,255)`. Interior MER follows region materials and the mixed base's semantic swatch/hardware tables in ADR 0193, with G = 0 and alpha 255 everywhere, including unused space. Metals use roughness 60 by material and 50-80 by palette, lacquer 80-90, vinyl 175-190, wood 150-160, fabric 235-245, carpet 250, tile 80, stone/dark lacquer 85, and instrument glass 65. The mirror tile retains roughness 26. The 1.16.100 `camper.texture_set.json` binds colour `camper` to `camper_mer`; the existing `Texture.default` / `entity` base pass permits this without changes to lit, glow or mirror materials, visibility or switches. Without Vibrant Visuals, interior surfaces keep diffuse colour and mirrors keep their baked gradient; lamps retain legacy alpha-mask glow. No normal or height map is generated.
- Agreement: Proposed
- Basis: [0147](../adr/0147-light-the-lamps-with-a-pbr-emissive-layer.md), [0197](../adr/0197-emit-camper-hover-particles-below-the-discs.md), [0234](../adr/0234-plated-camper-mirrors-and-a-simpler-camper-exterior.md), [0190](../adr/0190-ribbed-camper-shell-atlas.md), [0193](../adr/0193-shared-texture-tooling.md).
- Implementation: `tools/camper_mer.py`; `tools/lit_textures.py`; `tools/mer.py`; `tools/gen_camper.py`; `packs/yasu_ride_rp/textures/entity/yasu_ride/camper.texture_set.json`.
- Verification: `tests/tools/mer.test.ts` exercises shifted region origins, exact material values, bounded lamp/mirror masks, hardware, gutters and opaque zero-emission interiors. `tests/packs/litTextures.test.ts` and `tests/packs/camperGlow.test.ts` check dimensions, texture-set binding and unchanged switched-pass contracts. Client highlights and diffuse fallback are not verifiable offline; no device acceptance is claimed.

### Scooter wheel geometry and texture detail

- Applies to: Both wheels generated by `tools/scooter_running.py`.
- Rule: Both wheels retain white tyre walls, beige discs and chrome dishes. Four raised chrome hex nuts sit at 90-degree intervals with a 45-degree phase on a 0.82 px bolt circle on each exposed negative-x face, opposite the fork and spring. Each 0.32 px-deep nut rises over a wider dark round washer and has a dark hexagonal bevel border around its light face. Each raised part uses one cutout face, avoiding crossed reflection bands. The centre has a 0.55 px-radius round boss, a 0.43 px-radius washer step and a 0.30 px-radius hex nut. Six 0.19 px-radius dark slotted screw heads sit on a distinct painted outer rim ring. Revolved skins form the exposed dish's raised inner hub, recessed step and rolled outer lip, plus a wider polished bead beside a dark line; new relief stays on the negative-x face clear of the fixed suspension. The tyre is a smooth 64-segment carcass with no tread pattern or grooves; its trapezoidal section has a flat, solid-black crown reaching the 4.3 px rolling radius, and its inner side, hidden behind the whitewall disc, has no cubes. Rear radial and hardware dimensions scale by 0.96. No bones, paint regions or material types are added, and roll and fold retain their clearance. Each running wheel assembly contains 777 cubes; their wheel bones contain 780 including the discs and hub plates. The running allocation and usage are both 1,695; total allocation is 4,667 under the 6,000 ceiling. The geometry size guard remains twice the main baseline. Hub hardware stays within a 1.5 px radial envelope and |x| below 1.95 in the generator frame.
- Agreement: Proposed
- Basis: [0251](../adr/0251-add-the-scooter-kind.md) Decision, "Wheels."
- Implementation: `tools/scooter_running.py` (`_wheel`, `_wheel_pixel`), `tools/scooter_dims.py` (`AREA_CUBE_ALLOCATION`).
- Verification: `tests/tools/scooterWheelDetail.test.ts`; `tests/packs/scooterModel.test.ts`; `tests/tools/scooterStrutFront.test.ts`; `tests/tools/scooterStrutRear.test.ts`; `tests/packs/scooterClient.test.ts`. `pnpm model:check` checks generated previews. Device appearance remains unverified.

### Scooter flight geometry and generated animations

- Applies to: The scooter generator and Resource Pack client entity.
- Rule: `gen_scooter.py` writes the geometry, textures and `scooter.anim.json`. Only the wheel and hub bones drop and fold; the fender, fork and suspension remain on `steer`. Both fold bones drop 3.5 px before turning +90 degrees about game z, with the drop complete at 0.4 seconds of the one-second deployment. Retraction reverses those stages. Turned cube corners require a drop strictly greater than 3.216401 px to clear the lowest fixed corner at y 2.666652 px, excluding the stand. The stand rotates +85 degrees about its real hinge bar at (0, 3.735, 1.045), lifting both feet above y 1 px. `glow_front` and `glow_rear` are children of the corresponding fold bones. Each disc has 16 squares rotated about x, corner radius 4.3 px and depth 0.5 px, separated from the wheel's game +x outer face by 0.1 px. Its `hover_front` or `hover_rear` locator is centred on the outer face, which faces down after folding. The solid (80, 170, 255) glow region participates in both the legacy lit alpha mask and the emissive MER mask, following the [camper hover display](camper-hover-display.md) approach. Steering rotates about the measured 20.9-degree inclined axis using the game Euler convention of ADR 0166. Positive steering moves the front of the wheel left. Root roll is lean minus bank; wheel roll uses distance travelled and the tyre radius. The generated animations also provide the shared engine and hover sound loops and hover particles at the two disc locators.

  The client uses `entity_alphatest` for the alpha-cut body and steering plates and the shared 16-paint variant order. The form controller has only ground, deploy, hover and retract states, with the SUV's engine and hover sound gates and no submarine mode. The independent stand controller blends between the resting stand and `stand_up` over 0.3 seconds. The base render pass hides glow discs and lit lamps; the gear-gated emissive glow overlay draws only `glow_*`, followed by the headlights-gated lamp overlay. Hover particles use both disc locators; there is no exhaust particle binding. A single `exhaust` locator sits on `body`, which carries the engine muffler and outlet, outside all wheel fold and strut ancestry. `scooter_engine.OUTLET_END` uses `OUTLET_CENTER` for x/y and `max(OUTLET_Z)` for the rear end; the generator applies the same x mirror as for `hover_*`, producing (2.65, 4.18, 11.15) in model pixels. The locator adds no cubes: usage remains 5,586, allocation 5,617 and the ceiling 6,000. Exhaust animations and particles are added in #1950; this locator change leaves the Resource Pack version bump to that issue. The server entity remains a later issue.

- Agreement: Proposed
- Basis: [0167](../adr/0167-compound-rotation-assemblies-as-a-vehicle-neutral-rule.md), [0197](../adr/0197-emit-camper-hover-particles-below-the-discs.md); scooter generator requirements (#1762).
- Implementation: `tools/scooter_dims.py`, `tools/scooter_glow.py`, `tools/scooter_anim.py`, `tools/gen_scooter.py`; `packs/yasu_ride_rp/entity/yasu_ride/scooter.ce.json`, `packs/yasu_ride_rp/animation_controllers/yasu_ride/scooter.ac.json`, `packs/yasu_ride_rp/render_controllers/yasu_ride/scooter.rc.json`.
- Verification: `tests/tools/scooterAnim.test.ts` checks steering matrices, axis invariance, clearance, stand feet, glow radius and locators, fold reversal and shared sounds. `tests/tools/scooterTextures.test.ts` checks lit masks. `tests/packs/scooterClient.test.ts` checks client references, paint variants, controller gates and overlays, and transformed fold, glow, steering and stand geometry. In-game appearance remains unverified.

## Open issues

Where an ADR and the implementation differ, this spec states the implementation and lists the difference here.

- ADR [0247](../adr/0247-precise-camping-gear-rotations-textures-and-cube-budget.md) provisionally permits registered yaw-plus-local-pitch gear assemblies (no three-axis cubes), with `COMPOUND_TILTS = False` selecting yaw-only steps of at most 0.5 px; `tools/gear_kit.py` implements the rotation rule and `COMPOUND_TILTS`; `tools/gen_camping_gear.py` accepts compound cubes that match an assembly registered through `gear_registry.assemblies()`; each model supplies its final assembly members through `GearModel.assemblies`, including the Macrame Hanging Planter's `macrame_planter_net`.
- ADR [0247](../adr/0247-precise-camping-gear-rotations-textures-and-cube-budget.md) provisionally assigns a shared 512 x 512 atlas with 128 x 128 item cells, 4-texel outer and 2-texel region gutters, 8 texels per model pixel (16 for lettering), and binary non-glass alpha with nearest-opaque RGB; the layout is implemented by `tools/gear_atlas.py` (512 x 512, static `GEAR_TILES`, gutters, and alpha checks), with deterministic painting in `tools/gear_paint.py` and verification in `tests/packs/gearAtlas.test.ts`; only the client checks remain.
- ADR [0247](../adr/0247-precise-camping-gear-rotations-textures-and-cube-budget.md) provisionally selects decor opaque/alpha-test/blend by sampled alpha and glass, uniform pair alpha test at the first standing cutout, and opaque glass twins in pairs; the Macrame Hanging Planter decor uses `alpha_test` for sampled alpha-0 leaf cut-out texels; standalone decor selects its material from sampled alpha and glass, and pair blocks use one shared `alpha_test` material for standing-item cutouts.
- ADR [0247](../adr/0247-precise-camping-gear-rotations-textures-and-cube-budget.md) provisionally sets `MAX_CUBES_PER_ITEM = 256` after decomposition and `MAX_CUBES_PER_PAIR_BLOCK = 512` visible cubes; the generator now enforces both limits through `tools/gear_validate.py`. Client performance at these limits remains unverified.
- ADR [0247](../adr/0247-precise-camping-gear-rotations-textures-and-cube-budget.md) leaves one-axis block rendering, two-axis composition at standalone and pair ends, the three-axis diagnostic and stepped fallback unverified; follow the [inline proof procedure in ADR 0247](../adr/0247-precise-camping-gear-rotations-textures-and-cube-budget.md#inline-proof-procedure) for the rotation checks before acceptance.
- ADR [0247](../adr/0247-precise-camping-gear-rotations-textures-and-cube-budget.md) leaves 512 x 512 terrain resolution alongside vanilla textures, lettering and gutter bleeding at 8/16/32/48 blocks unverified; follow the [inline proof procedure in ADR 0247](../adr/0247-precise-camping-gear-rotations-textures-and-cube-budget.md#inline-proof-procedure) for the atlas checks.
- ADR [0247](../adr/0247-precise-camping-gear-rotations-textures-and-cube-budget.md) leaves partial face cutouts, RGB fringes and single-sided alpha-test loading/culling unverified; follow the [inline proof procedure in ADR 0247](../adr/0247-precise-camping-gear-rotations-textures-and-cube-budget.md#inline-proof-procedure) for the alpha checks.
- ADR [0247](../adr/0247-precise-camping-gear-rotations-textures-and-cube-budget.md) leaves standalone glass sorting and pair opaque twins unverified; follow the [inline proof procedure in ADR 0247](../adr/0247-precise-camping-gear-rotations-textures-and-cube-budget.md#inline-proof-procedure) for the glass checks.
- ADR [0247](../adr/0247-precise-camping-gear-rotations-textures-and-cube-budget.md) leaves opaque/alpha-test mixing unverified and requires reproducing the recorded opaque/blend rejection on BDS; follow the [inline proof procedure in ADR 0247](../adr/0247-precise-camping-gear-rotations-textures-and-cube-budget.md#inline-proof-procedure) for the material checks.
- ADR [0247](../adr/0247-precise-camping-gear-rotations-textures-and-cube-budget.md) leaves the 10-percent frame-rate threshold and highest passing cube counts on PC and phone unmeasured; follow the [inline proof procedure in ADR 0247](../adr/0247-precise-camping-gear-rotations-textures-and-cube-budget.md#inline-proof-procedure) for the budget checks.
- ADR [0247](../adr/0247-precise-camping-gear-rotations-textures-and-cube-budget.md) leaves 8192 stored cubes with 512 visible unmeasured for load time, memory and frame rate; compare `pair_hidden` with `budget_512` in the [inline proof procedure in ADR 0247](../adr/0247-precise-camping-gear-rotations-textures-and-cube-budget.md#inline-proof-procedure).
- ADR 0167 and ADR 0193 are Proposed with the acceptance condition "owner decision pending (see #1193)". The rules for compound rotations, tilting, the shared texture modules, texture comparison cannot be Accepted until the owner decides: `docs/adr/0167-compound-rotation-assemblies-as-a-vehicle-neutral-rule.md`, `docs/adr/0193-shared-texture-tooling.md`.
- ADR 0167 Decision says the sports boat declares only `{"wheel": {"owner": "sportsboat", "cubes": 146}}` and puts the throttle lever out of scope; the implementation also registers `throttle_lever` (8 cubes) in the sports boat table (`tools/gen_sportsboat.py`); the ADR needs an edit or a superseding ADR.
- ADR 0167 Consequences says the SUV `arc` has 16 cubes; the implementation registers `arc` with 30 cubes and pins 30 in a test (`tools/suv_cabin.py`, `tests/packs/model.test.ts`); the ADR needs an edit or a superseding ADR.
- ADR 0167 says the table shape is `{name: {"owner": generator_name, "cubes": count_or_description}}`; the implementation compares `cubes` as a number (`assert_axes` in `tools/cube_tilt.py`), so a description would fail; the ADR needs an edit or a superseding ADR.
- ADR 0167 names the sports boat, SUV, camper and bulldozer generators; the implementation also registers assemblies in the Noga chair generator (`tools/gen_noga_chair.py`) and checks other generators with an empty mapping (`tools/gen_camping_gear.py`, `tools/gen_gas_lantern.py`); the ADR needs an edit or a superseding ADR.
- ADR 0167 says it supersedes in part 0009's "reading of the one-axis convention", but the Decision of ADR 0009 contains no one-axis convention, so no sentence of 0009 is replaced; the code message cites "ADR 0009, 0167" (`tools/cube_tilt.py`); the ADR needs an edit.
- ADR 0167 Decision says confirmation of the rotation order on a device is pending. No manual-test row or ADR records one: `docs/adr/0167-compound-rotation-assemblies-as-a-vehicle-neutral-rule.md`, `docs/manual-test.md`.
- ADR 0009 says to mark the exhaust position with the locator `exhaust` and to use the bone names for wheels, doors and seats; the sports boat and the bulldozer have no `exhaust`, the camper names its entry door `door_entry`, and the bulldozer names its one door `door_l`, which is not one of `door_fl`, `door_fr`, `door_rl`, `door_rr` (`packs/yasu_ride_rp/models/entity/yasu_ride/`). The ADR was written for the SUV only; it needs an edit or a superseding ADR.
- ADR 0049 says the icon is drawn with "the same model, flying pose, camera, and supersampled rasterizer as the previews"; the implementation uses the same model, pose and rasterizer but its own framing: `render_icon` computes its scale and offsets from the vehicle's projected bounds to fill `ICON_FILL` of the width, and builds its own background and screen-space glow discs (`tools/render_preview.py`); the ADR needs an edit or a superseding ADR.
- ADR 0009 Decision gives the grille eight slots and `AGENTS.md` states it for models in general; only the SUV grille is generated from a slot count (`tools/suv_shell.py`, `SLOTS`), and no test or generator constant pins the camper or bulldozer grille. The SUV rule is in the SUV body and seats topic.
- ADR 0009 Consequences says any model that follows the conventions can be used by swapping only the `.geo.json` and the texture; no test swaps a model, and the animations and controllers address bones by name (`packs/yasu_ride_rp/animations/yasu_ride/`), so the claim is untested.
- ADR 0027 Decision says the `headlights` bone is drawn unshaded in a warm white; the SUV preview colours the alpha-0 texels of `suv_lit.png` on the `headlights` and `tail_lights` bones, moved toward white by `LIT_GAIN`, and shades the other texels of those bones normally (`tools/render_preview.py`, `SUV_LIT_BONES`). `LAMP_LIT` as a flat colour is used for the other vehicles; the ADR needs an edit or a superseding ADR.
- ADR 0027 and ADR 0045 name the animations `animation.mycar.suv.wheels_folded` and `animation.mycar.suv.submerged` and the file `suv.animation.json`; the implementation reads `animation.yasu_ride.suv.wheels_folded` and `animation.yasu_ride.suv.submerged` from `suv.anim.json` (`tools/render_preview.py`, `packs/yasu_ride_rp/animations/yasu_ride/suv.anim.json`); the ADRs need an edit.
- ADR 0016 Consequences says the renderer samples one texel per face; the implementation maps fractional UVs to strips for the SUV and the camper (`tools/render_preview.py`, `textured_face`) and still takes one colour per face for the sports boat (`collect_boat`, `face_color`); the ADR is superseded, so it needs an edit or none.
- ADR 0056 Decision says the boat's cube x rotations are negated before drawing; the implementation negates the x and z rotations of cubes and of bones (`game_turn` cites ADR 0051 and 0058); the ADR needs an edit or a superseding ADR.
- ADR 0027 Consequences says rendering takes about 6 seconds and ADR 0056 says `pnpm model:check` takes about 21 seconds; the renderer now also draws the camper, bulldozer, camping gear, chair and tent previews and the item icons (`tools/render_preview.py`, `raster_jobs`); these historical timings do not describe the current per-scene CI matrix. The extra previews are covered by ADRs 0067, 0093, 0122, 0130 and 0136, and are not in this spec.
- ADR 0101 Decision says the macrame planter is the one listed exception to the rule that every block geometry starts at y 0 until #412 lands; the test has no exception list and asserts y 0 for every block geometry, including the macrame planter (`tests/packs/blockGeometry.test.ts`, `packs/yasu_ride_rp/models/blocks/yasu_ride/macrame_planter.geo.json`); the ADR needs an edit.
- ADR 0101 Decision lists eight invisible blocks; the test lists seventeen, including the tent blocks and extra camper blocks added by later ADRs (`tests/packs/blockGeometry.test.ts`, `INVISIBLE_BLOCKS`); the ADR needs an edit, or the later ADRs should say they extend the list.
- ADR 0101 asks for a manual check that no hidden-bone dot shows on a client; the manual-test rows that mention it (B17, C72, C73) have empty result cells: `docs/manual-test.md`.
- ADR 0193 says every generated file stays byte-identical when a generator adopts the modules; no test compares bytes, and `pnpm model:check` compares decoded PNG pixels and parsed JSON only (`tools/texture_io.py`).
- The renderer also writes the camper, bulldozer, camping gear, chair, tent and item previews, and `README.md` shows the camper and bulldozer tables; apart from camper texture density and the gear rules above, these preview sets are not specified here: `tools/render_preview.py`, `README.md`.
