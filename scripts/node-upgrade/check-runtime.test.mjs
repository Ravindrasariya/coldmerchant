import { test } from "node:test";
import assert from "node:assert/strict";
import { assertPatchedRuntime } from "./check-runtime.mjs";

for (const version of ["v22.23.4", "22.23.5", "22.24.0", "24.22.1", "24.23.0", "26.12.1"]) {
  test(`accept patched runtime ${version}`, () => assert.equal(assertPatchedRuntime(version), version));
}
for (const version of ["20.20.2", "22.22.0", "22.23.3", "24.13.0", "24.22.0", "26.12.0", "23.99.0", "28.0.0", "22.23.4-rc.1", "invalid"]) {
  test(`reject unsafe or unverified runtime ${version}`, () => assert.throws(() => assertPatchedRuntime(version)));
}
