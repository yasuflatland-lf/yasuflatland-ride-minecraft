# Camper body and parking

- Scope: The camper kind, body model, collision and placement, paint, parking checks, parked room, departure, and bumper lift.
- Verified at: 9d4b0bbc
- Source: [0067](../adr/0067-camper.md)
- Source: [0068](../adr/0068-park-the-camper-with-room-blocks.md)
- Source: [0069](../adr/0069-camper-right-hand-drive.md)
- Source: [0070](../adr/0070-raise-the-camper-front-seats.md)
- Source: [0091](../adr/0091-alpha-blend-only-the-camper-glass.md)
- Source: [0119](../adr/0119-park-the-camper-over-natural-ground.md)
- Source: [0143](../adr/0143-place-the-camper-in-the-suvs-space.md)
- Source: [0145](../adr/0145-move-camper-side-lamp-and-door-handle.md)
- Source: [0146](../adr/0146-wire-mesh-bulldozer-steps-and-a-camper-vent-cover.md)
- Source: [0147](../adr/0147-light-the-lamps-with-a-pbr-emissive-layer.md)
- Source: [0157](../adr/0157-an-aluminium-rimmed-louvred-camper-vent-lid.md)
- Source: [0190](../adr/0190-ribbed-camper-shell-atlas.md)
- Source: [0193](../adr/0193-shared-texture-tooling.md)
- Source: [0197](../adr/0197-emit-camper-hover-particles-below-the-discs.md)
- Source: [0199](../adr/0199-square-the-camper-front-and-fold-the-grille.md)
- Source: [0226](../adr/0226-lean-and-fold-the-camper-front-panels.md)
- Source: [0227](../adr/0227-camper-door-trim-and-thin-panel-step.md)
- Source: [0234](../adr/0234-plated-camper-mirrors-and-a-simpler-camper-exterior.md)
- Excluded: [0084](../adr/0084-camper-hitbox-spans-the-bumper.md): bumper hitbox coverage is a separate topic
- Excluded: [0116](../adr/0116-a-bumper-stand-in-takes-the-camper-hits.md): stand-in entities and their lifecycle are a separate topic; only the lift from 0119 is specified here
- Excluded: [0192](../adr/0192-suv-detailed-body.md): SUV texture regions and materials are outside the camper companion-map scope

## Rules

### Interior surface materials

- Applies to: The centre floor, inner side lining, backsplash and dinette table.
- Rule: `build_surfaces(registry)` registers `carpet v3` (74 x 222, CARPET), `wall veneer` (416 x 180, WOOD), `backsplash tile` (124 x 152, TILE), and `table oak` (168 x 144, WOOD). The real-base centre floor remains one 36.6 x 3 x 111 px cube, carpet on its upper face at 2 texels per model pixel; six floor margins remain shell-owned. Veneer uses 4 texels per model pixel, anchored at z -48 and y 61, with vertical grain and continuous rails across fragments. The 91 lining cubes become 97 veneer cubes plus four tile cubes, split at z 24 to 39.5 and y 30 to 49 around the existing counter window. Tile uses 8 texels per model pixel, cloudy colour and dark grout at square pitch 15.5 / 13 model pixels. The two-cube table uses oak at 12 texels per model pixel and a central 1 x 1 x 11 px leg; its 14 x 12 px top still ends at y 28, keeping both standing decor slots and hanging clearance unchanged.
- Agreement: Proposed
- Basis: [0067](../adr/0067-camper.md) Decision; [0190](../adr/0190-ribbed-camper-shell-atlas.md) Decision.
- Implementation: `tools/camper_surfaces.py`; `tools/camper_kit.py`; `tools/gen_camper.py`; `tests/packs/fixtures/camper-areas.json`.
- Verification: `tests/tools/camperSurfaces.test.ts` checks UV bounds, direction, fragment registration, backsplash coverage, native texture bytes and table dimensions. The camper pack tests retain the standing-slot surface and clearance checks. Ownership snapshots separate `floor`, `walls`, `tile`, and `table`; golden comparisons retain placement differences while later regions await porting. Not verified: client texture filtering and PC/mobile appearance.

### Kind, item, and fleet limit

- Applies to: Camper registration, crafting, and per-player ownership.
- Rule: The kind is `camper`, the entity is `yasu_ride:camper`, and its item is `yasu_ride:camper_item`. A shapeless crafting-table recipe makes one camper item from an SUV item, a bed, a chest, and an oak door (`minecraft:wooden_door`). `CAMPER_PROFILE.fleetLimit` limits each player’s campers.
- Agreement: Accepted
- Basis: [0067](../adr/0067-camper.md) Decision, "Add the kind `camper`, entity `yasu_ride:camper`, item `yasu_ride:camper_item`"; [0067](../adr/0067-camper.md) Decision, "One camper per player (0066)."
- Implementation: `src/domain/vehicle/kinds/camper/profile.ts`; `packs/yasu_ride_bp/entities/yasu_ride/camper.se.json`; `packs/yasu_ride_bp/items/yasu_ride/camper_item.item.json`; `packs/yasu_ride_bp/recipes/yasu_ride/camper_item.recipe.json`
- Verification: `tests/domain/vehicle/profile.test.ts` "limits each player to one camper". Recipe ingredients and identifiers read directly from the pack. Not verified: crafting or fleet limits in game; no recipe-ingredient test cited.

### Camper tuning

- Applies to: Camper ground, air, water, bank, and landing-gear motion.
- Rule: Camper tuning comes from `CAMPER_SPEC`, never `SUV_SPEC`. Ground limits are assembled as `CAMPER_MOTION` and `CAMPER_TYRES` in `profile.ts`; flight and submarine media are `CAMPER_AIR` and `CAMPER_WATER`, and transformation, bank, and gear parameters are assembled as `CAMPER_TRANSFORMING` in `spec.ts`. Ground speed uses `CAMPER_SPEC.maxSpeed`, acceleration uses `CAMPER_SPEC.accel`, water speed uses `CAMPER_SPEC.maxWaterSpeed`, draft uses `CAMPER_SPEC.floatDraft`, bank uses `CAMPER_SPEC.maxBank`, `bankRate`, and `bankSink`, and gear uses `CAMPER_SPEC.gearDownHeight` and `gearProbeOffset`.
- Agreement: Accepted
- Basis: [0067](../adr/0067-camper.md) Decision, "with its own `CAMPER_SPEC` (never `SUV_SPEC`)"
- Implementation: `src/domain/vehicle/kinds/camper/spec.ts`; `src/domain/vehicle/kinds/camper/profile.ts`; `src/domain/vehicle/kinds/camper/drive.ts`
- Verification: `tests/domain/vehicle/kinds/camper/drive.test.ts` "reaches 95 percent speed in 60 to 90 ticks and stays within its cap for 300 ticks"; `tests/domain/vehicle/profile.test.ts` "reads the camper's tyre values from its spec (ADR 0089)". Not verified: all flight, submarine, bank, and gear values on a client.

