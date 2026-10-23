# Installing on a Realm

Back to the [README](../README.md).

A Realm has no folder to copy packs into, so the packs go in with the world: apply them to a world on your device, then upload that world to the Realm ([ADR 0129](adr/0129-support-realms-as-a-second-play-environment.md)). Only the Realm owner needs to do this.

1. **Import the add-on on your device.** Download `yasuflatland-ride-<version>.mcaddon` from the [latest release](https://github.com/yasuflatland-lf/yasuflatland-ride-minecraft/releases/latest) and open it (on iPad, follow steps 1 and 2 of [these steps](installing-on-ipad.md)).
2. **Turn it on in a world.**
   - Open **Edit** on a world, or **Create New** for a new one. To keep a world that is already on the Realm, download it first from the Realm's settings.
   - Under **Behavior Packs → Available**, activate **Yasuflatland Ride**. **Yasuflatland Ride Resources** is activated along with it.
   - Leave the experiments off; none are needed.
3. **Upload the world to the Realm.** In the Realm's settings, choose **Replace World** and pick the world from step 2. This overwrites the world on the Realm, so download a backup first if you want to keep it.
4. **Join.** Players do not need to install anything. The Realm sends the Resource Pack when they join, so accept the download prompt.

## Updating

Repeat the steps with the new `.mcaddon`: import it, make sure the world uses the new version, and upload the world again. To keep what was built since the last upload, download the world from the Realm first, apply the new version to that copy, and upload it.

## Checking a Realm

The in-game tests run only on the development server, so check a Realm by hand after the first install and after each update:

- Place and break an SUV, a sports boat, and a camper
- Board, drive, and leave each one; with two riders, let the driver leave and check that the passenger moves up and drives
- Place more SUVs than the limit of 10 and check that the oldest one goes; restart the Realm and check that the count is kept
- Turn the headlights on at night and drive
- Change the SUV and the camper into their flying and diving forms
- Drive the sports boat on water up to a shore

If vehicles stutter or stop responding with many vehicles moving, report the number of vehicles and the Realm's region in an issue.
