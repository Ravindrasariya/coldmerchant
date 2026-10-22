---
name: Production hosting
description: Confirmed live hosting target and distinction from the Replit workspace.
---

Production is hosted on a Hostinger VPS.

**Why:** The user explicitly confirmed the production host.

**How to apply:** Verify production runtime and service details on the VPS; do not infer live versions or deployment behavior from the Replit workspace.

The VPS hosts multiple PM2-managed applications behind Nginx. The user now wants step-by-step guidance for a coordinated runtime upgrade covering all hosted apps in one maintenance window, with rollback if checks fail.

**Why:** After the isolated Replit checks, the user explicitly broadened the requested approach from Vyapar Vriddhi alone to all apps sharing the VPS.

**How to apply:** Refresh the full inventory, review command batches with the user, preserve each app's recovery assets, and check apps sequentially within the coordinated window. This request for guidance is not approval for immediate downtime or destructive actions.

For PM2 cluster-mode apps, a per-app interpreter setting is insufficient to change the worker runtime: cluster workers use their manager's Node runtime.

**Why:** The VPS uses cluster mode for this application; PM2 documentation, maintainer guidance, and its cluster implementation confirm this limitation.

**How to apply:** Verify the manager and worker executable versions. Isolate the manager if migrating only this application, or obtain separate approval for a shared-manager migration. Do not silently replace cluster mode with fork mode.

Vyapar Vriddhi passed isolated patched-runtime checks in Replit. The user prefers considering a controlled live VPS maintenance window with rollback instead of a separate VPS staging deployment.

**Why:** The user requested the coordinated live approach after discussing the downtime and database rollback limitations.

**How to apply:** Keep Replit results distinct from unverified Hostinger behavior and other apps. Before a live switch, confirm write inactivity, assess startup writers, verify recovery, and obtain maintenance approval; verify Ubuntu, PM2, Nginx and boot settings.

Available runtime modules can lag an advisory's patched minimum even when the major version is supported.

**Why:** The module catalog offered versions below the verified October 2026 patch baseline. The checksummed official side-by-side binary worked without replacing the preview runtime.

**How to apply:** Verify the actual candidate executable against the current advisory. Do not label a module secure based only on its major version, or change production configuration before candidate validation.

Daily database backups already exist, according to the user.

**Why:** The user stated this while discussing recovery for the coordinated VPS runtime upgrade.

**How to apply:** Inspect the existing backup arrangement before proposing another system. Coverage, location, latest success and restorability are not yet verified; do not assume these backups include every app or uploaded files.
