# SUV shape: reproduce the reference Wrangler Rubicon

## Intent

The owner wants the SUV body to match the shape of the reference vehicle (a lifted four-door Wrangler Rubicon) as closely as the Bedrock model allows. The owner's words: the overall shape is what differs most from the photos today. The goal is a recognisable, high-accuracy silhouette plus the vehicle's characteristic parts, with a sheet-metal look rather than a stack of blocks.

## Reference material

19 images in the owner's `~/Downloads/suv/` (outside the repository; the owner supplies them). Names: `rubicon_{front,left_front,left_front_top,left_front_top2,left_back_top,left_side,left_side2,right_front,right_front_top,right_back,right_back_side,right_back_tia,front_tia,front_top}.png` plus five blueprints (`rubicon_front_blueprint.png`, `rubicon_left_front_blueprint.png`, `rubicon_left_back_blueprint.pnt.png`, `rubicon_left_side_top_blueprint.png`, `rubicon_right_side_blueprint.png`). Blueprints are the source for dimensions; the renders are the source for form. The photos are not committed; the builder records the measured ratios in the new ADR and in `tools/suv_proportions.py`.

## Goals

1. Match the whole-body massing: overall height, ride height and tyre diameter, wheelbase and overhangs, hood height and length against the cabin, belt line, windshield rake, roof.
2. Match the characteristic parts, at the Bedrock model's resolution:
   - the hood air scoop,
   - squared, pronounced fender flares,
   - the front bumper with a winch,
   - side steps (rock rails).
3. Build body surfaces from panels (`tools/panels.py`, ADR 0169) instead of plain stacked cubes where that improves the form, so the body reads as sheet metal.
4. Show a metallic look on the owner's device. The owner plays on an iPad with Vibrant Visuals available, so the existing MER material (`tools/suv_material.py`: body metalness 110, roughness 60; chrome 230 / 40) may carry the metal feel. Baked highlights and panel lines in the texture are a supplement, not the main route.
5. Update every value tied to the body size in the same work: collision box, seat positions and height, placement clearance, `SUV_SPEC`, `SIZE_SCALE` use, the enclosing probes (`bodyFront`, `bodyHalfWidth`, `footprint`, `carHeight`), and the 13 side-view proportion targets in `tools/suv_proportions.py`. The owner explicitly allows this.

## Non-goals and anti-goals

- Keep the grille at eight slots, with no logo, no vehicle name and no "Jeep" or "RUBICON" lettering (AGENTS.md, ADR 0009). The photos show a seven-slot grille and badges; do not copy them. This outranks shape fidelity.
- Paint colour and texture palette stay as they are (the current sand colour). Only form changes. The reference photos are blue-grey; do not recolour.
- No change to driving behaviour (script-driven movement, ADR 0002) beyond the constants that must follow the new body size.
- Not a goal: reproducing details the voxel resolution cannot show. Approximate them with the nearest larger form and report the residual.
- Anti-goal: tuning to look right in one image while another angle gets worse. Every angle counts.

## Process the owner asked for

Compare the model with the photos at all angles, three rounds at most:

1. Round 1: render the model at the angle of each photo, list the differences, fix them.
2. Round 2: compare again at all angles, fix what remains.
3. Round 3: compare again and only report the remaining differences. No fixes in this round.

`tools/render_preview.py` renders the model (view directions are vectors); a throwaway script may render arbitrary angles to match the photos. Keep comparison images out of the repository (scratch directory) unless the owner asks.

## Constraints

- Follow AGENTS.md. Notably: stable Script API only; layer and feature boundaries; per-kind values in `kinds/suv/spec.ts` and `tools/suv_dims.py`, no magic numbers; do not reuse SUV constants for other vehicles.
- Everything committed is in English. Commit messages are a single imperative line, no body or trailers. PR titles and bodies are in English.
- Changing the body outline means re-deriving the enclosing probes, reviewing the collision box, seats and placement clearance (spec `docs/specs/suv-body.md`, ADRs 0170, 0194, 0196). The roof margin above `carHeight` must not silently grow (ADR 0170).
- The change goes against Accepted decisions in places (collision box 1.8x1.6 in ADR 0009, seat heights in 0029 and 0117, partly superseded by Proposed ADRs 0170, 0194, 0196). Add a new ADR for the new geometry and the new size anchor rather than rewriting an Accepted Decision. Update `docs/specs/suv-body.md` in the same pull request and list differences in its Open issues.
- Bedrock gotchas: bump the Resource Pack manifest version for any Resource Pack change (ADR 0015); entity and Resource Pack changes need a server restart; keep every pack path within 80 characters; keep the model contract (bones `root`, `body`, `wheel_*`, `door_*`, `seat_0`-`seat_3`, locator `exhaust`, lamp bones) and the model tests passing, including head clearance checks, which must not be relaxed to fit.
- Verification before calling it done: `pnpm lint`, `pnpm lint:lang`, `pnpm lint:docs`, `pnpm lint:unused`, `pnpm lint:deps`, `pnpm typecheck`, `pnpm test`, then `pnpm build`, restart the dev BDS and `pnpm test:game` when Docker is available. `pnpm model` regenerates models, previews in `docs/images` and icons; `pnpm model:check` must pass.

## Decided by the owner

- Scope covers both the whole-body massing and the four characteristic parts above.
- Body size values (collision box, seats and so on) may be updated.
- Panels for the body, and a metallic look.
- Vibrant Visuals on an iPad is the target for the material.
- Grille, no logo and no recolouring, as above.

- Fidelity outranks size limits. Placement clearance may grow past 3x3x3 cells and in-game scenarios may need rework; accept that fallout and report it.
- When the reference form conflicts with the roof height, windshield rake, seat height or head-clearance tests (ADRs 0170, 0194, 0196), keep the tests and ride comfort, approximate the form, and list the difference in the round 3 report.
- After round 3, open the pull requests with the remaining differences written in the description. Do not wait for owner review first.
- Finish by creating a test branch that merges all the pull requests, so the owner can run it on the dev BDS and check it in game (iPad). This branch is for verification only and is not merged.

## Calls made by the writer (not the owner's words)

- New bones and locators may be added for the new parts. The existing bone contract, lamp bones and model tests stay. Door geometry may change, but each hinge pivot stays at the door's front edge (ADR 0009).
- MER value changes ship in a separate pull request, after the owner checks the metal look on the iPad. Baked highlights and panel lines in the texture count as form and may ship with the shape work, as long as the palette colours do not change.
- The builder audits every consumer of `tools/suv_dims.py` and `SUV_SPEC` (item previews, pack icons, paint, dock and fleet placement, in-game scenarios) and updates what depends on the body size.
- The rounds are judged by the builder against the photos; the owner reviews the pull requests and the verification branch.

## Left to the builder

- How to split the work into pull requests (a size-and-proportion pass first, then the parts, then material is a natural order, but not required; the repository wants each pull request to keep the tests green).
- The new size anchor and `SIZE_SCALE` value, and the new measured targets, derived from the blueprints.
- Which parts use panels and which stay cubes; how panel seams are laid out.
- How to render comparison angles.
- The wording and numbering of the new ADR.

## Open risks

- A taller, larger-tyred body raises the collision box and placement clearance. Placement clearance may grow beyond 3x3x3 cells, which affects where the SUV can be placed and its in-game tests; the builder should check and report.
- Seat height and head clearance interact with the roof height and windshield rake; the existing model tests encode this.
- MER metalness cannot be checked by the renderer script; judge it in game on the iPad.
