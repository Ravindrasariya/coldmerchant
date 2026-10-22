// No inherited application credentials, existing DB access, or live preview changes.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { randomBytes, createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import net from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { assertPatchedRuntime } from "./check-runtime.mjs";

const root = resolve(import.meta.dirname, "../..");
const runtime = resolve(process.argv[2] || "");
if (!process.argv[2]) throw new Error("Pass the absolute path of the checksum-verified patched Node executable.");
const version = assertPatchedRuntime(execFileSync(runtime, ["--version"], { encoding: "utf8" }));
await mkdir(join(root, "generated-artifacts/node-upgrade"), { recursive: true });
const output = await mkdtemp(join(root, "generated-artifacts/node-upgrade/run-"));
const sandbox = await mkdtemp(join(tmpdir(), "vyapar-node-upgrade-"));
const source = join(sandbox, "app");
const pgdata = join(sandbox, "postgres");
const home = join(sandbox, "home");
await mkdir(source);
await mkdir(home);
const checks = [];
const sha256 = data => createHash("sha256").update(data).digest("hex");
const originalLockHash = sha256(await readFile(join(root, "package-lock.json")));
const port = () => new Promise((resolve, reject) => {
  const server = net.createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const result = server.address().port;
    server.close(error => error ? reject(error) : resolve(result));
  });
});
const dbPort = await port();
let appPort = await port();
while (appPort === dbPort) appPort = await port();
const env = {
  PATH: `${dirname(runtime)}:${process.env.PATH}`,
  HOME: home, LANG: "C.UTF-8", TZ: "Asia/Kolkata", TMPDIR: tmpdir(),
  DATABASE_URL: `postgresql://upgrade_test@127.0.0.1:${dbPort}/node_upgrade_test`,
  SESSION_SECRET: randomBytes(48).toString("hex"),
  PORT: String(appPort), APP_URL: `http://127.0.0.1:${appPort}`,
  NODE_ENV: "production", RUNTIME_UPGRADE_TEST: "1",
  CHROMIUM_PATH: "/repl/tools/bin/chromium",
};
// Only platform dynamic-linker configuration, never app secrets.
for (const key of ["LD_LIBRARY_PATH", "LD_AUDIT", "REPLIT_LD_LIBRARY_PATH", "REPLIT_RTLD_LOADER"]) {
  if (process.env[key]) env[key] = process.env[key];
}
const run = async (name, command, args, extra = {}) => {
  console.log(`[${version}] ${name}`);
  const log = createWriteStream(join(output, `${name}.log`));
  const child = spawn(command, args, { cwd: source, env: { ...env, ...extra }, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(log, { end: false });
  child.stderr.pipe(log, { end: false });
  let timedOut = false;
  const timeout = setTimeout(() => { timedOut = true; child.kill("SIGTERM"); }, 240_000);
  const code = await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  }).finally(() => { clearTimeout(timeout); log.end(); });
  checks.push({ name, passed: code === 0 && !timedOut, exitCode: code, timedOut });
  console.log(`${name}: ${code === 0 && !timedOut ? "PASS" : "FAIL"} (log: ${join(output, `${name}.log`)})`);
  return code === 0 && !timedOut;
};
const required = async (...args) => {
  if (!await run(...args)) throw new Error(`${args[0]} failed; see its log.`);
};
let postgresStarted = false;
let server;
let serverLog;
try {
  for (const name of ["client", "server", "shared", "script", "scripts", "package.json",
    "package-lock.json", "tsconfig.json", "vite.config.ts", "tailwind.config.ts",
    "postcss.config.js", "drizzle.config.ts"]) {
    await cp(join(root, name), join(source, name), { recursive: true });
  }
  // Only public image assets imported by source; never copy uploaded notices or .env.
  await mkdir(join(source, "attached_assets"));
  for (const name of ["Screenshot_2026-01-17_at_10.27.58_AM_1768625967467.png",
    "Gemini_Generated_Image_lu75dlu75dlu75dl(1)_1777315339846.png"]) {
    await cp(join(root, "attached_assets", name), join(source, "attached_assets", name));
  }
  const npm = resolve(dirname(runtime), "../lib/node_modules/npm/bin/npm-cli.js");
  // Frozen install in a disposable copy; does not update workspace dependencies.
  await required("clean-install", runtime, [npm, "ci", "--include=dev", "--no-audit", "--no-fund"]);
  assert.equal(sha256(await readFile(join(source, "package-lock.json"))), originalLockHash);
  await required("runtime-baseline-unit", runtime, ["--test", "scripts/node-upgrade/check-runtime.test.mjs"]);
  await required("typecheck", runtime, ["node_modules/typescript/bin/tsc", "--incremental", "false"]);
  await required("production-build", runtime, ["--import", "tsx", "script/build.ts"]);
  await required("native-bufferutil", runtime, ["--input-type=module", "-e",
    "import {createRequire} from 'node:module'; import path from 'node:path'; const require=createRequire(import.meta.url); const b=require('node-gyp-build')(path.dirname(require.resolve('bufferutil/package.json'))); if(typeof b.mask!=='function') throw Error('Native bufferutil failed'); console.log('bufferutil native binary loaded directly; no JS fallback');"]);
  await required("init-test-database", "initdb", ["-D", pgdata, "-U", "upgrade_test", "-A", "trust", "--no-locale"]);
  await required("start-test-database", "pg_ctl", ["-D", pgdata, "-l", join(output, "postgres.log"),
    "-o", `-h 127.0.0.1 -p ${dbPort} -k ${sandbox}`, "-w", "start"]);
  postgresStarted = true;
  await required("create-test-database", "createdb", ["-h", "127.0.0.1", "-p", String(dbPort), "-U", "upgrade_test", "node_upgrade_test"]);
  await required("test-schema", runtime, ["node_modules/drizzle-kit/bin.cjs", "push", "--force"]);
  serverLog = createWriteStream(join(output, "production-server.log"));
  server = spawn(runtime, ["dist/index.cjs"], { cwd: source, env, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout.pipe(serverLog, { end: false });
  server.stderr.pipe(serverLog, { end: false });
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) break;
    try {
      const response = await fetch(env.APP_URL);
      if (response.ok && (await response.text()).includes('type="module"')) { ready = true; break; }
    } catch { /* Wait only for this new isolated server. */ }
    await delay(200);
  }
  checks.push({ name: "production-startup", passed: ready });
  assert.ok(ready, "Production startup did not become ready.");
  console.log(`Isolated production server ready on port ${appPort}; existing preview untouched.`);
  await run("harvest-stock-loading-books", runtime, ["--import", "tsx", "scripts/node-upgrade/harvest-checks.ts"]);
  await run("seed-actions-desktop-phone", runtime, ["--import", "tsx", "scripts/test-seed-deletion-ui.ts"], { SEED_ACTIONS_ONLY: "1" });
  await run("seed-sold-lot-safety", runtime, ["--import", "tsx", "scripts/test-seed-deletion-ui.ts"], { SEED_LOT_ONLY: "1" });
  await run("seed-payment-reversal-print", runtime, ["--import", "tsx", "scripts/test-seed-payment-ui.ts"]);
  await run("seed-deletion-full", runtime, ["--import", "tsx", "scripts/test-seed-deletion-ui.ts"]);
} finally {
  if (server && server.exitCode === null) {
    server.kill("SIGTERM");
    await Promise.race([new Promise(resolve => server.once("close", resolve)), delay(3000)]);
    if (server.exitCode === null) server.kill("SIGKILL");
  }
  serverLog?.end();
  if (postgresStarted) await run("stop-test-database", "pg_ctl", ["-D", pgdata, "-m", "fast", "-w", "stop"]);
  assert.equal(sha256(await readFile(join(root, "package-lock.json"))), originalLockHash, "Workspace lockfile changed.");
  await writeFile(join(output, "report.json"), JSON.stringify({
    runtime: version, executableSha256: sha256(await readFile(runtime)),
    lockfileSha256: originalLockHash, database: "disposable local PostgreSQL cluster; no inherited DB credentials",
    productionChanged: false, sandbox, checks,
  }, null, 2));
  console.log(`Report: ${join(output, "report.json")}`);
}
if (checks.some(check => !check.passed)) process.exitCode = 1;
