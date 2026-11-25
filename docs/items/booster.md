# Booster

The boost tool. Hold it in the driver's seat and use it to triple the top speed and climb limit of a flying vehicle. Back to the [item groups](README.md).

![Booster](../images/items/vehicle-switches/booster.png)

| Item    | Stack | Recipe | Where                                                 |
| ------- | ----- | ------ | ----------------------------------------------------- |
| Booster | 1     | None   | Creative Items tab only, next to the Headlight Switch |

See [ADR 0260](../adr/0260-toggle-flight-boost-with-a-booster.md) and the [flight spec](../specs/flight-and-submarine.md#flight-boost).

## How to use it

- **Toggle:** only the driver can use it. Use it (right-click on PC, tap on touch) to switch the boost on, and again to switch it off. Each vehicle has a 10-tick idle cooldown for it, apart from the headlights and the equipment switches.
- **Works on:** the SUV, camper, scooter, and bulldozer. The sports boat cannot fly, so using the item there only shows "This vehicle cannot use a booster."
- **Stays on:** switching to another held item does not turn it off. It ends when the driver gets out, and the next driver, even a passenger who moves up to the wheel, starts with it off. It is not saved, so a reload or a rebuilt vehicle starts with it off.
- **Third person:** with the chase camera active, the action bar shows Boost ON or OFF.

## What it changes

- **In flight:** the horizontal top speed and the vertical climb limit are three times the vehicle's normal values. Acceleration, braking, drag, takeoff climb, and landing sink stay as they are, so speed builds up as usual.
- **Car and submarine forms:** you can switch it on there, but it only takes effect once the vehicle is flying. Ground, water, and submarine speed never change.
- **Letting go:** when the boost ends (switched off, landed, or the driver left), the extra speed bleeds off over about 20 ticks instead of dropping at once.
- **Ramming:** ram damage and push scale with speed, so a ram near boosted top speed hits about three times as hard.
