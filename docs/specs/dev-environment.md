# Development server

- Scope: How the dev Bedrock Dedicated Server runs in Docker, which transport and ports it uses, how the packs reach it, how devices avoid a stale Resource Pack, and which packs go to a Realm.
- Verified at: fd83ec4e
- Source: [0015](../adr/0015-dev-server-docker-nethernet.md)
- Source: [0062](../adr/0062-fresh-dev-pack-version-on-every-start.md)
- Source: [0179](../adr/0179-support-realms-as-a-second-play-environment.md)
- Excluded: [0011](../adr/0011-dev-server-docker-raknet.md): superseded in full by 0015, which carries over every rule that still applies
- Excluded: [0014](../adr/0014-opt-in-nethernet-dev-server.md): superseded in full by 0015, which makes NetherNet the default and keeps raknet as the fallback

## Rules

### Server and default transport

- Applies to: the dev BDS started with `pnpm server:up` or `pnpm server:restart`, with `BDS_TRANSPORT` unset.
- Rule: The dev server is BDS in Docker (image `itzg/minecraft-bedrock-server`, container `yasuflatland-ride-bds`) and its transport is NetherNet. `BDS_TRANSPORT` is read by `scripts/server-up.mjs`; any value other than `raknet` or `nethernet` stops the script with an error. `server/compose.yaml` also defaults `TRANSPORT` to `nethernet` when `BDS_TRANSPORT` is unset.
- Agreement: Accepted
- Basis: [0015](../adr/0015-dev-server-docker-nethernet.md) Decision, "Run the development server as BDS in Docker (`itzg/minecraft-bedrock-server`) with `transport=nethernet` by default"
- Implementation: `scripts/server-up.mjs`, `server/compose.yaml` (`TRANSPORT`)
- Verification: Owner check recorded in 0015 Context: a LAN client joined BDS 1.26.52.3 over NetherNet through `pnpm server:up` on Apple Silicon. Not verified: no test covers `server-up.mjs` or `compose.yaml`; no check at `fd83ec4e` or on a later BDS version.

### Raknet fallback

- Applies to: the dev BDS, while BDS still ships raknet.
- Rule: `BDS_TRANSPORT=raknet pnpm server:up` starts the server on raknet; `scripts/server-up.mjs` then passes an empty `BDS_UDP_PORTS`, so `SERVER_UDP_PORTS` is empty in `server/compose.yaml`.
- Agreement: Accepted
- Basis: [0015](../adr/0015-dev-server-docker-nethernet.md) Decision, "Keep raknet as a fallback while BDS still ships it: `BDS_TRANSPORT=raknet pnpm server:up`"
- Implementation: `scripts/server-up.mjs`, `server/compose.yaml` (`ports`)
- Verification: Not verified: no test, and no owner check of the raknet path is recorded in 0015.

### NetherNet address advertising

- Applies to: the dev BDS with `BDS_TRANSPORT=nethernet`, which is the default.
- Rule: `scripts/server-up.mjs` passes `<LAN IP>:<UDP_RANGE>:<UDP_RANGE>` to the container as `BDS_UDP_PORTS`, which `server/compose.yaml` hands to BDS as `SERVER_UDP_PORTS`. The LAN IP is `BDS_LAN_IP` when set, otherwise the host's only non-internal IPv4 address; with zero or several such addresses the script exits and asks for `BDS_LAN_IP`. BDS accepts only an IP literal there, never a hostname. When the host's LAN IP changes, restart the server so that clients are told the new address.
- Agreement: Accepted
- Basis: [0015](../adr/0015-dev-server-docker-nethernet.md) Consequences, "When the Mac's LAN IP changes, restart the server so that clients are told the new address"; [0015](../adr/0015-dev-server-docker-nethernet.md) Decision, "The LAN IP comes from `BDS_LAN_IP`, or from the Mac's only non-internal IPv4 address; with zero or several addresses it stops and asks for `BDS_LAN_IP`."
- Implementation: `scripts/server-up.mjs` (`UDP_RANGE`, `lanAddresses`), `server/compose.yaml` (`SERVER_UDP_PORTS`)
- Verification: Owner check recorded in 0015 Context (a LAN client joined over NetherNet, `GET /v1/join` on the LAN IP answered 200). Not verified: no test; the several-addresses and zero-addresses exits; a changed LAN IP after restart.

