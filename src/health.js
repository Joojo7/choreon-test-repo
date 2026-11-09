const DEFAULT_HEALTH_PATHS = ["/health", "/healthz", "/ready", "/live"];

/*
 * HEALTH_PATHS lets the tester point the "Health Endpoint" field at any path,
 * e.g. HEALTH_PATHS=/custom/ping. Comma separated; leading slash added if missing.
 */
function parseHealthPaths(raw) {
  if (!raw || !raw.trim()) return DEFAULT_HEALTH_PATHS;
  const paths = raw
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => (p.startsWith("/") ? p : `/${p}`));
  return paths.length ? paths : DEFAULT_HEALTH_PATHS;
}

module.exports = { parseHealthPaths, DEFAULT_HEALTH_PATHS };
