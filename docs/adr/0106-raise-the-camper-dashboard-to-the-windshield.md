# 0106. Raise the camper dashboard to the windshield

- Status: Accepted
- Date: 2026-10-22
- Supersedes in part: [0093](0093-decorate-the-parked-camper.md): the dashboard cells and the rows of `dashboard_center` and `dashboard_left` in its slot table

## Context

The camper's padded dashboard topped out at 28.6 px, and its instrument console sat from 17.4 to 25.4 px. The windshield's lower frame is at 36 px. In the play test on 2026-10-22 the owner saw a wide gap between the dash top and the windshield from the driver's seat and asked for the dashboard to meet the bottom of the windshield (#422).

0093 put the dashboard in the cells (-1, 3, 1), (0, 3, 1), and (1, 3, 1), with `dashboard_center` and `dashboard_left` at height 13 in layer 1: the pad top at 28.6 px is 12.6 px above the layer-1 bottom (16 px). A pad top above 32 px is in layer 2, and a decor slot's height must be 0 to 15 px above its own cell's bottom (0093, 0097).

## Decision

- The dashboard is built by `tools/camper_dash.py` through `build_dash(registry) -> AreaCubes`, replacing the old pad, vertical console, fittings and engine cover. Its frozen `DASH_GEOMETRY` descriptor exposes `face_origin`, `face_normal`, `shelf_y`, `column_entry` and `chin_line` so tests and later cab work can use the same reference geometry.
- The instrument face starts at the windshield-sill line at y 35 and runs toward the driver and down at about 32.75 degrees below horizontal, with its outward normal about 57 degrees above horizontal. The face is about 5 px long. Gauges, switches, ignition, radio, glovebox follow this plane within 0.5 degrees; the lower pair and its chrome bracket tilt 35 degrees toward the driver. The six-button cluster and lower pair move 3 px toward the wheel.
- A flat green shelf at y 35 fills the space between the windshield-base V and the face: 6.26 px deep at the centre and 3 px at the edges. The white bonnet stays unchanged, with no green extending forward of its windshield base. A solid green dash mass fills the space forward of the face. Below the face, a short vertical edge meets a chin running down and forward at 60 degrees above the floor. The driver's footwell stays open; 13 closing cubes join the passenger end to the side wall. Core tops end at y 34.89999, below the shelf, to prevent a dark triangle showing through it. The visible dash mass uses the original green palette.
- Six atlas regions belong to the `cab` area: `cab SPEED` and `cab QUAD` (128 x 128 each, `glass_coat`), `cab PAD` (184 x 48, `vinyl`), `cab RADIO` (144 x 40, `metal`), `cab SMALL` (128 x 60, `glass_coat`) and `cab DARK19` (1 x 1, `dark_lacquer`). Their UV origins come from the registry rather than fixed atlas coordinates.
- The pedals, door trims, seats, steering wheel and column retain their existing geometry. The steering bone retains its pivot and 65-degree lean (0070); the dashboard exposes its column entry without adopting the later reference wheel or gear lever.
- The dashboard's cells move to layer 2: (-1, 3, 2), (0, 3, 2), and (1, 3, 2). `dashboard_center` is at (0, 3, 2) and `dashboard_left` at (1, 3, 2), both at height 3. The slot ids do not change, so saved decor keeps its spot
- The dashboard still lays no room block, so the furniture block (0097) in each free dashboard slot now covers the bottom 3 px of its layer-2 cell. The dashboard's right cell still gets none

## Consequences

- The dash shelf stays 1 px below the windshield's lower frame. The front seats do not move, so a seated player's eyes stay where 0070 put them, over the windshield's lower frame at 36 px and so over the 35 px shelf. A script cannot read that eye height (0070), so the view is checked by hand
- The cells (0, 3, 1) and (1, 3, 1) become cargo cells and (0, 3, 2) and (1, 3, 2) become slot cells. The departure check still reads 49 cargo cells, 10 slot cells, and 2 exit cells, and the park check still reads 168 cells. A block placed in a layer-1 cell under the dash top, inside the model, keeps the camper parked until it is removed
- A camper parked across the update lays its room again with the new cells, and the dock clears the furniture and decor blocks left in the old layer-1 cells, because they are among the laid cells saved on the entity (0068)
- Dashboard decor ids, cells, heights, spot offsets and acceptance rules remain unchanged in this dashboard port. The narrower shelf does not establish that every standing item fits at those existing spots. Fit, offsets and any acceptance changes require a separate follow-up; check the catalogue against the shelf, windshield and cab hardware before claiming clearance. Press targeting from both front seats and the aisle also requires a device check
- The camper model changes, so the Resource Pack version goes up (0015)
