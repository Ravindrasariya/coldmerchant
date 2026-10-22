import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const node22 = "/opt/node-runtimes/node-v22.23.4-linux-x64/bin/node";
const cli = "/usr/lib/node_modules/pm2/bin/pm2";
const inventory = {
  "CSM-App": ["/var/www/krashuved/csm-app", "fork_mode"],
  "umiyadham-app": ["/var/www/umiyadham-app", "cluster_mode"],
  "vyapar-vriddhi": ["/var/www/vyapar-vriddhi", "cluster_mode"],
  krashumitra: ["/var/www/krashumitra", "fork_mode"],
  "mandi-mitra": ["/var/www/mandi-mitra", "cluster_mode"],
  "krashuved-website": ["/var/www/krashuved-website", "fork_mode"],
};
const present = value => Array.isArray(value) ? value.length > 0 : Boolean(value);

export function buildProfile(original) {
  if (!Array.isArray(original) || original.length !== 6 ||
      new Set(original.map(a => a.name)).size !== 6) throw new Error();
  return original.map(source => {
    const expected = inventory[source.name];
    if (!expected || source.status !== "online" ||
        source.pm_cwd !== expected[0] || source.exec_mode !== expected[1] ||
        source.pm_exec_path !== (source.name === "krashuved-website"
          ? "/usr/bin/npm" : `${expected[0]}/dist/index.cjs`) ||
        (source.instances != null && Number(source.instances) !== 1) ||
        present(source.watch) || present(source.cron_restart) || present(source.node_args) ||
        present(source.NODE_OPTIONS) || present(source.env?.NODE_OPTIONS) ||
        present(source.PM2_NODE_OPTIONS) || present(source.env?.PM2_NODE_OPTIONS)) throw new Error();
    const next = structuredClone(source);
    const oldPath = source.PATH || source.env?.PATH;
    if (typeof oldPath !== "string" || !/^[A-Za-z0-9_./:+-]+$/.test(oldPath)) throw new Error();
    next.exec_interpreter = node22;
    next.PATH = `${path.dirname(node22)}:${oldPath}`;
    next.env = { ...next.env, PATH: next.PATH };
    return next;
  });
}

export function renderOverride(managerPath) {
  if (typeof managerPath !== "string" || !/^[A-Za-z0-9_./:+-]+$/.test(managerPath)) throw new Error();
  return `[Service]
Environment="PATH=${path.dirname(node22)}:${managerPath}"
Environment="PM2_HOME=/root/.pm2"
ExecStart=
ExecStart=${node22} ${cli} resurrect
ExecReload=
ExecReload=${node22} ${cli} reload all
ExecStop=
ExecStop=${node22} ${cli} kill
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const prep = process.argv[2];
    const pid = readFileSync("/root/.pm2/pm2.pid", "utf8").trim();
    if (!/^[1-9][0-9]*$/.test(pid)) throw new Error();
    const environment = readFileSync(`/proc/${pid}/environ`, "utf8").split("\0");
    if (environment.some(v => /^(?:PM2_)?NODE_OPTIONS=.+/.test(v))) throw new Error();
    const managerPath = environment.find(v => v.startsWith("PATH="))?.slice(5);
    const original = JSON.parse(readFileSync(`${prep}/node20-dump.pm2`, "utf8"));
    writeFileSync(`${prep}/node22-dump.pm2`, JSON.stringify(buildProfile(original), null, 2) + "\n", { mode: 0o600 });
    writeFileSync(`${prep}/candidate-runtime.conf`, renderOverride(managerPath), { mode: 0o600 });
    console.log("PASS: six candidate entries staged; modes, arguments and non-PATH environment settings preserved.");
  } catch {
    console.error("STOP: process profile or manager environment requires review; no candidate configuration installed.");
    process.exitCode = 1;
  }
}