### Published ports and network mode

- Applies to: `server/compose.yaml`, for either transport.
- Rule: The compose file publishes TCP 19132 for NetherNet signaling, the UDP range that equals `UDP_RANGE` in `scripts/server-up.mjs` (one port per client), and UDP 19132 for raknet. The container uses `network_mode: bridge`.
- Agreement: Accepted
- Basis: [0015](../adr/0015-dev-server-docker-nethernet.md) Decision, "`server/compose.yaml` publishes TCP 19132 (signaling) and UDP 19140-19155 (one port per client), plus UDP 19132 for raknet"
- Implementation: `server/compose.yaml` (`ports`, `network_mode`), `scripts/server-up.mjs` (`UDP_RANGE`)
- Verification: Not verified: no test checks that the compose range and `UDP_RANGE` agree.

### Pack mounts and reload

- Applies to: the dev BDS, when a pack changes.
- Rule: `server/compose.yaml` mounts `packs/yasu_ride_bp`, `packs/yasu_ride_test_bp` and `packs/yasu_ride_rp` read-only into the container (plus `./data` as `/data`). Nothing in the scripts distinguishes script-only from entity or Resource Pack changes; the `/reload` versus restart guidance is only documentation in `AGENTS.md` (Bedrock gotchas).
- Agreement: Accepted
- Basis: [0015](../adr/0015-dev-server-docker-nethernet.md) Decision, "Carried over from 0011: mount the repository's Behavior Pack and Resource Pack directories into the container; apply script-only changes with `/reload` and restart the server for entity definition or Resource Pack changes"
- Implementation: `server/compose.yaml` (`volumes`), `AGENTS.md` (Bedrock gotchas)
- Verification: Not verified: no test; no owner check is recorded.

### World data stays out of git

- Applies to: the dev world and every generated dev file under `server/data/`.
- Rule: `server/data/` is ignored by git and holds the dev world, the version counter, and the generated manifests.
- Agreement: Accepted
- Basis: [0015](../adr/0015-dev-server-docker-nethernet.md) Decision, "keep world data (`server/data/`) out of git"
- Implementation: `.gitignore` (`server/data/`)
- Verification: Not verified: no test checks the ignore entry.

### Resource Pack version bump on change

- Applies to: the committed Resource Pack manifest, at release time.
- Rule: `scripts/check-rp-version.mjs` (`checkResourcePackVersion`) fails when `packs/yasu_ride_rp` differs from the previous release tag but has the same version; `.github/workflows/release.yml` runs it on a `v*` tag push or a manual run, not on pull requests. `scripts/package.mjs` fails when the Behavior Pack's dependency version on the Resource Pack differs from the Resource Pack version, and also when the Resource Pack's dependency on the Behavior Pack differs from the Behavior Pack version.
- Agreement: Accepted
- Basis: [0015](../adr/0015-dev-server-docker-nethernet.md) Decision, "bump the Resource Pack manifest version when it changes, or devices keep their cached copy"
- Implementation: `scripts/check-rp-version.mjs` (`checkResourcePackVersion`), `.github/workflows/release.yml`, `scripts/package.mjs`
- Verification: `tests/scripts/checkRpVersion.test.ts` (rejects changed packs with equal versions, accepts a bumped or unchanged pack, skips an absent previous release). Not verified: a pull request that changes the Resource Pack without a bump is not checked before release.

### Fresh dev-only pack version

