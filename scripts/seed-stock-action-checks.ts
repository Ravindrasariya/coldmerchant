import assert from "node:assert/strict";

interface ActionChecks {
  entryId: number;
  readOnlyUsername: string;
  evaluate: <T = any>(expression: string) => Promise<T>;
  waitFor: <T>(description: string, read: () => Promise<T>, ready: (value: T) => boolean) => Promise<T>;
  click: (id: string) => Promise<void>;
  cdp: (method: string, params?: Record<string, unknown>) => Promise<any>;
  setViewport: (width: number, height: number, mobile: boolean) => Promise<void>;
  saveScreenshot: (name: string) => Promise<void>;
  loginAs: (username: string) => Promise<void>;
  goToRegister: () => Promise<void>;
}

export async function checkSeedStockActions({
  entryId, readOnlyUsername, evaluate, waitFor, click, cdp,
  setViewport, saveScreenshot, loginAs, goToRegister,
}: ActionChecks) {
  await cdp("Page.addScriptToEvaluateOnNewDocument", { source: `
    window.print = () => { window.top.__seedPrinted = (window.top.__seedPrinted || 0) + 1; };
    Object.defineProperty(navigator, "canShare", { configurable: true, value: () => true });
    Object.defineProperty(navigator, "share", { configurable: true, value: async payload => {
      window.__seedShared = payload.files.map(file => file.name);
    }});
    const nativeClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {
      if (this.download.endsWith(".pdf")) { window.__seedDownloaded = this.download; return; }
      return nativeClick.call(this);
    };
  ` });
  await cdp("Page.reload");
  await waitFor("signed-in navigation", () => evaluate<boolean>('!!document.querySelector("[data-testid=\\"tab-seed\\"]")'), Boolean);
  await click("tab-seed");
  await goToRegister();
  await waitFor("stock card", () => evaluate<boolean>(`!!document.querySelector('[data-testid="button-seed-edit-${entryId}"]')`), Boolean);

  const assertLayout = async (hasDelete: boolean) => {
    const positions = await evaluate<any>(`(() => {
      const edit = document.querySelector('[data-testid="button-seed-edit-${entryId}"]');
      edit.scrollIntoView({ block: "center" });
      const del = document.querySelector('[data-testid="button-seed-delete-${entryId}"]');
      const print = document.querySelector('[data-testid="button-seed-print-${entryId}"]');
      const rect = element => {
        if (!element) return null;
        const r = element.getBoundingClientRect();
        return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right };
      };
      return { edit: rect(edit), del: rect(del), print: rect(print),
        sameRow: del ? edit.parentElement === del.parentElement : true,
        deleteText: del?.textContent.trim(), deleteLabel: del?.getAttribute("aria-label"), viewport: innerWidth };
    })()`);
    assert.equal(positions.sameRow, true);
    assert.equal(positions.edit.height, 32);
    assert.ok(positions.print.y >= positions.edit.y + 32);
    assert.equal(positions.print.x, positions.edit.x);
    assert.ok(positions.print.right <= positions.viewport);
    if (hasDelete) {
      assert.ok(positions.del);
      assert.equal(positions.del.y, positions.edit.y);
      assert.ok(positions.del.x > positions.edit.x);
      assert.equal(positions.del.width, 32);
      assert.equal(positions.del.height, 32);
      assert.equal(positions.deleteText, "");
      assert.ok(positions.deleteLabel);
      assert.ok(positions.del.right <= positions.viewport);
    } else assert.equal(positions.del, null);
  };

  for (const [width, height, mobile] of [[1365, 1000, false], [390, 844, true]] as const) {
    await setViewport(width, height, mobile);
    if (mobile) {
      await cdp("Emulation.setUserAgentOverride", { userAgent: "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36" });
    }
    await assertLayout(true);
    await saveScreenshot(`seed-actions-${mobile ? "phone" : "desktop"}.png`);
    await click(`button-seed-edit-${entryId}`);
    await waitFor("edit opens", () => evaluate<boolean>('!!document.querySelector("[data-testid=\\"button-seed-edit-cancel\\"]")'), Boolean);
    await click("button-seed-edit-cancel");
    await waitFor("edit closes", () => evaluate<boolean>('!document.querySelector("[data-testid=\\"button-seed-edit-cancel\\"]")'), Boolean);
    await click(`button-seed-delete-${entryId}`);
    await waitFor("delete confirmation", () => evaluate<boolean>('!!document.querySelector("[data-testid=\\"dialog-delete-seed-stock-entry\\"]")'), Boolean);
    await click("button-cancel-delete-seed-stock-entry");
    await waitFor("delete cancelled", () => evaluate<boolean>('!document.querySelector("[data-testid=\\"dialog-delete-seed-stock-entry\\"]")'), Boolean);
    await click(`button-seed-print-${entryId}`);
    await waitFor("print menu", () => evaluate<boolean>(`!!document.querySelector('[data-testid="button-seed-print-bill-${entryId}"]')`), Boolean);
    assert.equal(await evaluate<boolean>(`!!document.querySelector('[data-testid="button-seed-share-bill-${entryId}"]')`), true);
    await click(`button-seed-print-bill-${entryId}`);
    await waitFor("receipt printing", () => evaluate<number>("window.__seedPrinted || 0"), count => count >= (mobile ? 2 : 1));
    await click(`button-seed-print-${entryId}`);
    await click(`button-seed-share-bill-${entryId}`);
    if (mobile) {
      await waitFor("receipt sharing", () => evaluate<string[]>("window.__seedShared || []"), files => files.some(file => file.endsWith(".pdf")));
    } else {
      await waitFor("desktop receipt PDF download", () => evaluate<string>("window.__seedDownloaded || ''"), name => name.endsWith(".pdf"));
    }
  }

  await setViewport(1365, 1000, false);
  await evaluate('fetch("/api/logout", { method: "POST", credentials: "include" })');
  await loginAs(readOnlyUsername);
  await goToRegister();
  await waitFor("read-only stock card", () => evaluate<boolean>(`!!document.querySelector('[data-testid="button-seed-edit-${entryId}"]')`), Boolean);
  for (const [width, height, mobile] of [[1365, 1000, false], [390, 844, true]] as const) {
    await setViewport(width, height, mobile);
    await assertLayout(false);
  }
  console.log("Seed action checks passed: desktop/phone placement, icon accessibility, edit/cancel, delete/cancel, print PDF, share PDF, and read-only visibility.");
}