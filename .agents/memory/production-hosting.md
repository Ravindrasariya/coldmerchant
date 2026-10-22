---
name: Production hosting
description: Confirmed live hosting target and distinction from the Replit workspace.
---

Production is hosted on a Hostinger VPS.

**Why:** The user explicitly confirmed the production host.

**How to apply:** Verify production runtime and service details on the VPS; do not infer live versions or deployment behavior from the Replit workspace.

The VPS hosts multiple PM2-managed applications behind Nginx. Scope runtime changes to this application rather than replacing a shared runtime or restarting every app.

**Why:** The provided VPS inventory showed several PM2 app processes; this project’s changes must not disrupt the other applications.

**How to apply:** Inventory each relevant executable before rollout and prefer staged, app-specific runtime changes. Treat patching other hosted apps as separate work requiring approval.

For PM2 cluster-mode apps, a per-app interpreter setting is insufficient to change the worker runtime: cluster workers use their manager's Node runtime.

**Why:** The VPS uses cluster mode for this application; PM2 documentation, maintainer guidance, and its cluster implementation confirm this limitation.

**How to apply:** Verify the manager and worker executable versions. Isolate the manager if migrating only this application, or obtain separate approval for a shared-manager migration. Do not silently replace cluster mode with fork mode.

For the Node security upgrade, test compatibility in Replit first, then validate separately on Hostinger before an explicitly approved production switch.

**Why:** The user agreed to this order to keep the live app unchanged during testing.

**How to apply:** Use a verified patched runtime and isolated test database. Replit testing does not replace checks of Ubuntu, PM2 cluster behavior, Nginx, or boot persistence on the VPS.
