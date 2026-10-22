// Read a private PM2 response from stdin; emit only allowlisted metadata.
import { readFileSync } from "node:fs";

try {
  const apps = JSON.parse(readFileSync(0, "utf8"));
  const expected = new Set(["CSM-App", "umiyadham-app", "vyapar-vriddhi",
    "krashumitra", "mandi-mitra", "krashuved-website"]);
  if (!Array.isArray(apps) || apps.length !== 6 ||
      new Set(apps.map(a => a.name)).size !== 6 ||
      apps.some(a => !expected.has(a.name) || a.pm2_env?.status !== "online")) {
    throw new Error();
  }
  const summary = apps.map(app => {
    const e = app.pm2_env;
    const settings = { ...(e.env || {}), ...e };
    const port = String(settings.PORT ?? "");
    return {
      app: app.name,
      pid: app.pid,
      mode: e.exec_mode,
      port: /^\d{1,5}$/.test(port) && Number(port) > 0 && Number(port) <= 65535
        ? Number(port) : "not explicitly identified",
      watchEnabled: Array.isArray(e.watch) ? e.watch.length > 0 : Boolean(e.watch),
      scheduledRestart: Boolean(e.cron_restart),
      customNodeArguments: Array.isArray(e.node_args) ? e.node_args.length > 0 : Boolean(e.node_args),
      autorestart: e.autorestart !== false,
      waitReady: Boolean(e.wait_ready),
      storageSettingNames: Object.keys(settings).filter(key =>
        /^(AWS_|S3_|R2_|AZURE_STORAGE_|DEFAULT_OBJECT_STORAGE_|PUBLIC_OBJECT_SEARCH_PATHS$|PRIVATE_OBJECT_DIR$)|(?:UPLOAD|STORAGE|FILES|DATA)_(?:DIR|PATH|ROOT)$/i.test(key)),
    };
  });
  console.log(JSON.stringify(summary, null, 2));
} catch {
  console.error("Could not summarize the expected six online apps. Stop and report this message.");
  process.exitCode = 1;
}
