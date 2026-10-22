# Node.js security upgrade: test evidence and rollout boundary

## Status

This change prepares and tests an upgrade. **It does not patch production.**

The Hostinger inventory supplied on 2026-10-22 showed:

- Ubuntu 24.04, Linux x86_64; NodeSource's Node 20.x installation.
- Vyapar Vriddhi and five other applications using `/usr/bin/node` 20.20.0.
- A shared PM2 manager also running Node 20.20.0; Vyapar Vriddhi uses cluster mode.
- Nginx and PostgreSQL 16; no Docker command.

The normal Replit preview, default runtime configuration, package manifests,
application code, and dependency lockfile are intentionally unchanged.
Testing uses a side-by-side Node executable, not a module advertising an
unpatched version.

## Verified target and source

Replit verification completed on 2026-10-22: frozen clean install, 16 runtime
baseline unit cases, type checking, production build/startup, native addon
loading, Harvest API workflows, and all four Seed browser suites passed.
The Harvest fixture was corrected to follow existing API requirements and
rechecked against the same production bundle; no application fix was needed.
Desktop and phone Seed screenshots were inspected. Harvest checks cover API
behavior, not a separately verified Harvest browser/receipt workflow.

The October 21 advisory specifies these minimum patched releases:

| Release line | Minimum patch |
| --- | --- |
| 22 | 22.23.4 |
| 24 | 24.22.1 |
| 26 | 26.12.1 |

The compatibility candidate is **22.23.4**, the smallest major-version change
from the existing Node 20 runtime. This is an advisory baseline, not a claim
that these minimums will remain sufficient for future advisories. Re-check
current Node security releases before a later rollout.

- https://nodejs.org/en/blog/vulnerability/october-2026-security-releases
- https://nodejs.org/en/about/previous-releases
- https://pm2.keymetrics.io/docs/usage/cluster-mode/
- https://github.com/Unitech/pm2/issues/1575

The download helper verifies the official HTTPS release archive against its
official SHA-256 manifest before extraction and execution. It does not install
a global runtime, edit PATH, change services, or replace the system executable.

## Reproduce the Replit-only test

Run from the repository root in a Linux x86_64 Replit workspace with PostgreSQL
16 command-line tools and the existing Chromium test executable:

```bash
bash scripts/node-upgrade/fetch-runtime.sh
node scripts/node-upgrade/run-isolated.mjs \
  "$PWD/generated-artifacts/node-upgrade/runtime/node-v22.23.4-linux-x64/bin/node"
```

The bootstrap command can run under the existing Node 20; every compatibility
check and the test application's server use the explicit patched executable.
The runner:

1. Copies source and only the public images imported by the application into
   a temporary directory. It does not copy `.env`, uploads, or existing data.
2. Uses an allowlisted child environment, a generated temporary session key,
   and a fresh loopback-only PostgreSQL cluster. It does not inherit database
   connections, admin passwords, or production credentials.
3. Runs a frozen clean install including build dependencies, checks that the
   lockfile did not change, type-checks, builds, and loads native `bufferutil`.
4. Applies the schema only to the disposable database and starts the production
   bundle on a separately allocated port. The existing preview stays running.
5. Checks Harvest stock/loading, COGS/P&L, inventory restoration, dashboard/books,
   and authentication. Existing browser suites cover Seed stock edit/delete
   safety, English/Hindi sold-bag guards, merchant/read-only isolation, desktop
   and phone actions, receipt print/PDF share, cash/petty settlement and reversal.
6. Stops the test server and disposable PostgreSQL service and writes its report.

The tests emulate Nginx's trusted HTTPS forwarding header solely on loopback so
the unchanged production secure-session cookie path is exercised. This is not
an authentication bypass. Test-mode guards reject non-loopback app/database
targets. Browser receipt share tests intercept the OS share/download action;
no receipt is sent to a third party.

Reports and logs are under `generated-artifacts/node-upgrade/run-*` and excluded
from Git and deployment. The report records the candidate executable hash and
unchanged lockfile hash, plus each check's result. Temporary app/dependency and
database directories remain under `/tmp/vyapar-node-upgrade-*` for diagnosis;
their services are stopped after the run. They contain disposable test data only.

## Hostinger validation — not yet performed

A Replit pass does **not** verify Ubuntu native modules, the installed PM2 build,
Nginx upstreams, reboot behavior, resource availability, or a safe live cutover.

Before changing anything on the VPS:

- Confirm free disk/memory, the app's current upstream/port, instance count,
  graceful-shutdown behavior, PM2 boot persistence, and configuration location.
- Confirm that the VPS checkout/build being tested matches the intended release;
  Replit source and the currently deployed release need not be identical.
- Privately inventory required environment variables without pasting secrets
  into chat or copying production database credentials into a staging process.
- Confirm a recent database backup and its restoration procedure, plus retained
  application assets and the prior process/reverse-proxy configuration. Backups
  contain sensitive business data; keep them private on approved storage.
- Use a separate release/dependency directory, patched runtime, loopback port,
  isolated test database, and an isolated PM2 home/manager for staging.
- Preserve cluster mode. Its workers use the manager's Node runtime; a per-app
  interpreter flag alone is insufficient. Verify the actual manager and worker
  executables using `/proc`, not only PM2 metadata or shell `node --version`.
- Test the installed PM2 version under the patched runtime and establish a
  separate boot service without changing the existing `pm2-root` service.
- Ensure PM2 control commands explicitly address the intended PM2 home.
  Do not run `pm2 update`, `pm2 restart all`, or replace `/usr/bin/node`.

These are validation requirements, **not permission to execute a VPS rollout**.

## Production switch — requires separate explicit approval

Once staging passes, prepare app-specific commands using the confirmed paths,
ports, service names, backup location, and Nginx configuration. Do not substitute
guessed values into live commands.

1. Agree on a maintenance/cutover window and expected interruption. Cluster
   reload can fall back to restart; do not promise zero downtime.
2. Verify backup, recovery assets, and baseline health. Keep application code,
   schema, credentials, session secret, and financial rules unchanged.
3. Review startup backfills and scheduled jobs before starting the new process
   with production access. Do not overlap independent production managers or
   startup writers merely to attempt a zero-downtime switch.
4. Perform the controlled app-only process/traffic transition, validate the
   reverse-proxy configuration, and keep unrelated apps and their manager intact.
5. Persist the intended boot configuration and remove the old app from its old
   manager's saved resurrection configuration only after approved verification,
   so reboot cannot start duplicate copies of Vyapar Vriddhi.
6. Verify manager and worker executable versions, HTTPS login/session behavior,
   app health, logs, and read-only business checks. Verify boot persistence in a
   separately approved window; do not reboot the shared VPS without approval.

If checks fail, stop the new app/manager and restore the prior app-specific
process and proxy configuration in a controlled sequence. An application
rollback does not undo startup database writes. Restore data only with separate
authorization after assessing any business activity since the backup.

Rollback to Node 20 is an emergency recovery measure, not an acceptable finished
security state. Migrating only Vyapar Vriddhi leaves the other five applications
and shared PM2 manager unpatched; their remediation needs separate scope and
approval.
