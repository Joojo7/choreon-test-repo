const test = require("node:test");
const assert = require("node:assert/strict");
const { parseHealthPaths, DEFAULT_HEALTH_PATHS } = require("../src/health");

test("defaults when HEALTH_PATHS is unset or blank", () => {
  assert.deepEqual(parseHealthPaths(undefined), DEFAULT_HEALTH_PATHS);
  assert.deepEqual(parseHealthPaths("  "), DEFAULT_HEALTH_PATHS);
});

test("splits on commas, trims and adds the leading slash", () => {
  assert.deepEqual(parseHealthPaths("custom/ping, /ready "), ["/custom/ping", "/ready"]);
});