### Body envelope and collision

- Applies to: Camper body probes and entity collision, all forms unless docked.
- Rule: The body envelope uses `CAMPER_SPEC.bodyFront`, `bodyRear`, `bodyHalfWidth`, and `carHeight`; the engine box covers only its middle. The base components keep a 3-wide, 4-high square collision box. The docked override is 0.4 wide and high; undocking restores 3 by 4. The camper’s own custom hit test is one feet-level cube of `CAMPER_SPEC.hiddenHitboxSize`, centered at `[0, hiddenHitboxSize / 2, 0]`, hidden inside the parked center floor block.
- Agreement: Accepted
- Basis: [0067](../adr/0067-camper.md) Decision, "Body: 3 wide, 7 long, 4 high."; [0068](../adr/0068-park-the-camper-with-room-blocks.md) Decision, "The camper keeps its 3 x 4 collision box in its base components"
- Implementation: `src/domain/vehicle/kinds/camper/spec.ts`; `packs/yasu_ride_bp/entities/yasu_ride/camper.se.json`
- Verification: `tests/packs/camper/parking.test.ts` "keeps the 3 x 4 collision box in the base components"; `tests/packs/camperRoom.test.ts` "hides the camper's own hitbox in the parked floor block under its center and preserves the undocked camper's body collision". Not verified: collision and tap behavior on clients in this revision.

### Body end guard

- Applies to: Moving camper, front for positive speed and rear for negative speed.
- Rule: `guardEnds` uses the horizontal magnitude of `ctx.velocity + impulse` to check the end toward travel. It checks layers from `CAR_LOWEST_LAYER` in car form, and from the feet in hover or submarine, up to `ceil(height)`. `endLanes` insets the outer lanes by `SIDE_INSET`, spaces them no farther apart than `MAX_LANE_SPACING`, and visits center-most lanes first; the camper has four lanes. Travel samples advance by `MAX_TRAVEL_STEP` and include the final end position, nearest first. A solid hit zeroes speed, step ticks, and jump velocity, cancels horizontal velocity, and marks the step blocked. At zero speed it makes no queries.
- Agreement: Accepted
- Basis: [0067](../adr/0067-camper.md) Decision, "It looks ahead by the velocity the engine applies this tick, not the post-friction speed"; [0067](../adr/0067-camper.md) Decision, "In car form it checks from two blocks above the feet"
- Implementation: `src/domain/vehicle/kinds/camper/bodyGuard.ts`; `src/domain/vehicle/kinds/camper/drive.ts`
- Verification: `tests/domain/vehicle/kinds/camper/bodyGuard.test.ts` "gives the camper four lanes", "lets layers zero and one through in car form only", "samples every block from the front to this tick's applied move, not the internal speed", "makes no queries at rest and preserves the step"; `tests/domain/vehicle/kinds/camper/drive.test.ts` "cancels the step jump when a curb lies ahead and a wall stands at the front end". Not verified: body overlap against walls on clients.

### Placement clearance

- Applies to: Placing a camper item on a block.
- Rule: `CAMPER_PROFILE.placement` accepts only the top face. Its clearance uses the profile’s `halfX` and `halfZ`, with `clearanceHeight(body)` for height: the collision box fits in 3 by 3 by 4 clear cells. The visible ends can extend outside that volume.
- Agreement: Proposed
- Basis: [0143](../adr/0143-place-the-camper-in-the-suvs-space.md) Decision, "Set the camper's placement clearance to `halfX` 1, `halfZ` 1, and height 4, the SUV's footprint with the camper's own height."; [0143](../adr/0143-place-the-camper-in-the-suvs-space.md) Decision, "The surface stays the top face of a block."
- Implementation: `src/domain/vehicle/kinds/camper/profile.ts`; `src/domain/vehicle/placement/placement.ts`
- Verification: `tests/packs/placementClearance.test.ts` "fits every %s collision box inside its placement clearance" (camper row). Not verified: placement beside obstacles on a client; 0143 still awaits an owner decision.

### Fixed khaki paint

- Applies to: The single khaki camper colour atlas and saved variant.
- Rule: The camper uses `CAMPER_PROFILE.paintPolicy = fixed("khaki")`. All dye hits, including bumper stand-in hits, are ignored without consumption, sound, or a message. On load, nonzero saved variants are normalized to variant 0. The generator writes only `camper.png` for the colour atlas, and the base render controller uses `Texture.default` directly. No per-paint textures, paint events, or paint groups remain. Keep `minecraft:variant` for saved entities; `yasu_ride:normalize_paint` resets it to 0 through `yasu_ride:normalized_paint`. Lit, glow, and mirror passes are unchanged.
- Agreement: Proposed
- Basis: [0067](../adr/0067-camper.md) Decision, "The camper has fixed khaki paint through `CAMPER_PROFILE.paintPolicy = fixed("khaki")` (0031, 0076)."; [0190](../adr/0190-ribbed-camper-shell-atlas.md) Decision, "Generate one khaki colour atlas, `camper.png`, from the fixed palette (0067, 0076)."
- Implementation: `src/domain/vehicle/kinds/camper/profile.ts`; `tools/gen_camper.py`; `packs/yasu_ride_rp/textures/entity/yasu_ride`
- Verification: `tests/packs/camper/paints.test.ts` "generates exactly one colour atlas and no per-paint files"; `tests/domain/vehicle/profile.test.ts` "gives the camper a khaki default paint (ADR 0067, 0076)". `tests/application/vehicle/paintVehicle.test.ts` verifies ignored dyes; `tests/application/vehicle/normalizePaint.test.ts` verifies load normalization. Not verified: load recovery on a client.

### Model bone contract

