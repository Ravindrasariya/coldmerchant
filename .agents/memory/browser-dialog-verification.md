---
name: Browser dialog verification
description: Avoid false failures caused by programmatic clicks bypassing modal layers during signed-in browser tests.
---

Verify modal workflows with visible, unobstructed controls and explicitly wait
for the intended dialog to close before clicking background navigation.

**Why:** A DOM click can activate a background control that a real user's pointer
cannot reach. Escape may close a different topmost layer, leaving a modal overlay
that later prevents tab navigation. This can look like an application regression
when the browser test actually navigated through an impossible interaction.

**How to apply:** Use hit-tested pointer clicks for navigation, explicit dialog
cancel controls, and disappearance checks for the exact dialog being dismissed.