# Camping gear reference spike

A throwaway browser viewer used to agree on the shapes of the camper's camping gear with the owner before any model is generated. It is the geometry reference for the precise camping gear series. It is not part of the build, the packs, or the tests.

The viewer was derived from the local resort bathroom spike, which is not tracked in this repository.

## Run it

```sh
cd spike/camping-gear
python3 -m http.server 8124
```

Open `http://127.0.0.1:8124/index.html#<id>`, for example `#percolator`. Three.js is loaded from a CDN, so the page needs network access. The Front, Back, Left, Right, Top, and 3/4 buttons set the camera, and the Overlay slider blends the matching reference photo over the model.

## Reference photos

The owner's product photos are not tracked: `ref/` is listed in `.gitignore`. To see the overlay, put PNG files in `spike/camping-gear/ref/` using the names below (the `refs` list of each entry in `items/manifest.js`).

| Item | Expected files in `ref/` |
| --- | --- |
| percolator | `percolator1`, `percolator2`, `percolator3`, `percolator_front`, `percolator_back`, `percolator_inside`, `percolator_blueprint` |
| enamel_kettle | `enamel_kettle`, `enamel_kettle_top`, `enamel_kettle_closeup`, `enamel_kettle_closeup_top` |
| saucepan | `saucepan` |
| mug_pair | `pair_of_mugs`, `mug_closeup` |
| sugar_pot | `glass_sugar_pot`, `glass_sugar_pot_with_suger`, `glass_sugar_pot_with_suger_side` |
| toaster | `chrome_toaster`, `chrome_toaster_front`, `chrome_toaster_back`, `chrome_toaster_front_closeup`, `chrome_toaster_front_all`, `chrome_toaster_front_with_breads` |
| transistor_radio | `transistor_radio`, `transistor_radio_top`, `transistor_radio_top2` |
| potted_plant | `potted_plant` |
| cactus_pot | `cactus_pot` |
| macrame_planter | `macrame_hanging_planter`, `macrame_hanging_planter_closeup` |

Each name has the extension `.png`. A missing photo only disables its overlay.

## Units and conventions

- Units are Bedrock pixels: 16 px is one block.
- The front of an item is the -z side. The origin is the middle of the base (x, z) and y = 0 is the floor.
- Item sizes (`px` in `items/manifest.js`, width by height) match `tools/camping_gear.json` and stay as they are. Detail comes from thin tilted cubes and alpha-cut textures, not from larger items.
- Only cubes are allowed, because they must ship as Bedrock model cubes: no cylinders or spheres. Round shapes are rings of tilted panels or one textured flat plate. Transparency is on/off, except glass.

## Helpers

`lib.js` exports `makeLib(THREE)`, which returns the helpers every item module receives as `L`. `BRIEF.md` is the brief given to the author of one item.

| Helper | Use |
| --- | --- |
| `box` | An axis-aligned cube between two corners. |
| `panel` | One thin cube, optionally tilted. |
| `loft` | Rings of panels through height steps, with super-ellipse or rounded rectangle cross sections. |
| `tube` | A thin square tube along a polyline, for handles and wires. |
| `texPlate` | A flat plate as one cube, with the outline and holes drawn into an alpha-cut texture. |
| `topOnly`, `roundPost`, `lightDisc` | Textured top faces, round posts, and light discs. |
| `canvasTex` | A canvas texture. Paint highlights into it, because Bedrock entities cannot reflect. |
| `M` | Starter materials such as chrome, dark, and wood. |

## Items

| Item | File | Size (w x h px) | Owner review |
| --- | --- | --- | --- |
| Percolator | `items/percolator.js` | 4 x 7 | Approved |
| Enamel Kettle | `items/enamel_kettle.js` | 5 x 5 | First pass, awaiting owner review |
| Saucepan | `items/saucepan.js` | 6 x 3 | First pass, awaiting owner review |
| Pair of Mugs | `items/mug_pair.js` | 4 x 3 | First pass, awaiting owner review |
| Glass Sugar Pot | `items/sugar_pot.js` | 3 x 4 | First pass, awaiting owner review |
| Chrome Toaster | `items/toaster.js` | 6 x 5 | First pass, awaiting owner review |
| Transistor Radio | `items/transistor_radio.js` | 6 x 4 | First pass, awaiting owner review |
| Potted Plant | `items/potted_plant.js` | 5 x 8 | First pass, awaiting owner review |
| Cactus Pot | `items/cactus_pot.js` | 4 x 7 | First pass, awaiting owner review |
| Macrame Hanging Planter | `items/macrame_planter.js` | 5 x 10 (hanging) | First pass, awaiting owner review |
