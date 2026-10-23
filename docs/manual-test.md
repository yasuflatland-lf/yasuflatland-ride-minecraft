# Manual test

Dev server: `pnpm build && pnpm server:up`. Connect to the Mac's LAN IP address on port 19132.
The server uses NetherNet (0015). Set `BDS_LAN_IP=<address>` if the script finds more than one LAN address. If joins fail, restart it with raknet: `pnpm server:down && BDS_TRANSPORT=raknet pnpm server:up`.
After a Resource Pack or entity definition change, restart with `pnpm server:restart` (not `docker restart`), so the packs are served under a new dev-only version and devices do not show a cached copy (0062).
To use commands, run `docker exec yasuflatland-ride-bds send-command op <player name>`.

| # | Steps | Pass condition | PC | Mobile |
|---|---|---|---|---|
| 1 | At a crafting table, craft the vehicle item from 5 iron ingots, 1 iron block, and 2 coal blocks | An "SUV" item is created | | |
| 2 | Use the item on the ground / use it under a low ceiling | The vehicle appears and the item count drops by one (not in Creative) / no vehicle appears and the item count stays the same | | |
| 3 | Get in, drive, turn, and slide with the handbrake | The vehicle moves where you look and turns right away. The handbrake makes it slide | | |
| 4 | Smoothness of the driver's camera | 3 or higher on a 5-point scale | | |
| 5 | While driving, approach a 1-block and a 2-block step head-on and at an angle, then drive over flowers and carpets | The vehicle climbs both steps without stopping, and does not hop over the flowers or carpets (ADR 0035) | | |
| 6 | Hit a wall at full speed / fall 10 blocks while riding (Survival) | No hearts are lost | | |
| 7 | Hit a pig | The pig takes damage and is pushed aside | | |
| 8 | Get out | The door of the seat you sat in swings outward and a door-open sound plays | | |
| 9 | Exhaust while riding | Smoke comes out of the tip of the rear-right muffler | | |
| 10 | Ride with two players, then the driver gets out | Within a moment the passenger moves to the driver's seat and can drive (ADR 0019) | | |
| 11 | With an empty hand, hit an empty vehicle 3 times / hit an occupied vehicle | It breaks and drops the item / it does not break | | |
| 12 | The moving vehicle as seen by a passenger | 3 or higher on a 5-point scale | | |
| 13 | Appearance (SUV shape, khaki, interior and exterior) | As intended | | |
| 14 | Stop, then hold the stick straight right (mobile) / hold only D (PC) | The vehicle moves slowly forward and turns right; it does not back up | | |
| 15 | Tap (mobile) / left-click (PC) a placed vehicle with green dye, then light blue dye, then brown dye / do it with brown dye again | The body turns green, then light blue, then khaki, one dye is used each time (not in Creative), and the vehicle does not break / nothing changes and the dye stays | | |
| 16 | Craft the headlight switch from a lever and glowstone dust. At night, drive with it in hand and use it (right-click / tap), then use it again | The lamps glow and the road ahead lights up and follows the vehicle; the second use turns both off and leaves no light behind | | |
| 17 | Use the switch from a passenger seat / outside the vehicle | Nothing changes | | |
| 18 | While driving, double-tap Jump | The wheels fold flat, hang out from the body on gunmetal arms, and glow blue underneath, and the vehicle rises about 1.5 blocks (ADR 0043) | | |
| 19 | Fly forward, then hold Jump, then pull the stick back (S on PC) | The vehicle holds its altitude, then climbs, then sinks without backing up (ADR 0032) | | |
| 20 | Fly forward and stop in the air, looking up and down each time | Only the view moves; the vehicle holds its altitude (ADR 0032) | | |
| 21 | Hold Jump to climb about 10 blocks, then double-tap Jump (Survival) | The vehicle sinks slowly, the wheels unfold a few blocks above the ground and are down at touchdown, and no hearts are lost (ADR 0033) | | |
| 22 | Get out while flying | The empty vehicle sinks slowly to the ground and the wheels unfold | | |
| 23 | Tap the handbrake repeatedly while driving on the ground | Note how often the vehicle takes off by accident | | |
| 24 | With an account that has never joined the world (or after `pnpm server:down` and deleting `server/data/worlds/yasuflatland-ride-dev`), join in Survival / leave and join again / die and respawn | One "SUV" item is in the inventory / no second item is given / no second item is given | | |
| 25 | In hover form, turn hard left and right without touching Jump or pulling the stick back | The body banks into the turn and the vehicle sinks slowly while banked (ADR 0026, 0032) | | |
| 26 | In hover form in third person, pull the stick back until the vehicle touches the ground | On touchdown the wheels unfold, the camera returns to first person, and the vehicle drives on the ground again (ADR 0034) | | |
| 27 | Standing outside, tap (mobile) / left-click (PC) a khaki vehicle with red dye, then do it 3 more times | The body turns red and one dye is used (not in Creative); the extra hits change nothing, use no dye, and do not break the vehicle (ADR 0036) | | |
| 28 | Holding a dye, press the ride button (mobile) / right-click (PC) on a vehicle | You get in, the color does not change, and no dye is used (ADR 0036) | | |
| 29 | Player A places 10 SUVs, then an eleventh | A's first SUV disappears without dropping an item (ADR 0066) | | |
| 30 | Player A places a sports boat, then a second one | A's first boat disappears; A's SUVs stay | | |
| 31 | Player A has 10 SUVs; player B places an SUV | None of A's SUVs disappear | | |
| 32 | Player B rides A's oldest SUV while A places an eleventh | B is dismounted and that SUV disappears | | |
| 33 | Player A leaves and rejoins, then places an eleventh SUV | A's oldest SUV from before rejoining disappears (owner id is stable) | | |
| 34 | Drive into deep water, then drive forward underwater | All windows turn sealed blue, and the rear wheels turn backward into ring guards around spinning bronze four-blade propellers with swept blades, each held from the front by a gunmetal arm (ADR 0042, 0043) | | |
| 35 | Board with riders in every seat using different camera views, dive into deep water, then drive onto the shore | Every rider switches to third person on diving and returns to their own previous view on the shore | | |
| 36 | In Survival, stay submerged with riders in every seat for at least 30 seconds, then have a rider get off underwater | No rider loses air while aboard; the rider who gets off starts losing air within about 3 seconds | | |
| 37 | While submerged, hold Jump until the entire body clears the surface | The submarine rises and becomes the hover car once fully out of the water, without becoming a car along the way | | |
| 38 | Drive the submarine onto a beach with one-block steps, then park at the waterline for 2 seconds | It climbs out, becomes a car, and stays in the same form while parked | | |
| 39 | Get out of a submarine in deep water and watch it for at least 10 seconds | The empty submarine rises to its float line and stays at the surface without becoming the hover car | | |
| 40 | Drive into water deep enough for the submarine form, then get out while it floats | Under water a sonar ping, with a fainter echo about 1.6 seconds later, repeats every 4 seconds over a low rumble. After you get out no new ping starts, though the current one may finish (ADR 0041) | | |
| 41 | While submerged, turn hard left and right | The body banks into the turn as in flight and keeps its depth (ADR 0044) | | |