- Applies to: Generated `geometry.yasu_ride.camper`.
- Rule: The front is -z. `body` is a child of `root`. The model has `headlights`, `ceiling_lights`, `bunk`, `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr`, `seat_0` through `seat_3`, `door_entry`, `steering`, `shower_door`, `cabinet_sink_door`, `cabinet_stove_door`, `fridge_top_door`, `fridge_bottom_door`, `drawer_top`, `drawer_bottom`, and `glass` as children of `body`; `door_glass` is a child of `door_entry`. The additional glow bones belong to [Camper hover display](camper-hover-display.md). Seat positions, heights, and driver selection belong to [Seats and driver selection](seats-and-driver.md), “Camper seat layout”. The furniture bones are listed here as an asset contract, without specifying their behavior.
- Agreement: Accepted
- Basis: [0067](../adr/0067-camper.md) Decision, "with bones `root`, `body`, `headlights`, `wheel_fl`, `wheel_fr`, `wheel_rl`, `wheel_rr`, `seat_0`-`seat_3`, `door_entry`, and `steering` (0009)"; [0091](../adr/0091-alpha-blend-only-the-camper-glass.md) Decision, "This extends the bone contract of 0009 for the camper with `glass` and `door_glass`."
- Implementation: `packs/yasu_ride_rp/models/entity/yasu_ride/camper.geo.json`; `tools/gen_camper.py`; `tools/camper_kit.py`; area modules and final cube ranges are listed in [Model conventions and rendered previews](model-and-previews.md#camper-generator-modules)
- Verification: `tests/packs/camper/shell.test.ts` "uses the production geometry identifier with no test namespace", "connects every standard bone to root without cycles". Not verified: every bone’s animation on a client.

### Glass material and draw order

- Applies to: Camper base render pass, body and entry-door glass.
- Rule: The client defaults to `entity`, uses `entity` for unlit lamps and `entity_emissive` for lit lamps, and assigns `entity_alphablend` only to `Material.glass`. The base render controller maps `glass` and `door_glass` to that material. Both glass bones follow all other bones; no opaque bone holds a glass-swatch cube. `glass` holds the windshield, side windows, and rear window; the mirrors sit in a `mirror` bone with its own PBR pass (0234); corner glass has been removed. `door_glass` follows the door hinge. Hover rendering is specified in Camper hover display.
- Agreement: Proposed
- Basis: [0091](../adr/0091-alpha-blend-only-the-camper-glass.md) Decision, "The render controller maps both bones to `Material.glass`"; [0091](../adr/0091-alpha-blend-only-the-camper-glass.md) Decision, "No opaque camper bone may hold a `glass` swatch cube"; [0199](../adr/0199-square-the-camper-front-and-fold-the-grille.md) Decision, "Remove the corner glass from 0091's `glass` bone."
- Implementation: `packs/yasu_ride_rp/entity/yasu_ride/camper.ce.json`; `packs/yasu_ride_rp/render_controllers/yasu_ride/camper.rc.json`; `tools/gen_camper.py`
- Verification: `tests/packs/camper/glass.test.ts` "draws the model opaque and blends only the glass material", "puts every glass cube in a glass bone listed after every opaque bone". Not verified: cabin visibility through near and far panes on clients after front squaring.

### Right-hand-drive cab

- Applies to: Camper cab model, independent of rider selection.
- Rule: The steering wheel and column, instrument panel, pedals, and driver bucket seat are on the right after the generator mirrors build coordinates into Bedrock coordinates. The radio and glovebox are on the left. The dashboard uses the sloped face, green shelf and chin specified in Camper interior, “Raised dashboard”, replacing the old dashboard, console and engine cover. The six-button cluster and lower gauge pair move 3 px toward the wheel; the pair has a chrome bracket tilted 35 degrees toward the driver. Both front bucket seats use the light rounded 501-cube shape on swivel pedestals, preserving the raised cushion level and rider anchors. The back and dished waterfall pan use tangent patches, shared six-wale green tweed and grey-olive vinyl, piping, and lap belts. The 333 by 128 primary region is named `green tweed and vinyl shared by both seats` and tagged FABRIC; the vinyl panel and trim swatches use separate VINYL regions. The exposed belt clears the upholstery, while its outboard attachment meets the lower bolster and piping. The static `steering` bone contains 115 cubes with pivot (-14.29, 38.4909, -42.8) and rotation [60, 0, 0]. The 0.8-scale wheel has an outer diameter of about 12.64 px and lies 30 degrees from horizontal, facing up and toward the driver. Its own vertical axis projects vertically when viewed along the column. The approved wheel uses a scalloped ivory rim, chrome half horn ring, three thin dished chrome spokes and a plain layered hub. A dark-dash shaft and steel sleeve remain on `body`; the column rises 60 degrees above the floor perpendicular to the wheel plane. The 30-cube gear lever belongs to static `body`: a 5.46 px horizontal rod bends into a 4.70 px rod rising at 36.56 degrees, with a black knob twice the photo ratio. Rider layout is specified by Seats and driver selection, “Camper seat layout”.
- Agreement: Accepted
- Basis: [0069](../adr/0069-camper-right-hand-drive.md) Decision, "The model moves every driver-side part to the right"; [0069](../adr/0069-camper-right-hand-drive.md) Decision, "The radio and the glovebox move to the passenger side on the left"; [0070](../adr/0070-raise-the-camper-front-seats.md) Decision, "The model retains the 6.4 px rise of both front seats and the raised cushion level with a pan base at 24.4 px and a dished top near 27.9 px"
- Implementation: `tools/camper_cab_seats.py`; `tools/camper_seat_textures.py`; `tools/camper_cab.py`; `tools/camper_dash.py`; `tools/camper_steering.py`; `tools/render_preview.py`; `tools/gen_camper.py`; `packs/yasu_ride_rp/models/entity/yasu_ride/camper.geo.json`
- Verification: `tests/packs/camper/cab.test.ts` checks right-hand steering, wheel envelope and firewall column termination. `tests/packs/camper/steering.test.ts` checks rim clearance of at least 1.5 px from the dash face, 1 px from the cushion and 0.6 px from the side wall, and lever clearance of at least 0.3 px from wheel and dash. `tests/tools/camperSteering.test.ts` checks static lever ownership, dimensions, descriptor translation and registered UVs. `tests/packs/camper/shell.test.ts` covers the shell. `tests/tools/camperCabSeats.test.ts` checks transformed wheel, armrest, and lap-belt clearance, deterministic texture regions, and independent builds. `tests/packs/camper/seats.test.ts` checks the 501-cube cab bones and unchanged profile/collision contract. Not verified: first-person windshield visibility on devices after the dashboard replacement. The detailed dashboard atlas uses the preview renderer's equal-texel merging and shares immutable face patches across the four camper poses, with shading still applied per pose. There is no camper steering animation.

### W mark exception

- Applies to: Camper side stripe and model markings.
- Rule: The large mirrored W remains in the stripe as the owner’s exception to the model marking convention.
- Agreement: Accepted
- Basis: [0067](../adr/0067-camper.md) Decision, "Keep the stripe's large W from the photos, at the owner's request, as an exception to the rule against makers' marks in 0009."
- Implementation: `tools/camper_shell.py`; `tools/gen_camper.py`; `packs/yasu_ride_rp/models/entity/yasu_ride/camper.geo.json`
- Verification: `tests/packs/camper/shell.test.ts` "draws the side stripe's W as mirrored single-cube strokes on a flat bottom (#459)". Not verified: absence of every maker or model name anywhere in the model; no test asserts that complete visual claim.

### Rear signals, handles, and stripe ends

- Applies to: Camper exterior and entry-door model.
- Rule: The mid-body porch-light box is removed. Symmetric static amber signals with chrome bezels sit on the rear profile outside the red tail lights, clear of the ladder, in `body`; they do not blink or switch with the lamps. Both entry handles use `DOOR_HANDLE_Y`, just below `STRIPE_Y`, and swing with `door_entry`. Quarter-pixel stripe rows meet the inner edge lines of the W’s outer arms without a step.
- Agreement: Proposed
- Basis: [0145](../adr/0145-move-camper-side-lamp-and-door-handle.md) Decision, "Remove the porch-light box."; [0145](../adr/0145-move-camper-side-lamp-and-door-handle.md) Decision, "End the side stripe on the W's outer arms' inner edge lines, extended up through the stripe, on both sides of the vehicle"
- Implementation: `tools/camper_rear.py`; `tools/camper_door.py`; `tools/camper_shell.py`; `tools/gen_camper.py`; `packs/yasu_ride_rp/models/entity/yasu_ride/camper.geo.json`
- Verification: `tests/packs/camper/door.test.ts` and `tests/packs/camper/rear.test.ts` and `tests/packs/camper/shell.test.ts` "replaces the mid-body amber box with symmetric static rear signals (#596)", "aligns both entry handles half a pixel below the stripe (#596)", "ends the stripe on the W's outer arm inner edges, with no step at their tops (ADR 0145)". Not verified: PC/mobile appearance and door movement; manual rows C161–C163 have empty results.

### Rear-right vent lid

- Applies to: Camper outer rear-right wall, all forms.
- Rule: The former rear-right window is closed with outer shell, inner lining, and band; its glass, frame, and curtains are absent; the five remaining main side windows have tied-back fabric curtains. The opaque lid is built in `body` using `VENT_COVER`, `VENT_RIM`, and `VENT_CORNER`. Two columns of `VENT_SLITS` recessed black-backed slits use `VENT_SLIT`, `VENT_SLIT_PITCH`, `VENT_SLIT_MARGIN`, and `VENT_SLIT_GAP`; the lower panel is plain with a latch. The panel is `trim_beige`, the upper rail is aluminium with the `vent_screws` region, and the other rim pieces are chrome. Build-frame +x is mirrored to Bedrock -x.
- Agreement: Proposed
- Basis: [0146](../adr/0146-wire-mesh-bulldozer-steps-and-a-camper-vent-cover.md) Decision, "Remove the camper's right-side window at z 38 to 50, y 36 to 49 from `right_windows`."; [0157](../adr/0157-an-aluminium-rimmed-louvred-camper-vent-lid.md) Decision, "Keep 0146's wall closure, its position on the right outer wall, and the bulldozer steps. Replace only the cover's look."; [0190](../adr/0190-ribbed-camper-shell-atlas.md) Decision, "The vent lid of 0157 now has a `trim_beige` panel and an aluminium top rail whose west face carries `vent_screws`."
- Implementation: `tools/camper_shell.py`; `tools/camper_kit.py`; `tools/gen_camper.py`; `packs/yasu_ride_rp/models/entity/yasu_ride/camper.geo.json`
- Verification: `tests/packs/camper/atlas.test.ts` and `tests/packs/camper/rear.test.ts`, describe "camper rear-right vent lid (ADR 0146, 0157)": "removes the rear-right pane and closes the outer wall, lining, and band", "frames a grey-beige panel in a raised aluminium rim with cut corners", "cuts two columns of twelve recessed slits above a plain lower part", "adds a latch below the slits"; "puts a screw row on the aluminium vent upper rail". Not verified: PC/mobile appearance; manual row C164 has empty results.

### Ribbed shell atlas and trim

- Applies to: The camper khaki atlas and outward side-wall faces, including the door.
- Rule: The existing 114 by 220 swatch/hardware atlas is registered as `base` with `Material.SWATCHES_MIXED`. Its local row 0 retains existing swatch indices; aluminium and `trim_beige` are appended. `camper_atlas.RegisteredAtlas` retains nested `rib`, `door_head`, `door_hinge`, `door_latch`, `vent_screws`, `bolt`, and `mirror_chrome` coordinates relative to `base`. Geometry resolves those local texels through `RegionRef.uv` after packing. `camper_regions.pack` uses deterministic MaxRects trials with no rotation or resampling, two transparent texels between regions by default, and trimmed outer bounds. The door builder adds four regions before packing: `door wood` 111 by 336 (WOOD), `door marble` 101 by 41 (STONE), `door kick` 101 by 44 (METAL), and `door cloth` 16 by 104 (FABRIC). Region origins and companion maps follow the resulting layout; base-local swatch and hardware pixels stay unchanged. Rendering uses each region's pixel function; generation audits rectangle separation and bounds, exact region bytes, and both endpoints of every geometry UV face. `Material` classifies finishes without assigning a uniform MER value to the mixed base. Client mip filtering across transparent gutters remains unverified. The rib phase follows model height from `ROOF`, using `RIB_PERIOD_TEXELS` and `RIB_TEXELS_PER_PX`. Each period has groove, highlight, then flat shell texels. Only outward white faces on both side walls and the door receive ribs; front, rear, and roof remain plain. Door frames and roof edges use aluminium with roof-edge bolts; side-window trim is beige, cab frames black, and mullions aluminium. Hardware uses the named atlas regions and `HARDWARE_DARK_FACTOR`. Shared camper dimensions and atlas allocations live in `tools/camper_kit.py`; area-specific dimensions stay with their builders. Each area may register regions before `prepare_layout()` performs the shared pack; geometry resolves UVs only afterward. The shower adds four named tile/metal regions, so the base origin can move and companion-map masks use the final layout. With only `base`, its origin is `(0, 0)` and generated geometry and PNG bytes are unchanged.
- Agreement: Proposed
- Basis: [0190](../adr/0190-ribbed-camper-shell-atlas.md) Decision, "Keep row 0 within the `base` region as the swatch row with every existing index unchanged."; [0190](../adr/0190-ribbed-camper-shell-atlas.md) Decision, "Apply ribs only to both side walls."; [0190](../adr/0190-ribbed-camper-shell-atlas.md) Decision, "Use aluminium for the door frame and roof edge, with bolt heads along the roof edge."
- Implementation: `tools/camper_kit.py`; `tools/camper_shell.py`; `tools/camper_door.py`; `tools/camper_roof.py`; `tools/gen_camper.py`; `tools/camper_atlas.py`; `tools/camper_regions.py`; `tools/swatch_atlas.py`
- Verification: `tests/tools/camperRegions.test.ts` checks deterministic disjoint packing, gutters, bounds, fractional UV resolution, base dimensions and one-byte corruption. `tests/packs/camper/atlas.test.ts` "resolves the nested rib region through base with groove, highlight, and flat bands", "maps only the outward white shell faces on both walls and the door to height-aligned ribs", "uses beige side window frames, black cab frames, and aluminium mullions", "maps bolts only to the three outer edge faces and preserves lamp swatches and bezels". Not verified: side and three-quarter views at chase-camera distance on PC/mobile; 0190’s owner decision remains pending.

### Squared front and folded grille

- Applies to: Camper front model and geometry regression fixture.
- Rule: The generated front has no 45-degree corner chamfers or corner glass. The windshield and grille span the front, with a black light surround extending to its edge. The face from the bumper to the sill is two flat panels, each leaning by `FRONT_LEAN_SLOPE` and yawed by `FRONT_YAW`, so they meet on the windshield's centre line seen from above with the nose forward. Rows stay level and start on the nose; strips close the sill above them up to an upright windshield folded by the same angle (`WS_YAW`), so the sill's short edges are parallel. The cab-over's upper face is one flat panel down to a V, lowest and furthest forward on the centre line, with two lower panels from the V to the windshield header and a chevron on each side wall. The right wall behind the door carries a water fill, a placard, and an oval lamp in place of the former plain square. The outer trim uses `EDGE_INSET`. Every non-glow cube’s bone, origin, and size is compared with the golden fixture, including the squared front.
- Agreement: Proposed
- Basis: [0199](../adr/0199-square-the-camper-front-and-fold-the-grille.md) Decision, "Generate the front with `tools/gen_camper.py` without 45-degree corners."; [0226](../adr/0226-lean-and-fold-the-camper-front-panels.md) Decision, "Build the front from the bumper top (y = 8) to the sill (y = 31.5) as two flat panels."
- Implementation: `tools/camper_front.py`; `tools/camper_shell.py`; `tools/gen_camper.py`; `tests/packs/fixtures/camper-cubes/`; `packs/yasu_ride_rp/models/entity/yasu_ride/camper.geo.json`
- Verification: `tests/packs/camper/snapshot.test.ts` and `tests/packs/camper/front.test.ts` "leans both panels at one slope and folds them like the windshield, nose forward", "keeps every face cube on one plane per side, from the bumper to the sill", "drops the sill from the windshield base to the panels' top edge", "stands the windshield panes upright, parallel to the panels' top edge", "runs the cab-over's upper panel flat down to a V on the centre line", "replaces the plain square behind the door with the water fill, placard, and lamp", "paints the wall below the entry door like the skirt beside it", "starts every grille row exactly on the nose so the panels leave no gap", "mirrors the left panel onto the right one", "keeps every cube's bone, origin, and size equal to the snapshot in tests/packs/fixtures/camper-cubes/". Regenerate the snapshot with `CAMPER_SNAPSHOT_UPDATE=1 pnpm vitest run tests/packs/camper/snapshot.test.ts`. The snapshot checks bone, origin, and size, not UVs or rotations. Not verified: client shimmer or z-fighting; the owner checks in 0199 and 0226 are pending.

### Door trim, fold-out step, and storage hatch

- Applies to: Camper entry door surround, latch plate, window corners, step, and rear storage hatch model.
- Rule: A fixed aluminium surround on the `body` bone has one latch-side strip, two hinge-side strips, a riveted threshold, a head rail, a riveted drip cap, three hinges, and a catch. The door carries a latch plate with a dark recess and rounded window corners. Its inside adds four vertical-grain wood fields, marble band, scuffed metal kick plate, handle hardware and two tied mini curtains with 160 pleats. The 212 interior cubes stay inside the original slab; the outer skin is 0.2 px thick and the opaque bone totals 244 cubes. Both handles and the single glass cube retain their positions. Entry and glass hinges remain `[-24, 0, -7]`. The step is thin black panels, open at the back: a tread with a front lip and grip lines, two slanted side plates, and a thin rod. The right rear corner only has a storage hatch with a rounded aluminium rail, 22 louver rows in five columns, screws, a label, and three latch knobs.
- Agreement: Proposed
- Basis: [0227](../adr/0227-camper-door-trim-and-thin-panel-step.md) Decision, "Add a fixed surround to the `body` bone, so it stays when the door swings."; [0234](../adr/0234-plated-camper-mirrors-and-a-simpler-camper-exterior.md) Decision, "Build the storage hatch on the right wall only."
- Implementation: `tools/camper_door.py`; `tools/camper_shell.py`; `tools/gen_camper.py`; `packs/yasu_ride_rp/models/entity/yasu_ride/camper.geo.json`
- Verification: `tests/packs/camper/front.test.ts` "frames the entry door in riveted aluminium with three hinges and a latch plate", "builds the fold-out step from thin panels, open at the back", "builds the rear storage hatches with a rounded rail, five louver columns, and latch knobs". `tests/tools/camperDoor.test.ts` checks registered materials, wood UVs and repeatable builds; `tests/packs/camper/door.test.ts` checks rotated slab bounds and swing clearance. Not verified: the metal look on a client; 0227's owner check is pending.

### Automatic parking and pose snap

- Applies to: Undocked camper stopped in car form.
- Rule: Parking requires car form, `onGround`, absolute speed below `DOCK.maxSpeed` for `DOCK.ticks` consecutive steps, and both stick axes within `DOCK.stick`. A seated driver is allowed. A failed check is attempted only once until movement or stick input resets the stop. `snapYaw` rounds to a quarter turn; `parkPose` centers x and z in their cells. If the feet fraction is at least `LOW_GROUND_THRESHOLD`, y becomes `ceil(location.y)`; otherwise it becomes `floor(location.y + FEET_EPSILON)`. Refusal returns `cannot_park`, shown as "Can't park here".
- Agreement: Accepted
- Basis: [0068](../adr/0068-park-the-camper-with-room-blocks.md) Decision, "A seated driver does not stop it from parking. It tries once per stop"; [0068](../adr/0068-park-the-camper-with-room-blocks.md) Decision, "Parking snaps the yaw to the nearest 90 degrees and the location to the center of the feet's cell"
- Implementation: `src/domain/vehicle/kinds/camper/drive.ts`; `src/domain/vehicle/kinds/camper/parkPose.ts`; `src/domain/vehicle/kinds/camper/groundCheck.ts`; `src/domain/vehicle/motion/dock.ts`; `packs/yasu_ride_rp/texts/en_US.lang`
- Verification: `tests/domain/vehicle/kinds/camper/parking.test.ts` "refuses any blocking cell once per stop, then retries after the stick resets the stop", "never parks off ground or with the stick pushed"; `tests/domain/vehicle/kinds/camper/room.test.ts` "snaps the body and floor together above low ground and down through lower snow layers". Not verified: low-ground and snow behavior on clients in this revision.

### Parked room shell

- Applies to: `roomCells` for a snapped camper pose.
- Rule: The room has a full floor over local x -1..1 and z -3..3 at layer 0, a ceiling at layer 3, side and end walls at layers 1–3, three door cells at the middle of the right wall, and a door step using `DOOR_STEP_HEIGHT`. With storage shut it returns 107 distinct cells: 21 floor, 19 ceiling, 57 wall, three door, one step, and six built-in furniture cells. Ceiling compartments and open plates are handled separately. Shell block identifiers are `yasu_ride:camper_floor`, `camper_ceiling`, `camper_wall`, `camper_door`, and `deck_floor` in the same namespace; furniture contributes bed, bunk, and shower-toilet blocks. Furniture behavior belongs to the interior topic.
- Agreement: Accepted
- Basis: [0068](../adr/0068-park-the-camper-with-room-blocks.md) Decision, "a full floor at layer 0 over x -1..1, z -3..3"; [0068](../adr/0068-park-the-camper-with-room-blocks.md) Decision, "walls at layers 1-3 around it; a 3-high door in the middle of the right side with a half-high step under it."
- Implementation: `src/domain/vehicle/kinds/camper/roomCells.ts`; `src/domain/vehicle/kinds/camper/furniture.ts`; `src/infrastructure/vehicle/kinds/camper/dockBlocks.ts`; `packs/yasu_ride_bp/blocks/yasu_ride`
- Verification: `tests/domain/vehicle/kinds/camper/room.test.ts` "lays 107 distinct integer cells with the specified counts at any snapped pose, an open cabinet door's plate in place of a ceiling cell and the open shower door's wall in place of a wall, and no fridge plate, which stands below the ceiling (ADR 0068, 0114, 0118, 0123)", "faces every plate inward and stacks the three door cells above the half step". Not verified: walking through the room on clients in this revision.

### Parking scan and decoration removal

- Applies to: First parking attempt at a stop and clearing on successful parking.
- Rule: `parkCheckCells` returns 168 unique cells: room, cargo, slot, inside storage-plate, and two exit cells, including all roof cells at layer 4. Each must hold normalized air, a member of `CLEARABLE_DECORATIONS`, or permitted natural ground under the next rule. Light blocks normalize to air. Other blocks, liquids, and unknown/unloaded cells refuse parking. `wallFootCells` adds wall-root reads for plant clearing, not refusal. Matching lower halves below cleared upper halves are removed too. Clearing runs top first, replaces only the recorded matching block type with air without drops, and never restores plants.
- Agreement: Proposed
- Basis: [0068](../adr/0068-park-the-camper-with-room-blocks.md) Decision, "On success the decorations are removed, top layer first, without drops, and are not put back."; [0119](../adr/0119-park-the-camper-over-natural-ground.md) Decision, "Natural ground anywhere else (a wall, the interior, the roof, the exit's head) still refuses"
- Implementation: `src/domain/vehicle/kinds/camper/groundCheck.ts`; `src/domain/vehicle/kinds/camper/drive.ts`; `src/domain/shared/decorations.ts`; `src/infrastructure/vehicle/bedrock/bedrockVehicleWorld.ts`
- Verification: `tests/domain/vehicle/kinds/camper/room.test.ts` "checks 168 unique cells including the room and keeps all 45 cargo cells outside its blocks, slots, and the fridge's plate cells (ADR 0097, 0098, 0123)", "plans only decorations, top first, and rejects any blocking or unknown cell", "checks every roof cell and clears decorations there"; `tests/domain/vehicle/kinds/camper/parking.test.ts` "clears only decorations once on the tick after parking, top first". Not verified: drops and plant removal on a client in this revision.

### Natural ground and plant policy

- Applies to: Parking ground cells and wall feet around the camper.
- Rule: `NATURAL_GROUND` contains `grass_block`, `dirt`, `coarse_dirt`, `podzol`, `mycelium`, `dirt_with_roots`, `moss_block`, and `pale_moss_block` in the Minecraft namespace. `parkGround` permits them only in the floor, door step, and exit’s feet. They stay in place rather than being covered or cleared; they are not generally passable. Clearable plants include the grasses, ferns, flowers, leaf litter, snow layers, mushrooms, berry/firefly bushes, eyeblossoms, and moss carpets explicitly listed in `CLEARABLE_DECORATIONS`. Saplings, torchflowers, and pitcher plants refuse. In the three front wall feet (the bumper row), listed plants clear even without a matching upper half; other wall feet require that match.
- Agreement: Proposed
- Basis: [0119](../adr/0119-park-the-camper-over-natural-ground.md) Decision, "Parking accepts one in a ground cell: the 21 floor cells, the door step, and the exit's feet (`parkGround`)."; [0119](../adr/0119-park-the-camper-over-natural-ground.md) Decision, "Saplings, torchflowers, and pitcher plants stay off it"
- Implementation: `src/domain/vehicle/kinds/camper/groundCheck.ts`; `src/domain/shared/decorations.ts`
- Verification: `tests/domain/vehicle/kinds/camper/parkGround.test.ts` "parks over natural ground in any ground cell, leaving it in place, and refuses it anywhere else", "clears a plant in the bumper's row even without an upper half, and leaves other wall feet alone", "still refuses the player-planted %s". Not verified: the iPad natural-grassland and bumper-boarding check required by 0119.

### Docked state and reload recovery

- Applies to: Camper parking tick, held ticks, and restoration.
- Rule: The dock event removes weighted and undocked groups and adds `yasu_ride:docked`, disabling collision and gravity and shrinking the box; the undock event restores `yasu_ride:weighted` and `yasu_ride:undocked`. The parking tick holds the snapped pose but lays no room cells. `roomLaid` enables clearing and laying from the following tick. A restored laid room resumes without a fresh scan. A restored unlaid room scans but plans decoration removal even if blocking cells now exist, then lays immediately because the entity is already docked; recovery does not abandon the parked state on a failed clearance check. The restored entry-door target uses the saved room door’s open state when available, falling back to the restored swing midpoint.
- Agreement: Accepted
- Basis: [0068](../adr/0068-park-the-camper-with-room-blocks.md) Decision, "The parking tick only holds the pose and docks the entity"; [0068](../adr/0068-park-the-camper-with-room-blocks.md) Decision, "The room is laid from the next tick"; [0068](../adr/0068-park-the-camper-with-room-blocks.md) Decision, "After a reload, a parked camper restored before its room was laid redoes the park check and clear"
- Implementation: `src/domain/vehicle/kinds/camper/drive.ts`; `packs/yasu_ride_bp/entities/yasu_ride/camper.se.json`; `src/domain/vehicle/motion/dockEntity.ts`
- Verification: `tests/packs/camper/parking.test.ts` "switches collision and gravity groups when parking and departing"; `tests/domain/vehicle/kinds/camper/parking.test.ts` "holds only the pose on tick 20, lays the room next tick, and scans once", "restores a laid open room immediately without a scan or dock event", "recovers an unlaid parked room once, clearing matching plants before laying even after a blocked check", "restores the saved door target through either direction of a partial swing". Not verified: restoration through an actual client reload in this revision.

### Departure and exit clearance

- Applies to: Parked camper, driver stick press from seat 0; standing occupants on departure.
- Rule: A new stick press requests departure; the driver’s deck-seat input first requests boarding. The drive reads cargo, slot cells, inside storage plates, then exit feet/head in one batch. Cargo requires air; a slot accepts air, its furniture block, or its own decor block; a plate accepts air or its own door plate. Otherwise it remains parked and returns `clear_cargo`, "Clear the blocks inside first". Exit blockage alone does not refuse departure: it omits the overflow exit. A clear exit is centered in the ground cell beside the right door, facing away from the body. Departure undocks, requests deck-rider boarding, supplies interior/roof standing boxes, and stops laying the room. Seat choice and passenger retention are specified in Seats and driver selection.
- Agreement: Accepted
- Basis: [0068](../adr/0068-park-the-camper-with-room-blocks.md) Decision, "The driver departs by pushing the stick from seat 0"; [0068](../adr/0068-park-the-camper-with-room-blocks.md) Decision, "players without a seat are left standing instead of being moved into it."
- Implementation: `src/domain/vehicle/kinds/camper/drive.ts`; `src/domain/vehicle/kinds/camper/roomCells.ts`; `src/domain/vehicle/kinds/camper/storagePlates.ts`; `src/domain/vehicle/kinds/camper/decorCells.ts`; `src/domain/vehicle/motion/dock.ts`; `packs/yasu_ride_rp/texts/en_US.lang`
- Verification: `tests/domain/vehicle/kinds/camper/parking.test.ts` "departs on the stick press, undocks before properties, and boards deck riders", "checks both exit cells before parking and leaves overflow standing when the exit later blocks"; `tests/domain/vehicle/kinds/camper/dooredStorageDeparture.test.ts` "reads the inside plate cells between the slot and exit cells on departure, and leaves only with air or the door's own plate there (ADR 0121)". Not verified: overflow movement and departure with real players on clients in this revision.

### Bumper stand-in lift

- Applies to: Camper stand-in pose each tick, driving and parked.
- Rule: `CAMPER_PROFILE.standIn.maxLift` uses `CAMPER_SPEC.bumperMaxLift`, and its parked cap uses `CAMPER_SPEC.bumperParkedMaxLift`. `Vehicle.standIn` builds the pose from the hold pose while parked or the current location while driving. `liftStandIn` counts consecutive solid layers from the middle box’s feet, stopping at the first open layer or the cap. Held poses use the smaller of the normal and parked caps so dock wall cells do not lift it into the wall. Plants without collision do not lift it. Stand-in entity construction and lifecycle are outside this topic.
- Agreement: Proposed
- Basis: [0119](../adr/0119-park-the-camper-over-natural-ground.md) Decision, "Each tick, `liftStandIn` raises the stand-in by the number of solid layers, counted from its feet up, in its middle box's cell, at most `maxLift`."
- Implementation: `src/domain/vehicle/standIn.ts`; `src/domain/vehicle/vehicle.ts`; `src/domain/vehicle/kinds/camper/profile.ts`; `src/domain/vehicle/kinds/camper/spec.ts`
- Verification: `tests/domain/vehicle/standIn.test.ts` "rises by the solid layers counted from the feet up, never past maxLift, and reads no layer past the first open one"; `tests/domain/vehicle/vehicleStandIn.test.ts` "rises out of solid ground in the bumper's middle cell while driving, at most maxLift blocks, but not over plants (ADR 0119)", "rises out of ground in the wall foot while parked, but not into the front end wall above it (ADR 0119)". Not verified: 0119’s required iPad check of bumper boarding on a rise and flat grass.

### Camper companion maps and interior finishes

- Applies to: Camper atlas generation and client texture sets.
- Rule: All four lit/mirror companion maps and `camper_interior_mer.png` use `Layout.size`. Lamp masks resolve lens, marker_amber, marker_red, dome and glow through the registered `base` origin; only these lit MER texels are `(0,255,255)`. The mirror mask resolves the nested 16 x 32 `mirror_chrome` tile through that origin; only its mirror MER texels are `(255,0,26)`. Other companion MER texels are `(0,0,255)`. Interior MER follows region materials and the mixed base's semantic swatch/hardware tables in ADR 0193, with G = 0 and alpha 255 everywhere, including unused space. Metals use roughness 60 by material and 50-80 by palette, lacquer 80-90, vinyl 175-190, wood 150-160, fabric 235-245, carpet 250, tile 80, stone/dark lacquer 85, and instrument glass 65. The mirror tile retains roughness 26. The 1.16.100 `camper.texture_set.json` binds colour `camper` to `camper_interior_mer`; the existing `Texture.default` / `entity` base pass permits this without changes to lit, glow or mirror materials, visibility or switches. Without Vibrant Visuals, interior surfaces keep diffuse colour and mirrors keep their baked gradient; lamps retain legacy alpha-mask glow. No normal or height map is generated.
- Agreement: Proposed
- Basis: [0147](../adr/0147-light-the-lamps-with-a-pbr-emissive-layer.md), [0197](../adr/0197-emit-camper-hover-particles-below-the-discs.md), [0234](../adr/0234-plated-camper-mirrors-and-a-simpler-camper-exterior.md), [0190](../adr/0190-ribbed-camper-shell-atlas.md), [0193](../adr/0193-shared-texture-tooling.md).
- Implementation: `tools/camper_mer.py`; `tools/lit_textures.py`; `tools/mer.py`; `tools/gen_camper.py`; `packs/yasu_ride_rp/textures/entity/yasu_ride/camper.texture_set.json`.
- Verification: `tests/tools/mer.test.ts` exercises shifted region origins, exact material values, bounded lamp/mirror masks, hardware, gutters and opaque zero-emission interiors. `tests/packs/litTextures.test.ts` and `tests/packs/camperGlow.test.ts` check dimensions, texture-set binding and unchanged switched-pass contracts. Client highlights and diffuse fallback are not verifiable offline; no device acceptance is claimed.

## Open issues

- ADR 0067 says the model has about 3,400 cubes; the implementation has 10,829 cubes (`packs/yasu_ride_rp/models/entity/yasu_ride/camper.geo.json`); the ADR needs an edit or a superseding ADR.
- ADR 0067 says placement requires 9 x 9 x 4 clear cells; the implementation uses `CAMPER_PROFILE.placement` for 3 x 3 x 4 (`src/domain/vehicle/kinds/camper/profile.ts`), following Proposed ADR 0143. ADR 0143 says it supersedes this clearance but records only an Extends relation; the ADR needs an edit or a superseding ADR.
- ADR 0067 says there are three body-long hitboxes, and ADR 0068 says the only hitbox is one bumper cube; the implementation has a hidden feet-level box and separate bumper stand-ins (`packs/yasu_ride_bp/entities/yasu_ride/camper.se.json`, `src/domain/vehicle/kinds/camper/profile.ts`). Accepted ADR 0084 partly supersedes 0068, but Proposed ADR 0116 replaces those bumper boxes; the ADRs need an edit or a superseding ADR.
- ADR 0067 says the driver is on the left; the implementation is right-hand drive (`tools/gen_camper.py`, `src/domain/vehicle/kinds/camper/profile.ts`), following Accepted ADR 0069; the ADR needs an edit or a superseding ADR. Current rider layout and later height changes are covered by Seats and driver selection.
- ADR 0119 says `camper_park_grass` expects 104 laid room cells; the implementation expects `ROOM_CELL_COUNT - 1`, currently 106 (`src/test-pack/scenarios/camper.ts`); the ADR needs an edit or a superseding ADR.
- ADR 0068 says the room is 103 cells; the implementation returns 107, while its docstring still says 105 (`src/domain/vehicle/kinds/camper/roomCells.ts`, `tests/domain/vehicle/kinds/camper/room.test.ts`); the ADR needs an edit or a superseding ADR.
- ADR 0068 says parking checks 103 room, 42 interior, 21 roof, and two exit cells (168 in total); the implementation still checks 168 unique cells, but they are 107 room cells, 45 cargo cells, two exit cells, and 14 slot and inside storage-plate cells (`src/domain/vehicle/kinds/camper/groundCheck.ts`, `src/domain/vehicle/kinds/camper/storagePlates.ts`, `tests/domain/vehicle/kinds/camper/room.test.ts`); the ADR needs an edit or a superseding ADR.
- ADR 0068 says departure reads 63 interior and roof cells plus two exit cells (65 in total); the implementation reads the 45 cargo cells, the slot cells, the inside storage-plate cells, and the two exit cells, and accepts a camper's own furniture, decor, and plate blocks in the slot and plate cells (`src/domain/vehicle/kinds/camper/drive.ts`, `src/domain/vehicle/kinds/camper/storagePlates.ts`, `src/domain/vehicle/kinds/camper/decorCells.ts`, `src/domain/vehicle/kinds/camper/roomCells.ts`); the ADR needs an edit or a superseding ADR.
- ADR 0068 says parking requires air or listed decorations and refuses a slab or anything built in the room; the implementation also preserves `NATURAL_GROUND` in designated ground cells (`src/domain/vehicle/kinds/camper/groundCheck.ts`), following Proposed ADR 0119; the ADR needs an edit or a superseding ADR.
- ADR 0068 says pose y uses `ceil(y - 0.01)` near a cell top and describes snow keeping `floor(y + 0.01)` unless near that top; the implementation uses `ceil(y)` when the feet fraction reaches `LOW_GROUND_THRESHOLD`, with no epsilon subtraction on that branch (`src/domain/vehicle/kinds/camper/parkPose.ts`); the ADR needs an edit or a superseding ADR.
- ADR 0068 says an unlaid restored room redoes the park check and clear; the implementation deliberately clears decorations even if new blockers would fail the check, keeps the camper parked, and lays immediately (`src/domain/vehicle/kinds/camper/drive.ts`, `src/domain/vehicle/kinds/camper/groundCheck.ts`); the ADR needs an edit or a superseding ADR.
- ADR 0091 says body glass includes corner glass; the implementation has removed it (`tools/gen_camper.py`, `packs/yasu_ride_rp/models/entity/yasu_ride/camper.geo.json`), following Proposed ADR 0199; the ADR needs an edit or a superseding ADR.
- ADR 0146 says the vent is crossed mesh in an 8 x 8 opening using existing swatches; the implementation uses the larger louvred lid from Proposed ADR 0157 and atlas hardware from Proposed ADR 0190 (`tools/gen_camper.py`); the ADR needs an edit or a superseding ADR.
- ADR 0157 says the panel is white, six steel screw heads are cubes, and the existing one-row palette and textures remain unchanged; the implementation uses a beige panel, an aluminium upper rail with atlas screws, and taller atlases (`tools/gen_camper.py`, `tools/camper_atlas.py`), as its Consequences notes for 0190 but without a superseding metadata relation; the ADR needs an edit or a superseding ADR.
- ADR 0145 says Resource Pack 0.1.126, ADR 0146 says 0.1.127, ADR 0157 says 0.1.139, and ADR 0199 says 0.1.225; the implementation manifest is 0.1.322 (`packs/yasu_ride_rp/manifest.json`); the ADRs need an edit or a superseding ADR to distinguish historical bumps from current requirements.
- Accepted ADRs 0067 and 0091 remain Accepted despite front geometry and corner glass being replaced only by Proposed ADR 0199. Accepted ADRs 0068 and 0084 likewise remain Accepted while their entity hitboxes are replaced by Proposed ADR 0116. They are not marked as fully superseded; only partial outgoing relations exist (`docs/adr/README.md`). The implementation follows the newer geometry and stand-in code (`tools/gen_camper.py`, `src/domain/vehicle/kinds/camper/profile.ts`); the ADRs need an edit or a superseding ADR that records agreement for those replacements.
- ADRs 0119, 0143, 0145, 0146, 0157, 0190, and 0199 remain Proposed. Their code and assets exist (`src/domain/vehicle/kinds/camper`, `tools/gen_camper.py`), but the required iPad check, owner decisions, PC/mobile appearance checks, and client shimmer check are not recorded as passed; manual rows C161–C164 have empty results (`docs/manual-test.md`). Acceptance remains unresolved.
