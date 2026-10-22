// Load only named dependencies, never an application entry point or .env file.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

assert.equal(process.version, "v22.23.4");
const packageFile = path.join(path.resolve(process.argv[2]), "package.json");
const require = createRequire(packageFile);
const pkg = JSON.parse(readFileSync(packageFile, "utf8"));
const dependencies = { ...pkg.devDependencies, ...pkg.optionalDependencies, ...pkg.dependencies };
const addon = require("node-gyp-build")(path.dirname(require.resolve("bufferutil/package.json")));
const original = Buffer.from("node-runtime-native-check");
const masked = Buffer.alloc(original.length);
const key = Buffer.from([1, 2, 3, 4]);
addon.mask(original, key, masked, 0, original.length);
addon.unmask(masked, key);
assert.deepEqual(masked, original);
console.log("PASS: native bufferutil mask/unmask round-trip.");
if (dependencies.sharp) {
  const sharp = require("sharp");
  const png = await sharp({
    create: { width: 2, height: 2, channels: 3, background: { r: 0, g: 0, b: 0 } },
  }).png().toBuffer();
  assert.ok(png.length > 0);
  console.log("PASS: sharp generated a small PNG in memory.");
}
