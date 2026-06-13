/**
 * Print an HTML document via a hidden same-page iframe.
 *
 * This avoids `window.open`, which browsers block when it isn't called
 * synchronously inside a user gesture (our receipts trigger printing from a
 * useEffect after data/images load, so the popup blocker would otherwise leave
 * a blank window or print nothing). An iframe needs no popup permission.
 *
 * Waits for images (and fonts, when supported) to load before printing, then
 * removes the iframe once printing finishes (driven by `afterprint`, with a
 * generous safety fallback so a stray iframe can never linger).
 */
export function printHtmlDocument(html: string): void {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = win?.document;
  if (!win || !doc) {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
    return;
  }

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
  };

  // `afterprint` fires when the print dialog closes — the safest moment to
  // remove the iframe. A long fallback guarantees cleanup even when the event
  // never fires (some browsers/print drivers skip it).
  win.onafterprint = cleanup;
  setTimeout(cleanup, 60000);

  let printed = false;
  const triggerPrint = () => {
    if (printed) return;
    printed = true;
    try {
      win.focus();
      win.print();
    } catch {
      cleanup();
    }
  };

  doc.open();
  doc.write(html);
  doc.close();

  const printAfterAssetsReady = () => {
    const fonts = (doc as Document & { fonts?: { ready?: Promise<unknown> } }).fonts;
    const ready = fonts?.ready;
    // Wait a paint cycle so layout settles, then print.
    const finish = () => win.requestAnimationFrame(() => triggerPrint());
    if (ready && typeof ready.then === "function") {
      ready.then(finish).catch(finish);
    } else {
      finish();
    }
  };

  const imgs = Array.from(doc.images);
  if (imgs.length === 0) {
    printAfterAssetsReady();
    return;
  }

  let remaining = imgs.length;
  const onSettled = () => {
    remaining -= 1;
    if (remaining <= 0) printAfterAssetsReady();
  };
  imgs.forEach((img) => {
    if (img.complete) {
      onSettled();
    } else {
      img.addEventListener("load", onSettled);
      img.addEventListener("error", onSettled);
    }
  });

  // Fallback: print even if an image never resolves (slow/broken network).
  setTimeout(triggerPrint, 5000);
}
