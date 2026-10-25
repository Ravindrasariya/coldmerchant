---
name: Uploaded asset tracking
description: Workspace asset presence is not proof that a Git checkout contains required app images.
---

Do not assume uploaded assets remain tracked merely because they still render in Replit. A merge-adjacent snapshot has removed tracked uploads while leaving all local bytes intact; the underlying actor was not established.

**Why:** This environment has a system-wide Git exclude for `attached_assets/*`. Ignore rules alone do not untrack existing files, but once another operation removes them from the index, ordinary staging will not automatically add them back. Reference uploads and actual imported application images share that folder.

**How to apply:** Before advising a full push, compare tracked asset paths with application imports and check the effective global excludes. Keep essential app images in a deliberately tracked application asset location or explicitly track them. Do not claim automatic post-task cleanup as the cause without execution evidence.
