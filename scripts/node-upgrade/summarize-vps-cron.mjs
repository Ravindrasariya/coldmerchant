// Emits only job counts and classification flags, never command text.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";

try {
  const files = existsSync("/etc/crontab") ? ["/etc/crontab"] : [];
  for (const directory of ["/etc/cron.d", "/var/spool/cron/crontabs"]) {
    if (!existsSync(directory)) continue;
    for (const name of readdirSync(directory)) {
      const file = `${directory}/${name}`;
      if (!name.startsWith(".") && statSync(file).isFile()) files.push(file);
    }
  }
  const summary = files.map(file => {
    const jobs = readFileSync(file, "utf8").split(/\r?\n/).map(line => line.trim())
      .filter(line => line && !line.startsWith("#") && !/^[A-Za-z_]\w*\s*=/.test(line));
    return {
      file,
      entries: jobs.length,
      rebootJob: jobs.some(line => /^@reboot\b/.test(line)),
      mentionsNodeOrPm2: jobs.some(line => /\b(?:node|npm|pm2)\b/i.test(line)),
      mentionsAppFolders: jobs.some(line => /\/var\/www\//.test(line)),
      mentionsDatabaseTools: jobs.some(line => /\b(?:psql|pg_dump|pg_dumpall|pg_restore)\b/.test(line)),
      mentionsHttpTools: jobs.some(line => /\b(?:curl|wget)\b/.test(line)),
      mentionsScripts: jobs.some(line => /\.(?:sh|py|js|mjs|cjs)\b/.test(line)),
    };
  });
  console.log(JSON.stringify(summary, null, 2));
} catch {
  console.error("Could not summarize cron metadata. Stop and report this message.");
  process.exitCode = 1;
}
