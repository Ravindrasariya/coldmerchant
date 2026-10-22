import assert from "node:assert/strict";

export function assertIsolatedRuntimeTest() {
  assert.equal(process.env.RUNTIME_UPGRADE_TEST, "1");
  const database = new URL(process.env.DATABASE_URL!);
  assert.equal(database.hostname, "127.0.0.1", "Runtime tests require a local disposable database");
  assert.equal(database.pathname, "/node_upgrade_test");
  const app = new URL(process.env.APP_URL!);
  assert.equal(app.hostname, "127.0.0.1", "Runtime tests must not target a published app");
  assert.equal(app.protocol, "http:");
}