- Applies to: the Resource Pack and the Behavior Pack's dependency on it, as served by the dev BDS.
- Rule: Every `pnpm server:up` and `pnpm server:restart` runs `scripts/setup-dev-world.mjs`, which serves the Resource Pack under `[major, minor, DEV_PATCH_BASE + counter]`. Major and minor come from the committed Resource Pack manifest. The counter is read from `server/data/dev-pack-version.json`, goes up by one on every run, and starts at 1 when the file is missing or unreadable. Rewritten manifests go to `server/data/dev-manifests/`: the Resource Pack header version and every module version change, and only the Behavior Pack's dependency on the Resource Pack (`RESOURCE_PACK_UUID`) changes. The committed `packs/*/manifest.json` files are never rewritten.
- Agreement: Accepted
- Basis: [0062](../adr/0062-fresh-dev-pack-version-on-every-start.md) Decision, "The dev version is `[major, minor, 10000 + counter]`: major and minor from the committed Resource Pack manifest, and a counter in `server/data/dev-pack-version.json` that goes up by one on every run."
- Basis: [0062](../adr/0062-fresh-dev-pack-version-on-every-start.md) Decision, "The committed `packs/*/manifest.json` files are never changed to serve the dev BDS"
- Implementation: `scripts/dev-pack-version.mjs` (`DEV_PATCH_BASE`, `readCounter`, `devPackVersion`, `rewriteResourcePack`, `rewriteBehaviorPack`, `writeDevManifests`), `scripts/setup-dev-world.mjs`
- Verification: `tests/scripts/devPackVersion.test.ts` (patch at or above `DEV_PATCH_BASE`; each run is greater than the previous; missing or corrupt state starts from zero; the Resource Pack rewrite changes only versions; the Behavior Pack rewrite changes only the Resource Pack dependency; the counter counts up from 1 and the two manifests agree; the committed manifest is untouched). Not verified: a device actually re-downloading the pack after a restart; two checkouts serving the same device (0062 Consequences).

### Generated manifests are what the world and the container use

- Applies to: the dev world registration and the container's pack manifests.
- Rule: `world_resource_packs.json` and `world_behavior_packs.json` are written from the same generated manifests that the container serves; the test Behavior Pack, which does not depend on the Resource Pack, is registered with its committed version. `server/compose.yaml` mounts the two generated manifests read-only over the packs' `manifest.json` files with `create_host_path: false`, so `docker compose up` fails when they were not generated.
- Agreement: Accepted
- Basis: [0062](../adr/0062-fresh-dev-pack-version-on-every-start.md) Decision, "The world's `world_resource_packs.json` and `world_behavior_packs.json` are written from the same generated manifests, so the world registration and the served packs always agree"
- Basis: [0062](../adr/0062-fresh-dev-pack-version-on-every-start.md) Decision, "They set `create_host_path: false`, so `docker compose up` fails when the manifests were not generated instead of mounting an empty directory"
- Implementation: `scripts/setup-dev-world.mjs`, `server/compose.yaml` (`volumes`)
- Verification: `tests/scripts/devPackVersion.test.ts` checks that the written Resource Pack and Behavior Pack manifests agree. Not verified: the world registration files, the compose mounts, and the failure on missing manifests have no test.

### Restart through the script

- Applies to: restarting the dev BDS after any pack change.
- Rule: `pnpm server:restart` runs `docker compose -f server/compose.yaml down` and then the `pnpm server:up` flow. A restart done with `docker restart` or `docker compose restart` keeps the previous dev version. `AGENTS.md` (Bedrock gotchas) documents restarting through `pnpm server:restart` and starting through `pnpm server:up` rather than `docker compose up` alone; the scripts do not enforce this guidance.
- Agreement: Accepted
- Basis: [0062](../adr/0062-fresh-dev-pack-version-on-every-start.md) Decision, "`pnpm server:restart` runs `docker compose -f server/compose.yaml down` and then the `pnpm server:up` flow."
- Basis: [0062](../adr/0062-fresh-dev-pack-version-on-every-start.md) Decision, "Restarts go through it, not `docker restart`, so the version goes up"
- Implementation: `package.json` (`server:up`, `server:restart`, `server:down`), `AGENTS.md` (Bedrock gotchas)
- Verification: Not verified: no test covers the scripts.

### Realm installation

