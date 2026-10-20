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
| B2 | Use the boat item on the top of a dry block, then on the side of a dry block with no water next to it, then aimed at dry ground beyond reach | The first tap places the boat on the clicked block and it cannot drive on land; the other two place nothing and use no item | | |
| B3 | Seat four riders and look forward from the driver's seat | All four riders fit and the driver's eye level sees over the windshield | | |
| B4 | Drive forward, reverse, turn, and drive into a shore level with the water | The boat responds on water and stops at the shore without leaving the water | | |
| B5 | Tap (mobile) / left-click (PC) the boat with a dye, then brown dye | The hull turns the dye's color, then back to black; each repaint uses one dye (not in Creative) | | |
| B6 | At night, drive with the headlight switch in hand and use it | Two beams light the water about 60 blocks ahead and follow the boat | | |
| B7 | Place an empty boat and hit its bow 3 times; repeat with another boat's middle, then another boat's stern | Each boat breaks and drops one boat item | | |
| B8 | Ram a mob at full throttle (Survival) | The mob takes damage and the boat and riders take none | | |
| B9 | Stop a boat and get off onto the deck | After a second with no driver, the boat stays still and you can walk at the deck's height | | |
| B10 | Walk around the deck and jump into the water | You can walk across the deck and fall into the water at the edge | | |
| B11 | Get back in from the water and drive off | The boat leaves and the invisible floor disappears | | |
| B12 | On a docked boat's deck, tap (mobile) / left-click (PC) the boat three times with an empty hand; repeat while sneaking at the very edge of the deck; then do the same from the water | It does not break from the deck, including at the edge; it breaks and drops the item from the water | | |
| B13 | On a docked boat's deck, long-press (mobile) / right-click (PC) the rear-left seat; have a second player use the driver seat, then push the driver's stick | Each player sits in the chosen seat; on the push both move into the boat, the driver stays in seat 0, and the boat leaves. With lower seats empty, a passenger may move to a lower seat on departure (ADR 0063) | | |
| B14 | Sit only in a rear deck seat and push the stick | Nothing happens; only the deck driver sets off | | |
| B15 | On a docked boat, sit in the rear-left deck seat; have a second player get into the boat's rear-left seat from the water | The first player is left standing on the deck and the second sits in the boat; the boat stays docked | | |

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

## Upgrading from MyCar 0.5.0 and earlier

Setup: in a world that used MyCar 0.5.0, place two vehicles and switch the headlights of one of them off, then stop the server and replace the old pack folders with the new ones as described under "Upgrading from MyCar 0.5.0 and earlier" in the [README](../README.md).

| # | Steps | Pass condition | PC | Mobile |
|---|---|---|---|---|
| U1 | Start the server with the new packs and open the world | The world loads without content log errors and the old vehicles and items are gone | | |
| U2 | Join with a player who had received the starter vehicle before | One "SUV" item is given again | | |
| U3 | Look where the vehicle with its headlights off stood | No light blocks are left there | | |
