# Headlight Switch

The light tool. One item turns the headlights of every vehicle on and off, and the same item also lights a parked camper's ceiling lights, the tent lantern, and the Gas Lantern. Back to the [item groups](README.md).

![Headlight Switch](../images/items/vehicle-switches/headlight_switch.png)

| Item             | Stack | Recipe                                                  | Where                                   |
| ---------------- | ----- | ------------------------------------------------------- | --------------------------------------- |
| Headlight Switch | 1     | Shapeless: a lever and glowstone dust (always unlocked) | Creative Items tab, next to the Booster |

See [ADR 0020](../adr/0020-headlights.md), [ADR 0024](../adr/0024-item-use-on-mobile-and-longer-headlights.md), and the [lights spec](../specs/lights.md).

## Vehicles

Works on the SUV, camper, sports boat, scooter, and bulldozer.

- **Switch the headlights:** sit in the driver's seat holding the switch and use it (right-click on PC, tap on touch). Use it again to turn them off. Passengers cannot switch them.
- **Parked camper:** whoever sits at the wheel seat of a parked camper can switch the headlights too ([ADR 0149](../adr/0149-route-the-parked-camper-wheel-seat-to-headlights.md)).
- **What it does:** the lamps glow and the road ahead is lit, following the vehicle. A click plays on each flip. A new vehicle starts with the headlights off; the state survives `/reload` and a server restart.
- **Repeated taps:** one tap that arrives twice flips once. Two taps need half a second between them. The headlights, the booster, and the equipment switches each keep their own cooldown.
- **Third person:** while the chase camera is active, the action bar shows Headlights ON or OFF ([ADR 0224](../adr/0224-third-person-switch-feedback-and-bulldozer-camera.md)).

## Other lights

- **Camper ceiling lights:** press the room switch inside a parked camper with the Headlight Switch in hand ([ADR 0115](../adr/0115-camper-ceiling-lights.md)).
- **Tent lantern:** use the switch on the tent ([ADR 0134](../adr/0134-switch-the-tent-lantern-with-the-headlight-switch.md)).
- **Gas Lantern:** see [Camping gear](camping-gear.md#gas-lantern-outside-the-vehicles).