## Sports boat

Setup: craft the "Sports Boat" item from 5 iron ingots and an oak boat, or use `/give @s yasu_ride:sportsboat_item`. Use a pool or lake at least 3 blocks deep.

| # | Steps | Pass condition | PC | Mobile |
|---|---|---|---|---|
| B1 | Use the boat item on water by tapping the bed, the water surface, and the side of a shore block that has water next to it | One boat appears at the water surface for each tap, never on the shore, and one item is used (not in Creative) | | |
| B2 | Use the boat item on the top of a dry block, then on the side of a dry block with no water next to it, then aimed at dry ground beyond reach. Get into the boat on land, push the stick forward, then pull it back | The first tap places the boat on the clicked block; on land, pushing the stick forward does not move it and pulling it back reverses it slowly (ADR 0080); the other two taps place nothing and use no item | | |
| B3 | Seat four riders and look forward from the driver's seat | All four riders fit and the driver's eye level sees over the windshield | | |
| B4 | Drive forward, reverse, turn, and drive forward into a shore level with the water; then turn around and reverse into the same shore | The boat responds on water; driving forward, it stops at the shore without leaving the water; reversing, it leaves the water and keeps reversing slowly on land (ADR 0080) | | |
| B5 | Tap (mobile) / left-click (PC) the boat with a dye, then brown dye, then black dye / place a new boat and tap it with black dye, then brown dye | The hull turns the dye's color, then back to black, and the black dye changes nothing; each repaint uses one dye (not in Creative) / nothing changes and both dyes stay (ADR 0076) | | |
| B6 | At night, drive with the headlight switch in hand and use it | Two beams light the water about 60 blocks ahead and follow the boat | | |
| B7 | Place an empty boat and hit its bow 3 times; repeat with another boat's middle, then another boat's stern | Each boat breaks and drops one boat item | | |
| B8 | Ram a mob at full throttle (Survival) | The mob takes damage and the boat and riders take none | | |
| B9 | Stop a boat and get off onto the deck | After a second with no driver, the boat stays still and you can walk at the deck's height | | |
| B10 | Walk around the deck and jump into the water | You can walk across the deck and fall into the water at the edge | | |
| B11 | Get back in from the water and drive off | The boat leaves and the invisible floor disappears | | |
| B12 | On a docked boat's deck, tap (mobile) / left-click (PC) the boat three times with an empty hand; repeat while sneaking at the very edge of the deck; then do the same from the water | It does not break from the deck, including at the edge; it breaks and drops the item from the water | | |
| B13 | On a docked boat's deck, long-press (mobile) / right-click (PC) the rear-left seat; have a second player use the driver seat, then push the driver's stick | Each player sits in the chosen seat; on the push both move into the boat, the driver stays in seat 0, the other player stays in the rear-left seat, and the boat leaves (ADR 0120) | | |
| B14 | Sit only in a rear deck seat and push the stick | Nothing happens; only the deck driver sets off | | |
| B15 | On a docked boat, sit in the rear-left deck seat; have a second player press the boat from the water while aiming at its rear-left seat (PC) or standing beside it (mobile) | The first player stays on the deck seat and the second sits in the free seat nearest it, never the rear-left seat; the boat stays docked (ADR 0120) | | |
| B16 | Dock the boat and, on a phone, aim at a deck seat | The interact button reads "Sit", not "Ride" | | |
| B17 | Stop the sports boat until it lays its deck, walk on the deck, and look at the deck from above and from the water | The deck holds you as before, and nothing shows on it (ADR 0101) | | |
| B18 | With one player driving, have a second player in the water right-click (PC) the boat while aiming at a rear seat, including from straight behind the stern with a level view; then let the driver get out | The second player sits in the seat they aimed at, not the front passenger seat; when the driver gets out, the second player stays in that rear seat (ADR 0120) | | |
| B19 | With an empty boat, have two players each press the boat from the water while aiming at a different rear seat, then have a third press it aiming at the driver's seat and drive off | Both rear players sit where they aimed; the third sits in the driver's seat and drives with both still in the rear (ADR 0120) | | |
| B20 | Aim at the front passenger seat and press the boat; then aim at the driver's seat from the same spot and press it with another player | Each player sits in the seat they aimed at; nothing invisible can be hit or ridden in the empty seats, and breaking the boat with three hits still works (ADR 0120) | | |
| B21 | On an iPad or phone, with one player driving, swim to the stern beside a rear seat and long-press the boat anywhere on the screen, including its bow; then repeat with a second phone player at the other rear seat | Each phone player sits in the rear seat nearest where they stand, not a front seat, whichever part of the boat they pressed (ADR 0120) | | |

## Camper

