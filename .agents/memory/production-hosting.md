---
name: Production hosting
description: Confirmed live hosting target and distinction from the Replit workspace.
---

Production is hosted on a Hostinger VPS.

**Why:** The user explicitly confirmed the production host.

**How to apply:** Verify production runtime and service details on the VPS; do not infer live versions or deployment behavior from the Replit workspace.

The VPS hosts multiple PM2-managed applications behind Nginx. Scope app runtime upgrades to this application's interpreter and process rather than replacing a shared runtime or restarting every app.

**Why:** The provided VPS inventory showed several PM2 app processes; this project’s changes must not disrupt the other applications.

**How to apply:** Inventory each relevant executable before rollout and prefer staged, app-specific runtime changes. Treat patching other hosted apps as separate work requiring approval.