- Applies to: playing on a Realm, which has no server folder and no console.
- Rule: A Realm is installed by applying `yasu_ride_bp` and `yasu_ride_rp` to a world on a device and uploading that world; `yasu_ride_test_bp` is never applied. The `.mcaddon` built by `scripts/package.mjs` contains only those two packs. The in-game tests cannot run on a Realm, so Realm behavior is checked by hand.
- Agreement: Proposed
- Basis: [0179](../adr/0179-support-realms-as-a-second-play-environment.md) Decision, "Install on a Realm by applying `yasu_ride_bp` and `yasu_ride_rp` (never `yasu_ride_test_bp`) to a world on a device and uploading that world to the Realm"
- Basis: [0179](../adr/0179-support-realms-as-a-second-play-environment.md) Consequences, "The in-game tests cannot run on a Realm, so Realm behavior is checked by hand only"
- Implementation: `docs/installing-on-a-realm.md`, `scripts/package.mjs`
- Verification: Not verified: the acceptance condition of 0179 (one manual pass on a Realm with the checks in `docs/installing-on-a-realm.md`, with date and client versions recorded in the ADR) has not been met; no test covers the package contents.

### Realm compatibility

- Applies to: any change to the Behavior Pack's script dependencies or to the commands the scripts run.
- Rule: `packs/yasu_ride_bp/manifest.json` depends on the script modules `@minecraft/server` and `@minecraft/server-ui`; no file under `src`, `tests` or `scripts` imports `@minecraft/server-admin` or `@minecraft/server-net`; no automated check enforces this and no ADR-on-change step is enforced. `README.md` names a Realm as a target setup.
- Agreement: Proposed
- Basis: [0179](../adr/0179-support-realms-as-a-second-play-environment.md) Decision, "Do not add a dependency on a module or a command that a Realm lacks."
- Basis: [0179](../adr/0179-support-realms-as-a-second-play-environment.md) Decision, "Treat a Realm as a supported play environment beside the home LAN BDS."
- Implementation: `packs/yasu_ride_bp/manifest.json` (`dependencies`), `src/`, `tests/`, `scripts/`, `README.md`; no automated check or ADR-on-change step.
- Verification: Not verified: no automated check rejects an import of `@minecraft/server-admin` or `@minecraft/server-net`, and no Realm run is recorded.

## Open issues

- ADR 0179 says "The Behavior Pack's only script dependency is the stable `@minecraft/server`"; the implementation also depends on `@minecraft/server-ui` (`packs/yasu_ride_bp/manifest.json`); the ADR needs an edit or a superseding ADR.
- ADR 0179 says it is Proposed with acceptance pending a manual Realm pass recorded in the ADR; the implementation names a Realm as a target setup beside the home LAN BDS (`README.md`); the ADR needs an edit or a superseding ADR.
- ADR 0015 says `pnpm server:up` sets `server-udp-ports`; the implementation runs `docker compose up` after `scripts/setup-dev-world.mjs` in CI, which `AGENTS.md` (Bedrock gotchas) says not to do alone, leaving `BDS_UDP_PORTS` unset and NetherNet with no advertised address (`.github/workflows/integration-test.yml`); ADR 0062 Consequences already records that the CI in-game tests run `scripts/setup-dev-world.mjs` before `docker compose up`, as before; the ADR needs an edit or a superseding ADR.
- ADR 0015 says to bump the Resource Pack manifest version whenever the pack changes, as does `AGENTS.md`; the implementation checks against the previous release tag on a `v*` tag push or a manual release run, not on pull requests (`scripts/check-rp-version.mjs`, `.github/workflows/release.yml`); the ADR needs an edit or a superseding ADR.
- ADR 0015 says to mount the Behavior Pack and Resource Pack directories; the implementation also mounts `packs/yasu_ride_test_bp` (`server/compose.yaml`); the ADR needs an edit or a superseding ADR. ADR 0062 mentions the test pack only as served as committed.
- ADR 0015 says the raknet fallback and its UDP mapping are dropped once a stable BDS release removes raknet; the implementation has no removal step or check (`scripts/server-up.mjs`, `server/compose.yaml` publishes UDP 19132 always); the ADR needs an edit or a superseding ADR.
- ADR 0179 says a change that needs a module or command a Realm lacks adds an ADR and that no such dependency is added; the implementation enforces neither (no check; `packs/yasu_ride_bp/manifest.json`); the ADR needs an edit or a superseding ADR, or a check.
- `.github/workflows/integration-test.yml` cites ADR 0011 for `server/compose.yaml` (line 16); 0011 is superseded in full by 0015 and the spec excludes it; the workflow comment needs an edit to cite 0015.
