# Scooter underbody and running gear detail

## Intent

Raise the fidelity of the scooter's lower body so it matches the reference photos and wireframes of the Vespa source model more closely. The goal is better README previews (`docs/images/scooter-*.png`) and a better look when a player stands close to the scooter in game. Colours stay as they are today: ivory paint, white tyre walls, brown seat, chrome and cast-metal finishes. Only shapes, proportions and surface detail change.

## Goals

Four areas, built in this order, each reviewed on a rendered preview before the next starts:

1. **Underbody: engine casing and exhaust.** A large black pressed-steel muffler hanging under the floor on the right, with the exhaust pipe bending from the engine to the muffler, the engine casing with its fan cover and fins, and the rear swing arm and mount. Reference: close-ups of the front-right underside (real and wireframe).
2. **Floor board.** The running board's chrome edge strips and the dark rubber grooves between them, seen from above and from the side, with the board's front curl and rear tab at the reference proportions. Reference: the top-left floor pattern photo.
3. **Wheels.** Hub with a centre nut and hex nuts, rim ring with small screws, bead and dish, and a block tread on the tyre that reads as a pattern at close range. Both wheels, front and rear. Reference: front-left and back-left wheel close-ups.
4. **Centre stand.** Leg, cross bar, pivot and foot pad at the reference proportions.

## Non-goals

- No colour change and no new paint regions. All 16 dye variants keep working and chrome, rubber, whitewalls, leather and lenses keep their finishes.
- No change to the bone contract, collision box, driving, flight fold, struts or sounds.
- The body shell, shield, headlight, seat and rear lamp are not touched.

## Anti-goals

- Visible regressions in the road silhouette, the flat-wheel fold animation, strut behaviour (`scooterStrut*` tests) or the rider seat positions.
- Model density that makes the scooter noticeably slower to render or load. This is why each area is reviewed separately.

## Constraints

- The wheel revision must stay within `CUBE_BUDGET_CEILING = 6000`. The area allocations total 5,635 cubes, including 2,660 reserved for running gear (2,647 used). Keep the guard and record the measured counts in the specs, ADR and tests.
- Follow AGENTS.md: generated pack files come from the generator (`pnpm model`), Resource Pack manifest version is bumped when tracked Resource Pack files change, the previews are regenerated and committed, and `pnpm model:check`, lint, typecheck and tests pass. Everything committed is in English.
- The fold animation drops each wheel and hub; new wheel and hub detail must stay inside the existing fold and strut ancestry rules (`tests/packs/scooterModel.test.ts`).
- Underbody parts that sit near the rear wheel must keep clear of the rear tyre and the fold drop.

## Approaches considered

- **A. Geometry only.** Every detail as cubes. Best close-up and preview look, but the largest cube increase and the heaviest model.
- **B. Texture only.** Keep the shape and paint the detail. Light, but flat at close range, and it cannot reproduce the thick muffler or raised floor strips.
- **C. Mixed (chosen).** Cubes for what defines the outline or thickness: muffler, exhaust pipe, floor strips and grooves, hex nuts, tread blocks, stand parts. Textures for what is fine: screws, markings, rubber texture, panel seams. Roughly half of A's cube growth while still reading well up close.

## Decisions made with the user

- Mixed approach (C).
- Cube count is not a limit; the ceiling is raised, not removed.
- Preview and close-range in-game viewing are the targets; flight from below is not.

## References

The reference images are local files of the Vespa source model, kept outside the repository (third-party renders, not committed) in `~/Downloads/`:

- Underbody and exhaust: `vespa_front_right_bottom_exhaust.png`, `vespa_front_right_bottom_exhaust_closeup.png`, `vespa_front_right_bottom_exhaust_closeup_real.png`
- Whole lower body: `vespa_left_bottom_part_sample_real.png`, `vespa_left_bottom_part_sample_wireframe.png`, `vespa_left_bottom_closeup.png`
- Floor: `vespa_top_left_floor_panel_pattern.png`
- Wheels: `vespa_front_left_bottom_wheel_closeup.png`, `vespa_front_left_bottom_wheel_closeup_real.png`, `vespa_front_right_wheel_detail.png`, `vespa_back_left_wheel_detail_wireframe.png`

Acceptance is "matches these photos in proportion and detail layout", judged on a rendered preview. Colours come from the current model, not from the orange reference.

## Calls made by the author (open to correction)

- **Delivery:** one pull request per area, in the order above. Each carries its own preview images, spec and ADR updates, and manifest bump. The user reviews each pull request; the builder also checks its preview against the references first.
- **Size target:** total stays under about 6,000 cubes, and the generated model JSON must not more than double in size. Check both after each area and stop to ask if a area would exceed them. Use texture for the tread if block geometry would blow the target.
- **Bones:** no new bones. New parts are cubes under existing bones. The muffler, exhaust pipe, engine detail, floor strips and stand parts attach to `body` (stand parts to `stand`). Wheel and hub detail attaches to the existing wheel and fold bones and rolls with the wheel as today. Nothing new goes under the strut bones.
- **Extent:** new underbody parts stay inside the model's current overall bounds: not below model y 0, and not wider than the current widest non-mirror point. The collision box and footprint stay as they are.
- **Colours:** reuse existing finish regions. Black muffler and pipe use `engine_steel` and `engine_fin`; rubber grooves use the existing rubber finish; chrome strips use `chrome`. No new paint region.
- **Previews:** keep the existing five `scooter-*.png` names and add new underbody and wheel close-up angles as new files, linked from the README.

## Left to the builder

- Exact dimensions and which module each part lives in (extend `scooter_engine.py`, `scooter_running.py`, `scooter_body.py` for the floor, or add a module per area).
- Texture sizes and how much of each part is cubes versus texture.
- The new cube budget numbers, chosen from the measured result after each area.
- Whether the previews need new camera angles to show the underbody and floor.
- Updating the affected spec text (`scooter.md`, `model-and-previews.md`) and ADR 0251 in the same change.

## Wheel revision for issue #1918

Both wheels retain white tyre walls, beige discs and chrome dishes. Three raised chrome hex nuts at 120-degree intervals share one bolt circle on each exposed negative-x face, opposite the fork and spring. Each prism has one plain hexagonal cutout face, without crossed reflection bands. A smaller round dark centre cap rises from a polished washer step and carries a small nut. Six small round screw heads are textured evenly around the outer flange. A geometric mid-ring step on the exposed negative-x face, clear of the fixed suspension, separates the flange from the raised inner hub plate; thin 64-segment polished bead lips use consistent shading. Three crown columns and two shoulder columns have 64 equally spaced shallow blocks each, over a smooth 64-segment tyre skin with narrow recessed grooves. Every tread corner remains within the original 4.3 px rolling radius; rear radial and hardware dimensions scale by 0.96. No bones, paint regions or material types are added, and roll and fold retain their clearance. Each running wheel assembly contains 1,253 cubes; each wheel bone contains 1,256 including its disc and hub plates. The running allocation is 2,660 (2,647 used); total allocation is 5,635 under the 6,000 ceiling. Front-left and rear-left close-ups show the hardware on both wheels.

The revised mixed approach uses six-sided prism walls with a single flat hexagonal texture face for each nut, rather than overlapping rotated rectangles. Fine shallow blocks and a nearly full-radius carcass keep the tyre round. The bead uses a thin polished profile with constant shading to avoid serrated highlights. The dish has a mid ring at x 1.26 and an inner plate at x 1.4, above the flange at x 1.15; the separate offsets remain visible from oblique views.
