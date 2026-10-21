# 0105. Raise the camper dashboard to the windshield

- Status: Accepted
- Date: 2026-10-22
- Supersedes in part: 0093 (the dashboard cells and the rows of `dashboard_center` and `dashboard_left` in its slot table)

## Context

The camper's padded dashboard topped out at 28.6 px, and its instrument console sat from 17.4 to 25.4 px. The windshield's lower frame is at 36 px. In the play test on 2026-10-22 the owner saw a wide gap between the dash top and the windshield from the driver's seat and asked for the dashboard to meet the bottom of the windshield (#422).

0093 put the dashboard in the cells (-1, 3, 1), (0, 3, 1), and (1, 3, 1), with `dashboard_center` and `dashboard_left` at height 13 in layer 1: the pad top at 28.6 px is 12.6 px above the layer-1 bottom (16 px). A pad top above 32 px is in layer 2, and a decor slot's height must be 0 to 15 px above its own cell's bottom (0093, 0097).

## Decision

- The model lifts the dashboard and everything on its rear face and top by one constant, `DASH_RISE` = 6.4 px in `tools/gen_camper.py`: the pad, its rounded rear edge and dark strip, the instrument console with its panel, gauges, lamps, rockers, round controls, ignition switch, and levers, the speaker grille, the center knobs, the radio, the glovebox lid, the round air vent on the dash top, and the defroster vent. The pad top is at 35 px, 1 px under the windshield's lower frame, so the frame stays in sight. The dash body still reaches the floor and now tops out at 33.4 px
- The engine cover, the pedals, the door trims, the seats, and the steering wheel stay where they are. The steering column still ends 0.4 px inside the dash body, now below the console instead of on the instrument panel
- The dashboard's cells move to layer 2: (-1, 3, 2), (0, 3, 2), and (1, 3, 2). `dashboard_center` is at (0, 3, 2) and `dashboard_left` at (1, 3, 2), both at height 3. The slot ids do not change, so saved decor keeps its spot
- The dashboard still lays no room block, so the furniture block (0097) in each free dashboard slot now covers the bottom 3 px of its layer-2 cell. The dashboard's right cell still gets none

## Consequences

- From the driver's seat the dash top meets the bottom of the windshield. A seated driver's eyes are well above the pad (0070), so the view of the windshield's lower frame is kept
- The cells (0, 3, 1) and (1, 3, 1) become cargo cells and (0, 3, 2) and (1, 3, 2) become slot cells. The departure check still reads 49 cargo cells, 10 slot cells, and 2 exit cells, and the park check still reads 168 cells. A block placed in a layer-1 cell under the dash top, inside the model, keeps the camper parked until it is removed
- A camper parked across the update lays its room again with the new cells, and the dock clears the furniture blocks left in the old layer-1 cells, because they are among the laid cells saved on the entity (0068)
- The furniture block of a free dashboard slot is only 3 px high, so a press aimed at the dash's rear face below the top passes into the room and reaches the floor. Gear held then goes to the nearest free slot to the hit point, usually the dashboard. Check in game that a press on the dash top from the driver's and the passenger's seat places the item there
- The camper model changes, so the Resource Pack version goes up (0015)
