export function assertPatchedRuntime(version) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) throw new Error(`Unrecognized Node version: ${version}`);
  const [, major, minor, patch] = match.map(Number);
  const minimum = { 22: [23, 4], 24: [22, 1], 26: [12, 1] }[major];
  if (!minimum || minor < minimum[0] || (minor === minimum[0] && patch < minimum[1])) {
    throw new Error(`Node ${version} does not meet the October 2026 security baseline.`);
  }
  return version.trim();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  assertPatchedRuntime(process.version);
  console.log(`Node runtime meets the advisory baseline: ${process.version}`);
}