| # | Steps | Pass condition | PC | Mobile |
|---|---|---|---|---|
| C1 | Use the camper item on the ground | The camper faces forward and consumes the item, except in Creative | | |
| C2 | Place it with a block 4 cells from the target block (inside the 9 x 9 x 4 clear cells it needs) | No camper is placed | | |
| C3 | Craft with an SUV item, a bed, a chest, and an oak door; repeat with different bed colors | The recipe works with every bed color | | |
| C4 | Have four players get in by long-pressing the front bumper | Seat 0 is the front-right driver, with the steering wheel in front of them; seats 2 and 3 face each other on the left | | |
| C5 | Drive forward and backward toward walls, a one-block-thick wall at top speed, and a one-block pillar off the center line, then over a one-block step, then at a one-block curb right in front of a wall | Both ends stop without entering or passing the walls or the pillar; the camper climbs the step; at the curb it stops without hopping | | |
| C6 | Double-tap jump to take off, fly low into a one-block-high hedge and then into a cliff, then double-tap again to land | It flies and lands like the SUV; the nose stops before entering the hedge or the cliff | | |
| C7 | Enter deep water and hold jump | It becomes a submarine and rises with jump | | |
| C8 | Hit the front bumper of an empty camper three times without a dye | It drops its item | | |
| C9 | Place a second camper | Your first camper disappears | | |
| C10 | Hit its front bumper with each of the 16 dyes | The window band, stripe with its W, and lower skirt change color; the white body stays white | | |
| C11 | Tap and long-press the camper's body anywhere but the front bumper | Nothing happens: no hit, no ride, no paint | | |
| C12 | Stop on flat grass with flowers and wait a second | The camper turns to the nearest quarter turn and parks; the grass and flowers under it are gone; you can walk inside | | |
| C13 | Stop with a stone block where a wall would go; repeat with a block above the roof | It does not park; the driver sees "Can't park here" | | |
| C14 | Tap the door from outside, then from inside, several times | It opens outward and closes each time; the door swings smoothly | | |
| C15 | Place and break blocks on the floor and on the roof | They place and break; push forward from the driver's seat: it stays parked and says "Clear the blocks inside first"; clear them and push again: it departs | | |
| C16 | Sit at the dinette from inside, then have the driver depart | The seated player rides along | | |
| C17 | With all four seats taken, stand inside and have the driver depart | You are moved outside the door, facing away from the camper | | |
| C18 | Park, open and close the door, run /reload midway through each swing, then depart | It stays parked after /reload, the door continues in its previous direction, and departing clears the room | | |
| C19 | Stop on a flat dirt path and wait a second | It parks with its floor in the cell above the path (the engine turns the path under the floor into dirt); the floor, body and seats align, and it departs normally | | |
| C20 | Stop with a block just outside the door at feet or head height; remove it, park, then replace it and depart with all seats taken and another player standing inside | The first stop refuses parking with "Can't park here"; after parking the blocked exit allows departure but the standing player is not teleported into the block | | |
| C21 | Stand on the roof near a side or end wall, then at its outer edge, and have the driver depart | You are seated if a seat is free or moved outside the clear door exit, including when your center is up to 0.3 blocks beyond the supported edge | | |
| C22 | Park the camper, sit in the front-right deck seat, and push the stick | The rider moves into seat 0 on the right and the camper drives off; the dinette and the other deck seats are where they were | | |
| C23 | Inspect both sides, front, and rear. Drive on level ground at low and top speed. Double-tap jump to take off, then land. Enter deep water and dive. Park and walk inside | The tires touch the ground and fit inside the arches with visible clearance. Their rotation matches travel speed without appearing to slide. In hover and submarine forms they fold below the floor without protruding through the body or interior. No tires show inside; wheel housings appear along the walls | | |
| C24 | Sit in the driver's seat and then the front passenger seat in first person, on PC and mobile, and look straight ahead | You see the road through the windshield over the dashboard and the steering wheel; the steering wheel does not cut into the cushion (ADR 0070) | | |
| C25 | Fly the camper from the driver's seat, turn the view around, then dive into deep water; then fly the SUV | In the camper the camera pulls back far enough to show the whole camper from behind, and it turns with your view; in the SUV the view is the usual F5 distance (ADR 0071) | | |
| C26 | Park, walk to the bed at the rear left, step onto it, and place a block on top of it | The bed stops you like a low block and you can stand on it; the block on top keeps the camper parked with "Clear the blocks inside first" | | |
| C27 | Park at night (`/time set 13000`) and long-press the bed on a phone; repeat with right-click on PC | The screen fades to black and back, and it is morning for every player | | |
| C28 | Long-press the bed during the day (`/time set 1000`) | "You can sleep only at night" shows; the time does not change | | |
| C29 | Long-press the bed, then die (`/kill`) | You respawn standing on the bed, not stuck inside it | | |
| C30 | Long-press the bed, drive the camper away, then die | You respawn where the bed was | | |
| C31 | Park, walk along the right side from the driver's seat to the rear, look up above the table, and look at the furniture from the aisle and from outside through the windows | A cream two-door fridge stands behind the driver's seat (ADR 0123), a counter stands behind the door with the sink on the left and the stove on the right seen from the aisle (ADR 0100) and a wall cabinet up at the ceiling above it, a closed shower-toilet room fills the rear right corner, and a cord with a small chrome hook hangs from the ceiling above the table, ending a little over a block above the table top (ADR 0099); none of it blocks the door or the aisle, and nothing pokes through the outer walls, the wheel housings, the roof, or the rear wall (ADR 0093) | | |
| C32 | In creative, open the Items tab and scroll to the end | A "Camping Gear" group with the percolator as its icon holds all 19 gear items in the order of docs/items/camping-gear.md, each once, with icons and names in your language | | |
| C33 | Stand on flat ground and run `/setblock ~2 ~ ~ yasu_ride:transistor_radio_decor ["yasu_ride:face"=0,"yasu_ride:height"=8]`, then the same with face 1, 2, and 3; then run `/setblock ~2 ~ ~2 yasu_ride:macrame_planter_decor ["yasu_ride:face"=0,"yasu_ride:height"=0]` and look at it from below and from the side | The radio floats half a block up; with face 0 the side shown at the front of its preview faces south (+z), with 1 west, 2 north, 3 east; it has no collision, and the outline matches its size. The macrame planter shows in full, from 6 to 16 px above the block's bottom, entirely inside its own block, with no part cut off or missing, and its outline surrounds it (ADR 0099) | | |
| C34 | Park, hold a Percolator (`/give @s yasu_ride:percolator`) in Survival, and long-press the floor next to the stove on a phone; repeat with right-click on PC with a Pair of Mugs near the table | Each item appears on the nearest spot that accepts it, and one item leaves your hand each time | | |
| C35 | Hold a Potted Plant and long-press the floor under the table, then the shut fridge; then long-press anywhere with a Macrame Hanging Planter | The plant goes on the table, then on the free spot nearest the fridge, never inside it (ADR 0093, 0123); the planter hangs from the ceiling hook above the table | | |
| C36 | Hold a Lava Lamp, look up at the wall cabinet over the counter with its doors shut, and long-press it | The lamp goes on the free spot nearest the point you pressed; nothing stands on the wall cabinet or goes inside it (ADR 0103, 0114) | | |
| C37 | With an empty hand, long-press a placed item on a phone; right-click one on PC | The item disappears and is back in your inventory; with a full inventory it drops at your feet | | |
| C38 | Place items in Creative | The items are placed and the stack in your hand does not shrink | | |
| C39 | Place two items, drive away, park again, then run `/reload` | Both items are back in their spots after parking again and after the reload | | |
| C40 | Place two items, get out, and hit the camper from outside until it breaks | The camper item drops, and both decor items are in your inventory | | |
| C41 | With a player who has never placed a camper, place a camper | A Camping Gear Box is added to the inventory, or drops at your feet when it is full (ADR 0093) | | |
| C42 | Hit the camper's bumper 3 times to take it back, then place it again | No second box is given | | |
| C43 | Hold the box and use it in the air (tap on a phone, right-click on PC) | The box is gone and the 19 camping gear items are in the inventory, each showing "Camping gear" under its name | | |
| C44 | Get another box from the creative inventory, fill all but three inventory slots, and use the box on a grass block | Nothing is placed on the grass; the items that do not fit drop at your feet | | |
| C45 | Open the creative inventory's Items tab | The Camping Gear group shows the box as its icon and holds the box first, then the 19 items | | |
| C46 | Set the game language to Japanese, then open a box and look at an unpacked item | The line under the item's name shows the Japanese text from ja_JP.lang, not the key yasu_ride.lore.camping_gear | | |
| C47 | Park, stand in the aisle next to the shower-toilet at the rear right with an empty hand, and long-press its door; long-press again; repeat on PC with right-click | The shower door swings into the aisle over half a second, then shuts; nothing else in the camper moves (ADR 0094, 0098) | | |
| C48 | Open the shower door, step inside, turn toward the door, and long-press it with an empty hand | Water sprays down from the shower head with a running-water sound for about 5 seconds, then stops; the door does not move (ADR 0098) | | |
| C49 | Run the shower and long-press the door from inside again after about 3 seconds | The shower keeps running for about 5 seconds after the second press | | |
| C50 | Open the shower door, run the shower, and drive away | The shower stops and the shower door is shut while driving | | |
| C51 | Open the shower door and run `/reload` | The shower door is still open and the shower is off | | |
| C52 | Hold a camping gear item and long-press the shower-toilet door from the aisle | The shower door does not move | | |
| C53 | Hold a stone block and long-press the shower-toilet door from the aisle, then sneak and long-press it again | Neither the shower door nor the shower reacts; no stone ends up inside the shower-toilet (ADR 0098) | | |
| C54 | Park, open the shower-toilet door, step in, and long-press the toilet on a phone; repeat with right-click on PC; then sneak | You sit on the toilet at its seat height, neither sunk into it nor floating above it; sneaking stands you up (ADR 0095) | | |
| C55 | In a parked camper, with an empty hand, long-press the shower-toilet from the aisle aimed at the door's top, middle, and bottom (where the toilet stands behind it), then from inside aimed at the door; repeat with right-click on PC | Every press from the aisle opens or closes the door and the press from inside runs the shower; none of them seats you on the toilet or shows "Sit" (ADR 0098) | | |
| C56 | Sit on the toilet while another player sits in the driver's deck seat and drives off, with a camper seat free | You ride along in a free camper seat (ADR 0095) | | |
| C57 | Fill all four camper seats, sit a fifth player on the toilet, and drive off | The fifth player stands on the ground outside the door, facing away from the camper (ADR 0095) | | |
| C58 | In Creative, park the camper, then try to break the floor, a wall, the door, the bed, the door step, and a placed camping gear item, by click on PC and by long-press and tap on a phone | Nothing breaks, and no hole or gap flickers into view; an empty-hand long-press on the camping gear still takes it back (ADR 0096) | | |
| C59 | Park the camper and run `/fill` or `/setblock` to set one floor cell and one wall cell to air | Both come back within about a second; a block you place into such a gap first is kept and can be broken (ADR 0096) | | |
| C60 | Park, sit in the driver's seat, hold a potted plant, and long-press the table top on a phone; repeat from a dinette seat and with right-click on PC | The plant stands on the table each time; nothing is placed outside the camper (ADR 0097) | | |
| C61 | Standing in the aisle, hold a percolator and long-press the stove top, then a toaster on the counter | Each item goes on the spot you pressed (ADR 0097) | | |
| C62 | Open both fridge doors, hold a potted plant, and long-press the top compartment while the bottom one is free | The plant goes in the top compartment (ADR 0097, 0123) | | |
| C63 | Hold a cushion and long-press the stove top; then fill all 12 standing spots, hold one more standing item, and long-press one of the placed items | The cushion goes on the stove; with every standing spot taken you see "No free spot for this item". A press on an occupied top beside its item reaches that item and also shows "No free spot for this item" (ADR 0097, 0105) | | |
| C64 | With an empty hand, long-press a dinette seat. Stand up, put a mug pair on the table with the ceiling hook empty, then from the aisle long-press the mug pair with an empty hand | You sit on the dinette seat; the mug pair comes back to your inventory. If nothing happens, the hook's box is catching presses aimed at the table (ADR 0097) | | |
| C65 | Hold a macrame planter and long-press the space under the ceiling hook above the table | The planter goes on the ceiling hook (ADR 0097) | | |
| C66 | Hold a cushion and long-press each dinette seat on a phone for two seconds, then right-click each on PC | One cushion goes on each seat you pressed, and you do not sit; the right-clicks on PC, on seats that now hold a cushion, show "No free spot for this item" and place nothing; with an empty hand you sit as before (ADR 0097, 0104) | | |
| C67 | Put a percolator on the stove, then hold a toaster and long-press the percolator itself, not the stove top beside it | The toaster goes on the free spot nearest the point you pressed, and the percolator stays (ADR 0097) | | |
| C68 | In Creative, with an empty hand, hit the shower-toilet door from the aisle a few times, then long-press it | Nothing breaks, and the door still opens and closes (ADR 0098) | | |
| C69 | Park the camper facing each of the four directions and long-press the shower-toilet door from the aisle each time | The door opens and closes at every heading (ADR 0098) | | |
| C70 | Park, hold a Macrame Hanging Planter, and long-press inside the camper on a phone; look at it from the dinette and from the aisle, aim at it, then long-press it with an empty hand; repeat with right-click on PC | The planter hangs under the hook above the table, drawn as a planter and not as a square of pixel noise, with the cord meeting its top knot; aiming at it outlines the planter itself; the empty-hand long-press takes it back (ADR 0099) | | |
| C71 | Park the camper and, on a phone, aim at the dinette, the driver's deck seat, and the toilet (with the shower-toilet door open); then set the game language to Japanese and repeat | The interact button reads "Sit" on each seat, and in Japanese it shows the text from ja_JP.lang for action.interact.yasu_ride.sit; it never reads "Ride" | | |
| C72 | Park the camper, put a potted plant on the table and a transistor radio on the dashboard, then look at them from inside and from outside through the windows, on a phone and on PC | Both items show from every side; no small dot or flicker shows anywhere in the room (ADR 0101) | | |
| C73 | With items on the table and the dashboard, walk 30 blocks away and come back, then restart the server and look again | The items still show (ADR 0101) | | |
| C74 | Park, hang a Macrame Hanging Planter on the ceiling hook, and look at it from the dinette, from the aisle, and from outside through a window, on a phone and on PC; aim at it, then long-press it with an empty hand | The planter shows as a planter (pot, leaves, and cords) with its top knot at the hook, never as a plain textured block; aiming at it outlines the planter, and the long-press gives it back (ADR 0102) | | |
| C75 | On a build before this change, park and put a lava lamp on each half of the wall cabinet; update to this change, restart the server, and look inside | The two lamps stand on the first free spots (the dashboard first); nothing stands on the wall cabinet, which now meets the ceiling (ADR 0103) | | |
| C76 | On a build before this change, fill every standing spot and both halves of the wall cabinet; update, restart, and break the camper into its item | Every placed item, including the two from the wall cabinet, comes back to you (ADR 0103) | | |
| C77 | Sit in the driver's seat in first person and look at the wheel and the console, then look at the cab from the passenger seat and from outside through the windshield, on a phone and on PC | The console in front of the driver shows a strip speedometer between small gauges, rows of switches, a round ignition switch at the upper right, a round speaker at the left end, and a round vent on the dash top, all set in green trim, with no logos or lettering; the ivory wheel has two level spokes, a chrome half ring, and a plain round hub; the view over the wheel is as open as before | | |
| C78 | Put a cushion on a dinette seat, then hold a mug pair and long-press that seat on a phone; repeat with right-click on PC; then press it with an empty hand | The message "No free spot for this item" shows, the mug pair stays in your hand, you do not sit, and no item appears on the table, the dashboard, or any other spot; with an empty hand you sit (ADR 0104) | | |
| C79 | Park the camper and, with an empty hand, tap the entry door once on a phone and once with right-click on PC, ten times each; do the same with the shower-toilet door from the aisle; then tap a door twice quickly | Every single tap opens or closes the door, and it stays that way; two quick taps within half a second toggle it once (ADR 0105) | | |
| C80 | Sit in the driver's seat and then the front passenger seat in first person, on PC and mobile; then park, hold two transistor radios, and long-press the middle of the dash top from the driver's seat, then the passenger side of the dash top from the passenger seat; take both back, stand in the aisle behind the front seats, and long-press the dash top and then the lower half of the dash's rear face | The dash top sits just under the windshield's lower frame, which stays in sight, and the steering column still meets the dash; each item stands on the raised dash top, not floating or sunk into it; note whether the press on the lower rear face from the aisle places the item (ADR 0106) | | |
| C81 | Park facing each of the four directions in turn; hold a saucepan and long-press the stove, taking it back with an empty hand between presses, on a phone and on PC | The saucepan stands on the grate of the stove's one burner in the middle, not sunk into the grate; aiming at it outlines the whole cell width above the stove, and the empty-hand press takes it back (ADR 0107, 0112) | | |
| C82 | Put a kettle on the stove, then hold a percolator and long-press the stove; then long-press the stove from a dinette seat with a mug pair | The percolator, and then the mug pair, go to the free spot nearest the press, never onto the stove; the kettle stays (ADR 0107, 0112) | | |
| C83 | Put a toaster on the stove, then long-press the stove top beside it, away from the toaster, with an empty hand, standing in the aisle and sitting on the toilet side | The toaster comes back; the toilet seat's ride button never shows (ADR 0107) | | |
| C84 | Put a cushion on the stove and a book stack on the counter next to the stove; long-press the counter top right next to the stove with an empty hand | The cushion does not poke through the wall; the press on the counter takes back the book stack, not the cushion (ADR 0107, 0112) | | |
| C85 | On a build before ADR 0107, park and put a percolator on the stove; update to this change, restart the server, and look inside | The percolator stands on the stove's one burner in the middle (ADR 0107, 0112) | | |
| C86 | Park facing each of the four directions in turn; open the bottom fridge door, hold a cushion and long-press the compartment near its front end (toward the driver's seat), then hold a book stack and long-press it near its rear end; do the same in the top compartment, on a phone and on PC | Each item stands in the compartment at the end nearest the press, the two clear of each other and of the fridge's walls; both render as gear, never as the dirt-like fallback block, and nothing appears in the driver's seat (ADR 0108, 0123) | | |
| C87 | Park facing each of the four directions in turn; hold a fruit bowl and long-press the table near the wall, then a mug pair near the aisle | The fruit bowl stands on the wall side and the mug pair on the aisle side of the table, both on the table top and clear of each other and of the wall; nothing appears in the aisle (ADR 0108) | | |
| C88 | With both ends of the open bottom fridge compartment and of the table filled, aim at each item; then, with an empty hand, long-press each item in turn, in all four facings | The outline covers the compartment from its floor up, or both items of the table together; each press takes back the item you aimed at and leaves the other one standing where it was (ADR 0108, 0123) | | |
| C89 | Put an item only at the open bottom fridge compartment's rear end, hold another item, and long-press the compartment's empty front half, then the rear item itself; do the same with an item only on the table's wall side | The second item goes on the empty end of the same compartment or table each time (ADR 0108, 0123) | | |
| C90 | Fill both ends of both fridge compartments and of the table with different items, the sugar pot next to an opaque item on one of them; shut the fridge, walk along the aisle and through the door both ways; sit in the driver's seat with a cushion in hand, then drive off and park again | Each end shows only its own item while its door is open, and the sugar pot's glass shows as solid pale blue; nothing stops you in the aisle; you sit in the driver's seat instead of placing the cushion; the camper drives off without "Clear the blocks inside first", and all six items are back after parking (ADR 0108, 0123) | | |
| C91 | On a build before #429, and on the first build of #429, park and put an item on each shelf board's ends and on the table's sides; update to this change, restart the server, and look inside | Items from before #429 stand on the table's wall side, and the shelf items are inside the fridge (C157); items the first #429 build put on the aisle side come back there; no fallback block is left in the driver's seat or the aisle; nothing is lost (ADR 0108, 0123) | | |
| C92 | Park the camper, sit on the driver's deck seat, then the passenger's, each dinette seat, and the toilet, and stand up from each with the dismount button on a phone and by sneaking on PC; look somewhere other than straight ahead before standing up | You land inside on the aisle floor beside the seat (behind the front seats, beside the dinette seat, or in front of the shower-toilet door), never outside the camper or inside a wall, and you still look the same way; note whether you see yourself outside for a moment first (ADR 0109) | | |
| C93 | Park the camper with someone on each deck seat; the driver's deck seat rider pushes the stick to set off | Everyone is moved into the camper's seats and the camper drives off; nobody is put in the aisle first (ADR 0063, 0109) | | |
| C94 | Fill all four camper seats while parked, put a fifth player on the toilet, and set off | The toilet rider is moved to the ground outside the door, as before (ADR 0095, 0109) | | |
| C95 | Park the camper, put a block in the aisle cell beside a dinette seat at head height, then sit on that seat and stand up | You are not put into the block; you land where the game puts you, as before this change (ADR 0109) | | |
| C100 | Park facing each of the four directions in turn; stand in the aisle right next to the stove, hold a saucepan, and long-press the stove, aiming steeply down at it, taking it back with an empty hand between presses; repeat standing one block back in the aisle, on a phone and on PC | The saucepan lands on the stove's burner every time, including presses close to the stove's edge (ADR 0110, 0112) | | |
| C101 | Open both fridge doors, hold a potted plant, and long-press the front edge of each fridge compartment, then the table's and the counter's edges from the aisle, taking each item back between presses | Each item lands in the compartment, on the table, or on the counter aimed at, never in the compartment above or below it (ADR 0110, 0123) | | |
| C102 | Hold a macrame planter and long-press the ceiling hook, take it back, then long-press the table top under the hook from the aisle | The planter hangs from the hook both times (ADR 0110) | | |
| C110 | Park facing each of the four directions in turn; hold a saucepan and long-press the top of the stove near each of its four corners in turn, aiming from the aisle, taking it back with an empty hand between presses, on a phone and on PC | The saucepan lands on the stove's burner in the middle every time (ADR 0111, 0112) | | |
| C111 | On PC with the mouse, then on a phone, stand in the aisle right next to the stove, hold a saucepan, and right-click or long-press the stove's aisle-side face just under its top edge; repeat on the front edges of the two open fridge compartments | The saucepan lands on the stove's burner, and the fridge items in the compartment aimed at; if PC lands them in the other compartment while the phone does not, PC reports the real height and the side-face rule of ADR 0111 is wrong there | | |
| C112 | Put a kettle on the stove, hold a mug pair, and long-press the top of the kettle, then the table top and the counter top from the aisle, taking items back between presses | The mug pair goes to the free spot nearest the press each time, never under the kettle (ADR 0111) | | |
| C120 | Park the camper and look at the stove top from the aisle, from the dinette, and from outside through a window, on a phone and on PC | The stove top shows one burner in the middle, with its grate and prongs, and no other burner; the sink, the vent band at the wall, and the knob panel are as before (ADR 0112) | | |
| C121 | Put each of a saucepan, an enamel kettle, a percolator, a toaster, and a cushion on the stove in turn, in all four facings, taking each back with an empty hand | Each item stands centered on the burner, on the grate, not floating and not sunk into it, and none pokes through the wall or the vent band (ADR 0112) | | |
| C122 | On a build before this change, park and put a saucepan on the wall-side burner toward the far end of the stove; update to this change, restart the server, and look inside | The saucepan stands on the stove's one burner in the middle; no item is left floating where the old burner was, and the empty-hand press takes it back (ADR 0112) | | |
| C123 | On a build before this change, park and put a kettle on a stove burner; update, restart, and break the camper into its item | The kettle comes back to you (ADR 0103, 0112) | | |
| C130 | Park the camper and walk around its right (door) side, on a phone and on PC | A window with a chrome frame sits between the door and the rear right window, as long and as high as the window ahead of the door, with the same wall width on both sides; the tan band is cut around it (ADR 0113) | | |
| C131 | Inside the parked camper, stand in the aisle at the stove, then at the sink, and look at the wall behind them | You see outside through the window, between the counter top and the wall cabinet; curtains hang at both ends of the window and nothing else covers it (ADR 0113) | | |
| C132 | Put a saucepan on the stove and a mug pair on the counter, then look at them from outside through the new window | Both items show through the glass; no wall or furniture face flickers in the window opening (ADR 0113) | | |
| C140 | Park facing each of the four directions in turn; stand in the aisle and, with an empty hand, long-press the wall cabinet over the sink, then over the stove, on a phone and on PC | Each press opens only the door pressed, once; it swings out into the aisle above your head, hinged at the cabinet's outer end, and the open compartment is empty inside; nothing renders as the dirt-like fallback block (ADR 0114) | | |
| C141 | With both doors open, hold a cushion and long-press the sink compartment near its front end, then a mug pair near its rear end; fill the stove compartment the same way with a toaster and a lava lamp | Each item stands inside the compartment at the end nearest the press, on the compartment floor, clear of the other item, the divider, and the top panel; the tall lava lamp fits under the top (ADR 0114) | | |
| C142 | With both compartments full, tap the open sink door in the aisle with an empty hand, then long-press the stove compartment's rear item, then its empty rear half | The sink door shuts and its two items disappear when it is shut; the stove's rear item comes back into your inventory; the press on the empty half shuts the stove door (ADR 0114) | | |
| C143 | With the doors shut and items inside, hold a potted plant and long-press each shut door; then fill every other spot in the camper and do it again | The plant goes on the free spot nearest the press, usually the stove or the counter below, never inside the shut cabinet; with every other spot full you see "No free spot for this item" and keep the plant (ADR 0114) | | |
| C144 | Open the sink door with one quick tap, many times, on a phone and on PC; then, with an item at its front end, tap that item quickly once | Every tap opens or closes the door exactly once; the quick tap on the item takes only that item and does not also shut the door (ADR 0105, 0114) | | |
| C145 | Open both doors with items inside, then drive off, park again, and open the doors; also break the camper into its item once | Driving off shuts both doors at once; after parking, the doors are shut and the items are still inside when they open; breaking the camper gives back every item, the cabinet's included (ADR 0114) | | |
| C146 | With a door open, aim at the cabinet and at the open door, then jump in the counter cell under the cabinet and in the aisle under the open door; run `/reload` with one door open | The outline covers the cabinet from its floor to its top, and the open door's outline is a thin plate where the door stands; your head stops at the ceiling in both places; after `/reload` the open door stays open (ADR 0114) | | |
| C147 | At night, park the camper; on foot in the aisle, hold the headlight switch and use it once in the air, once aimed at the floor, a wall, the ceiling, and the entry door, on a phone and on PC | Each use turns the two ceiling lights on or off exactly once with a click; the room gets bright and the two panels over the aisle glow while on; aiming at the door does not also open it (ADR 0115) | | |
| C148 | With the lights off, use the switch from each deck seat, the driver's deck seat included, and from the toilet; then sit in the camper's driver seat (seat 0) and use it | From every deck seat the ceiling lights switch; from seat 0 the headlights switch as before and the ceiling lights stay as they were (ADR 0115) | | |
| C149 | Stand on the roof of the parked camper, on a held sports boat's deck, and next to the camper outside; hold the switch and use it in the air, then press a chest, a door, and the vehicle | No light switches; every press does what it does without the switch, so the chest and door open and you can board the boat (ADR 0115) | | |
| C150 | Turn the lights on, run `/reload`, then restart the server | The lights stay on and the room stays lit; no extra light is left anywhere (ADR 0115) | | |
| C151 | Turn the lights on, drive off and park again; then turn them on and break the camper into its item | Driving off turns the panels off and removes the light; the camper parks dark; after breaking it, the room cells hold no light block (check by holding a light block) (ADR 0115) | | |
| C152 | Park facing each of the four directions in turn and look at the fridge behind the driver's seat from the aisle, the dinette, and through the windows, on a phone and on PC | A cream fridge with softly rounded edges: a shorter top door over a taller bottom door, a chrome strip between them, a chrome lever handle on each door near its rear edge, and a thin chrome line across the top door; no badge or lettering; nothing pokes through the wheel housing or the walls (ADR 0123) | | |
| C153 | With an empty hand, long-press the top fridge door, then the bottom one, on a phone and on PC, in all four facings | Each press opens only the door pressed, once; it swings out into the aisle toward the cab, hinged at the fridge's front end, and stands against the front seats' backs; the open compartment shows its items, or is empty and white inside; nothing renders as the dirt-like fallback block (ADR 0105, 0123) | | |
| C154 | With both doors open, put two items in each compartment; tap each open door in the aisle with an empty hand; then open them again and long-press each item, then an empty end | Tapping an open door shuts it and its items disappear once it is shut; with the door open each press takes back the item pressed; the press on an empty end shuts that door (ADR 0114, 0123) | | |
| C155 | Turn the ceiling lights on, open the top fridge door, then shut it; do the same with the bottom door | The front of the room stays lit while the top door is open and after it shuts; the bottom door changes nothing about the light (ADR 0115, 0123) | | |
| C156 | Open both fridge doors with items inside, sit on the front dinette seat and stand up; then drive off with the doors open, park again, and open them; also break the camper into its item once | You stand up in the aisle beside the open doors; driving off shuts both doors at once and nothing blocks departure; after parking the doors are shut and the items are inside; breaking the camper gives back every item, the fridge's included (ADR 0109, 0123) | | |
| C157 | On a build before this change, park and put an item on each end of both shelf boards; update to this change, restart the server, and open both fridge doors | The low board's items are in the bottom compartment and the high board's in the top one, each at the same end as on the board; nothing is lost and no shelf block is left (ADR 0123) | | |
| C158 | With a fridge door open, aim at the open door and at the compartment; put a block in the aisle cell beside the fridge with the doors shut and try to drive off; run `/reload` with one door open | The open door's outline is a thin plate where the door stands and the compartment's runs from its floor up; with the block there you see "Clear the blocks inside first"; after `/reload` the open door stays open (ADR 0121, 0123) | | |

## Bulldozer

Setup: use `/give @s yasu_ride:bulldozer_item` or craft from an SUV item, an iron block, and an iron shovel. Craft the Blade Up/Down switch from a lever and an iron ingot, or use `/give @s yasu_ride:blade_switch`.

| # | Check | Pass condition | PC | Mobile |
|---|---|---|---|---|
| B1 | Place and replace (one per player) | Place one, then another; only the newest stays and other kinds stay | | |
| B2 | The starter item in Survival | Join with an existing SUV starter flag; receive only the bulldozer, and none on rejoin | | |
| B3 | Pivot and driving feel | Forward and back stay straight; sideways pivots and stops; Jump tap hops; with the blade raised it climbs 1- and 2-block steps automatically, and with it lowered there is no automatic step-up | | |
| B4 | Flight speeds | Double tap takes off; flight and water cap at 9 blocks/s and never bank | | |
| B5 | Door | Board and leave; the left door opens over 10 ticks, waits, and closes after 40 ticks | | |
| B6 | Cab view | PC and touch riders see out of the cab and turn with the body | | |
| B7 | Headlights at night (the cab stays dark) | Headlights and rear beacon glow; the road lights up and the cab stays dark | | |
| B8 | Glow and propeller | Thruster glows only in flight; the propeller spins only under water | | |
| B9 | Cutting bedrock, barriers, command blocks and light blocks with the blade lowered | Forward cutting removes them; liquids, containers and laid add-on blocks stay | | |
| B10 | Cutting in Adventure mode with the blade lowered | The blade clears the same terrain in Adventure | | |
| B11 | Creative group | The creative Items tab shows a "Bulldozer Switches" group after "Camping Gear". Its icon is the switch, and it holds only "Blade Up/Down", named in your language | | |
| B12 | Spawn pose | Place a bulldozer: the blade is up and the lift rods are short | | |
| B13 | PC switch | Drive and right-click with the switch, then hold the button. The blade lowers over half a second, the rods lengthen, and a click plays. The held button switches only once. A second click raises the blade again | | |
| B14 | Mobile switch | Drive and long press with the switch, then hold. The blade lowers over half a second, the rods lengthen, and a click plays. The held press switches only once. A second long press raises the blade again | | |
| B15 | Raised and lowered movement | Raised, drive at a 1-block and a 2-block step, then into a hill. It climbs both steps and removes no block. Lowered, it cuts the hill as in B9 | | |
| B16 | Outside the bulldozer | Use the switch on foot next to the bulldozer, and while driving an SUV. Nothing changes and no click plays | | |
| B17 | Saved blade | Lower the blade, run `pnpm server:restart`, and rejoin. The bulldozer is still lowered and still cuts | | |

## Tent

Walk in through an open flap: tap a flap to roll it up (ADR 0132).

| # | Steps | Pass condition | PC | Mobile |
|---|---|---|---|---|
| T1 | Pitch the tent facing each of the 4 directions | The tent opens toward you, with its front edge on the clicked column | | |
| T2 | Try to pitch on a step, over a hole, beside a parked camper, with a cow in the footprint, overlapping another tent's empty corner, and as a fifth tent | Each shows its message and keeps the item | | |
| T3 | From outside, at each yaw, hit a wall and the roof three times (click on PC, hold on mobile) | The hints count down and the item returns. Record how many swings a single held press counts | | |
| T4 | Inside, tap the ground, place a chest, and place and sit on a Low Chair. Then hit a wall from inside | Taps reach the blocks, never the tent. The wall hit shows "Someone is inside the tent" and does not count | | |
| T5 | With a second player inside, hit the tent three times from outside | The tent stays and the message shows | | |
| T6 | Wait for rain or snow | It stops at the ceiling, under the tarp and over both rooms | | |
| T7 | Stay through one night with no torch inside | No hostile mob spawns inside. If one does, tune `ceilingLight` (keep the block JSON and `TENT_SPEC` equal) and record the value | | |
| T8 | After `/reload` and after a server restart, look at the tent, hit it right after joining, and try to place an SUV under the tarp | The cells are back, the hit counts, and the SUV cannot be placed | | |
| T9 | In Creative, break a wall block | It counts one hit and the block stays | | |
| T10 | Pitch on snow layers in a snowy biome, then on leaf litter or moss carpet, then aiming at a tuft of short grass | The tent rests on the ground under them and they are cleared from the footprint | | |
| T11 | At each of the 4 yaws, tap each flap (front, left, right, bedroom) from outside and from inside | Only the tapped flap rolls up or drops; the flap block takes the tap, not the tent entity; an open flap can be walked through (ADR 0132) | | |
| T12 | Close every flap and stay near the tent through a night | No zombie walks in through a closed flap | | |
| T13 | Stand in an open flap while a second player taps it | It stays open and the tapper sees "Someone is in the way of the flap"; after you step out, the next tap closes it | | |
| T14 | Open one flap, then run `/reload`, and again after a server restart | The flap is still open: its block lets you through and its bone is still rolled up | | |
| T15 | Pitch a tent at night (`/time set 13000`), walk into the bedroom through its flap, and long-press (mobile) or right-click (PC) either mattress | The screen fades to black and back, and it is morning for both players (ADR 0133) | | |
| T16 | Long-press a mattress during the day (`/time set 1000`) | "You can sleep only at night" shows, and the time does not change | | |
| T17 | Long-press a mattress, then `/kill` yourself | You respawn standing on the mattress, not stuck inside its 9 px box | | |
| T18 | While player A stands on a mattress, player B hits the tent's wall three times from outside | The tent stays, and B sees "Someone is inside the tent" | | |
| T19 | Holding a Low Chair, tap a mattress | No chair appears | | |
| T20 | Step onto a mattress | It stops you like a low block, and you can stand on it | | |
| T21 | In Creative, try to break a mattress | The block stays | | |

### Tent lantern

| # | Steps | Pass condition | PC | Mobile |
|---|---|---|---|---|
| T22 | Standing in the front room, use the headlight switch by tapping the ground, a wall, the ceiling, and the tent model itself | Each use turns the lantern on or off with a click, and its glass glows while on (ADR 0134) | | |
| T23 | With the switch, press a closed flap, then a mattress, at night | The lantern switches; the flap does not open and no sleep starts (ADR 0132, 0133, 0134) | | |
| T24 | Sit on a Low Chair in the front room and use the switch | The lantern switches (ADR 0134) | | |
| T25 | Use the switch outside the tent, then drive an SUV next to the tent and use it at the wheel | Outside, the lantern does not change; the driver switches the SUV's headlights (ADR 0134) | | |
| T26 | Turn the lantern on, run `/reload`, then restart the server | The lantern is still on after each (ADR 0134) | | |
| T27 | With the lantern off, stay inside through one night | The tent looks dark and no hostile mob spawns inside (ADR 0131, 0134) | | |

### Tent paint

| # | Steps | Pass condition | PC | Mobile |
|---|---|---|---|---|
| T28 | Pitch a tent at each of the 4 yaws and hit its outer wall from outside with a red dye | The fly and its three outer flaps turn red; the inner tent, the bedroom door, the poles, the strap, the lantern, and the mattresses do not. One dye is used (ADR 0135) | | |
| T29 | Hit the red tent again with red dye, then with brown dye | Red does nothing and the dye is kept. Brown restores the tan | | |
| T30 | With a player inside, hit the tent from outside with a dye, then with an empty hand | The dye paints. The plain hit shows "Someone is inside the tent" | | |
| T31 | After painting, hit the tent three times with an empty hand | The tent comes down and one plain tent item returns | | |
| T32 | Paint a pitched tent, then `/reload`, then restart the server | The color stays | | |
| T33 | With the lantern switched on, paint the tent | The lantern glass still glows | | |

## Upgrading from MyCar 0.5.0 and earlier

Setup: in a world that used MyCar 0.5.0, place two vehicles and switch the headlights of one of them off, then stop the server and replace the old pack folders with the new ones as described under "Upgrading from MyCar 0.5.0 and earlier" in the [README](../README.md).

| # | Steps | Pass condition | PC | Mobile |
|---|---|---|---|---|
| U1 | Start the server with the new packs and open the world | The world loads without content log errors and the old vehicles and items are gone | | |
| U2 | Join with a player who had received the starter vehicle before | One "SUV" item is given again | | |
| U3 | Look where the vehicle with its headlights off stood | No light blocks are left there | | |
