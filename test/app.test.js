const test = require("node:test");
const assert = require("node:assert/strict");

process.env.HEALTH_PATHS = "/health,/custom/ping";
process.env.WIZARD_TEST_VAR = "from-test";
const app = require("../src/index");

async function withServer(fn) {
  const server = app.listen(0);
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

test("health responds on every configured path", async () => {
  await withServer(async (base) => {
    for (const p of ["/health", "/custom/ping"]) {
      const res = await fetch(base + p);
      assert.equal(res.status, 200, p);
      assert.equal((await res.json()).status, "ok");
    }
    assert.equal((await fetch(base + "/healthz")).status, 404);
  });
});

test("/env/:name reports a user variable", async () => {
  await withServer(async (base) => {
    const body = await (await fetch(base + "/env/WIZARD_TEST_VAR")).json();
    assert.deepEqual(body, { name: "WIZARD_TEST_VAR", present: true, value: "from-test" });
    assert.equal((await fetch(base + "/env/NOPE_NOT_SET")).status, 404);
  });
});

test("/echo reflects method, header and body", async () => {
  await withServer(async (base) => {
    const res = await fetch(base + "/echo?x=1", {
      method: "PUT",
      headers: { "content-type": "application/json", "x-test-header": "choreon" },
      body: JSON.stringify({ hello: "cors" }),
    });
    const body = await res.json();
    assert.equal(body.method, "PUT");
    assert.equal(body.headers["x-test-header"], "choreon");
    assert.deepEqual(body.body, { hello: "cors" });
    assert.deepEqual(body.query, { x: "1" });
    assert.equal(res.headers.get("access-control-allow-origin"), null);
  });
});

test("/info exposes build, startup and limits sections", async () => {
  await withServer(async (base) => {
    const info = await (await fetch(base + "/info")).json();
    for (const key of ["service", "variant", "build", "startup", "limits", "request"]) {
      assert.ok(key in info, key);
    }
    assert.equal(info.variant.label, "baseline");
  });
});

test("/ serves the status page to browsers and JSON to scripts", async () => {
  await withServer(async (base) => {
    const html = await fetch(base + "/", { headers: { accept: "text/html,*/*;q=0.8" } });
    assert.equal(html.status, 200);
    assert.match(html.headers.get("content-type"), /text\/html/);
    assert.match(await html.text(), /Choreon Test Service/);
    const json = await fetch(base + "/", { headers: { accept: "application/json" } });
    assert.match(json.headers.get("content-type"), /application\/json/);
    assert.equal((await json.json()).name, "choreon-test-repo");
  });
});
