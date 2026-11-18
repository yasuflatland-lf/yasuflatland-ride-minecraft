# Build shape menu: edit verbs first, shapes in a submenu

## Intent

The shape menu shown after the end point has up to 13 flat entries that mix edit verbs (Cut, Remove above, Copy, Fill below, Rotate) with shape nouns (Fill, Frame, roofs, cylinder, sphere, cube). The owner finds Cut, Copy, Remove above and Undo the clumsiest build operations. Group the verbs at the top level in the owner's order and move the shapes into one submenu.

## Goals

- Top-level shape menu, in this order: Cut, Remove above, Build shape ▸, Rotate box, Copy, Fill below, Cancel.
- Build shape ▸ opens a second menu with the entries `stylesFor(shape)` and the roof/solid extras give today (Place, Fill, Frame, Faces, Walls, gable, hip, cylinder, sideways cylinder, sphere, cube), plus Back.
- Undo keeps covering Cut, every shape or roof or solid build, and Rotate (one snapshot per tap). No Undo behavior change.
- Rename the menu Rotate entry to "Rotate box" so it differs from the Paste Rotate item (clipboard).

## Non-goals

- Making Remove above undoable. The owner has never needed it; it keeps its confirmation form and "cannot be undone" text.
- New items for Copy, Cut or Undo.
- Changing the height step, contents menu, paste aiming, or rotate mode.

## Anti-goals

- A flow where a shape takes more than one extra tap beyond today's, or where Cancel loses its meaning (back to end-point selection with the preview).

## Constraints

- `ActionFormData` only: flat buttons, no sections.
- Domain stays engine-free; the menu is derived in `src/domain/build/flow/menu.ts`, dispatched by `src/infrastructure/build/bedrock/buildMenus.ts` and `menuChoices.ts`.
- A dispatched choice must still be offered by the current flow (one lock spans nested forms).
- Per AGENTS.md: update `docs/specs/build-tools.md` ("Shape derivation and shape menus", "Shape and height menus") and the owning ADR text in the same pull request; both locales' `yasu_build.form.*` keys must stay in sync (`tests/infrastructure/build/identifiers.test.ts`).

## Approaches considered

- A. Two-level shape menu (chosen by the owner, with the order above). Small, reversible, keeps the auto-open flow. Costs one extra tap for building a shape.
- B. Dedicated Copy/Cut/Undo items. Fastest, but fills the hotbar and Cut would run without a menu.
- C. Move edit verbs into the idle utility menu. Cleanest concept, but adds an air press per Cut and changes the auto-open flow.

## Decisions

Owner's: approach A; the top-level order above; Undo covers Cut, shape builds and Rotate.

My calls (please check):

1. A line has only Place, so the top level shows "Place" directly and no submenu.
2. Dismissing the submenu or choosing Back returns to the top-level shape menu. Dismissing or Cancelling the top level keeps today's meaning (back to end-point selection).
3. Remove the Undo entry from the paste menu so Undo lives in the Build Undo item and the utility menu only. The owner confirmed this after checking the cost: while pasting, a plain air press opens the paste menu (New copy, End pasting, Cancel), and Undo is then reached with the Build Undo item (switching to it keeps paste aiming) or after End pasting through the utility menu.
4. The paste menu is reachable (`pasteMenu` in `menu.ts`), so the spec sentence "no paste form remains" was stale and was reworded in the same series.

## Left to the builder

- Flow representation of the submenu (a flag on `endpoint` flow or a separate menu id) and its tests.
- Exact English and Japanese wording for "Build shape" and "Back".
- Updating the in-game scenarios that choose shape entries by index.

## Verification

Property and example tests in `tests/domain/build/flow.test.ts` and `tests/infrastructure/build/buildMenus.test.ts` for order, submenu contents per shape, and Back/dismiss. Add one regression test per Undo case (Cut, shape, Rotate). Run `pnpm lint`, `lint:lang`, `lint:docs`, `lint:unused`, `lint:deps`, `typecheck`, `test`, then `build` and `test:game` on the dev BDS.

## Implementation

Tracked as issues #1957 to #1961 and implemented as stacked pull requests, each based on the previous one except 1/5:

| Order | Issue | PR    | Content                                                                  |
| ----- | ----- | ----- | ------------------------------------------------------------------------ |
| 1/5   | #1957 | #1963 | Undo coverage tests for Cut, shape builds and box Rotate                 |
| 2/5   | #1958 | #1962 | Split menu entries into edit and build groups, no behavior change        |
| 3/5   | #1959 | #1964 | Submenu in the flow, domain menus and use cases                          |
| 4/5   | #1960 | #1965 | Two-level forms in the Bedrock adapter, lang keys, Resource Pack version |
| 5/5   | #1961 | #1966 | Paste menu without Undo                                                  |

Final top-level shape menu: Cut, Remove above, Build shape, Rotate box, Copy, Fill below, Cancel (a line shows Place instead of Build shape). Undo covers Cut, every shape, roof and solid build, and box Rotate; Remove above and Copy stay out of the history.
