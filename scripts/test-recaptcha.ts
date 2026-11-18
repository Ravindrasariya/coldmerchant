import assert from "node:assert/strict";
import express from "express";
import { once } from "node:events";
import { captchaLoginGuard, getRecaptchaConfig, verifyCaptcha } from "../server/recaptcha";

// Synthetic fixture values only. No live keys, passwords, sessions or database.
const enabled = {
  NODE_ENV: "production",
  RECAPTCHA_SITE_KEY: "fixture-public-key",
  RECAPTCHA_SECRET_KEY: "fixture-private-key",
};
let checked = 0;
const success: typeof fetch = async (url, options) => {
  checked++;
  assert.equal(url, "https://www.google.com/recaptcha/api/siteverify");
  assert.equal(options?.method, "POST");
  const body = options?.body as URLSearchParams;
  assert.equal(body.get("secret"), enabled.RECAPTCHA_SECRET_KEY);
  assert.equal(body.get("response"), "fixture-token");
  assert.ok(options?.signal);
  return Response.json({ success: true });
};
const failure: typeof fetch = async () => Response.json({ success: false });
const offline: typeof fetch = async () => { throw new Error("offline"); };

async function login(
  env: Parameters<typeof captchaLoginGuard>[0],
  token?: unknown,
  fetcher: typeof fetch = success,
) {
  const app = express();
  app.use(express.json());
  app.post("/api/login", captchaLoginGuard(env, fetcher), (_req, res) => {
    res.json({ reachedPasswordCheck: true });
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const response = await fetch(`http://127.0.0.1:${address.port}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ captchaToken: token }),
    });
    return { status: response.status, body: await response.json() };
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
  }
}

async function main() {
  assert.deepEqual(getRecaptchaConfig({ NODE_ENV: "production" }), { siteKey: null, required: false });
  assert.deepEqual(getRecaptchaConfig(enabled), { siteKey: "fixture-public-key", required: true });
  assert.ok(!JSON.stringify(getRecaptchaConfig(enabled)).includes("private-key"));
  assert.equal((await login({ NODE_ENV: "production" }, undefined, offline)).status, 200);
  assert.equal((await login({ ...enabled, NODE_ENV: "development" }, undefined, offline)).status, 200);
  assert.equal(checked, 0, "disabled CAPTCHA must not contact Google");
  for (const token of [undefined, null, "", "   ", 42, {}, ["fixture-token"], "x".repeat(8193)]) {
    const result = await login(enabled, token);
    assert.equal(result.status, 400);
    assert.equal(result.body.message, "CAPTCHA verification required");
    assert.equal(result.body.reachedPasswordCheck, undefined);
  }
  assert.equal(checked, 0, "bad tokens must not reach Google or password validation");
  assert.equal((await login(enabled, " fixture-token ")).status, 200);
  assert.equal(checked, 1);
  assert.equal((await login(enabled, "fixture-token", failure)).status, 403);
  assert.equal((await login(enabled, "fixture-token", offline)).status, 403);
  assert.equal((await login({ ...enabled, RECAPTCHA_SITE_KEY: "" }, "fixture-token")).status, 503);
  assert.equal(await verifyCaptcha("fixture-token", "fixture-secret", async () => new Response("", { status: 503 })), false);
  assert.equal(await verifyCaptcha("fixture-token", "fixture-secret", async () => new Response("not JSON")), false);
  for (const value of [null, {}, { success: "true" }, { success: 1 }]) {
    assert.equal(await verifyCaptcha("fixture-token", "fixture-secret", async () => Response.json(value)), false);
  }
  let used = false;
  const singleUse: typeof fetch = async () => {
    if (used) return Response.json({ success: false, "error-codes": ["timeout-or-duplicate"] });
    used = true;
    return Response.json({ success: true });
  };
  assert.equal((await login(enabled, "fixture-token", singleUse)).status, 200);
  assert.equal((await login(enabled, "fixture-token", singleUse)).status, 403);
  console.log("PASS: optional/development bypass, public-only config, malformed/missing tokens, verification ordering, success, rejection, network/HTTP/JSON errors, incomplete configuration and replay rejection.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
