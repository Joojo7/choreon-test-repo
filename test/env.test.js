const test = require("node:test");
const assert = require("node:assert/strict");
const { describeValue, listEnv, sha256 } = require("../src/env");

test("plain values are returned as-is", () => {
  assert.deepEqual(describeValue("APP_MODE", "blue"), { value: "blue" });
});

test("secret-looking names are masked but verifiable", () => {
  const d = describeValue("DB_PASSWORD", "hunter2");
  assert.equal(d.masked, true);
  assert.equal(d.length, 7);
  assert.equal(d.sha256Prefix, sha256("hunter2").slice(0, 12));
  assert.equal("value" in d, false);
});

test("reveal flag unmasks", () => {
  assert.deepEqual(describeValue("API_TOKEN", "t", { reveal: true }), { value: "t" });
});

test("Choreon-injected variables are labelled", () => {
  const rows = listEnv({ DS_PG_ABC_HOST: "h", CHOREON_ENV: "prod", MINE: "x" });
  assert.deepEqual(
    rows.map((r) => [r.name, r.source]),
    [["CHOREON_ENV", "choreon"], ["DS_PG_ABC_HOST", "choreon"], ["MINE", "user-or-runtime"]]
  );
});
