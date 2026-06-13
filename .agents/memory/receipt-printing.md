---
name: Receipt printing mechanism
description: Why all receipt dialogs print via a hidden iframe instead of window.open
---

# Receipt printing must use a hidden iframe, not window.open

All four receipt dialogs (harvest bill, harvest sales, seed bill, seed sales) print
through the shared helper `client/src/lib/print-receipt.ts` → `printHtmlDocument(html)`,
which writes the receipt HTML into a hidden same-page `<iframe>` and calls
`iframe.contentWindow.print()`.

**Why:** These dialogs trigger printing from a `useEffect`/auto-action that runs only
*after* merchant data and the header image finish loading — i.e. detached from the
user's click. `window.open("", "_blank")` is silently blocked by popup blockers when
not called synchronously inside a user gesture, producing a blank page / nothing
printed. This was especially bad on the live custom domain where the header-image
fetch always adds delay. An iframe needs no popup permission, so it works everywhere.

**How to apply:** Never reintroduce `window.open` for printing. Build the full HTML
string and pass it to `printHtmlDocument`. The helper waits for images (and
`document.fonts.ready` when available) before printing, drives iframe teardown from
the `afterprint` event with a long safety fallback, and guards against double-print.
Keep the existing "wait for merchant/header image" guards in each dialog's handlePrint.
