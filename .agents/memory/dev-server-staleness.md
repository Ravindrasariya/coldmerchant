---
name: Dev server staleness vs Vite HMR
description: Why server-side changes can silently do nothing in dev while the UI appears to update, and how to rule it out first.
---

# Symptom

A feature's UI reacts correctly (checkbox ticks, computed previews update) but nothing
persists. Reopening a dialog shows stale values, and the saved record keeps its old numbers.
Reading the client code suggests a form/state bug, and fixes made from that reading change
nothing.

# Rule

Before debugging save/persistence logic that "should work", confirm the running server is
actually executing the current code. Compare the server process start time against the mtime
of the server files involved:

```
ps -eo pid,lstart,cmd | grep server/index.ts
stat -c '%y %n' shared/schema.ts server/routes.ts
```

If a server file is newer than the process, the server is stale and every server-side change
since then is inert.

**Why:** Vite HMR reloads only the client bundle. A dev server run as plain
`tsx server/index.ts` (no `watch`) never reloads. This produces a uniquely misleading split:
client behaviour is current, server behaviour is an hour old, so the UI "works" and the save
silently doesn't. Diagnosing this from code reading alone is close to impossible — it looks
exactly like a client state bug.

**How to apply:** Applies to any dev run command without a watch flag. The permanent fix is
`tsx watch server/index.ts`. Verify watch actually works by touching a server file and
confirming the child PID's start time changes — the wrapper process keeps its original start
time, so check the child running `server/index.ts`, not the `tsx watch` parent.

# Corroborating tell

A stale server's in-memory Drizzle table definition lacks any newly added column, so
`select()` omits it and the JSON response has **no key at all** for that field (not `null`,
not `false` — absent). A field present in `shared/schema.ts` but missing from the API
response is a strong staleness signal, not a serialization bug.

# Related trap

Workflow logs are cursor-drained snapshots, often only tens of lines. `grep -c "PATCH"`
returning 0 across them does **not** prove a request never fired. Confirm request history
against durable state (an edit-history/audit table) rather than log absence.
