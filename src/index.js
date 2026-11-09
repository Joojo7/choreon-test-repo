const express = require("express");
const path = require("path");
const checkRouter = require("./check");
const { buildInfo } = require("./info");
const { listEnv, describeValue } = require("./env");
const { clampSeconds, burnCpu, holdMemory, MAX_SECONDS, MAX_MEMORY_MIB } = require("./load");
const { parseHealthPaths } = require("./health");

const app = express();
// "Port" field: Choreon does not inject PORT, so set an env var PORT=<same value>.
const PORT = Number.parseInt(process.env.PORT, 10) || 3000;
const HEALTH_PATHS = parseHealthPaths(process.env.HEALTH_PATHS);
app.locals.healthPaths = HEALTH_PATHS;

app.disable("x-powered-by");
app.use(express.json({ limit: "256kb" }));
app.use(express.text({ type: "text/*", limit: "256kb" }));

// Deliberately no CORS middleware: CORS is enforced by the Choreon gateway from
// the "Networking" step, and adding headers here would mask that behaviour.

// --- Information step: Health Endpoint -------------------------------------
for (const healthPath of HEALTH_PATHS) {
  app.get(healthPath, (req, res) => {
    res.json({ status: "ok", path: req.path, healthPaths: HEALTH_PATHS });
  });
}

// --- Everything at a glance --------------------------------------------------
app.get("/", (req, res) => {
  res.json({
    name: "choreon-test-repo",
    endpoints: {
      "/info": "build, startup command, limits, request headers",
      "/env": "all env vars (secret-looking values masked); ?reveal=1 to unmask",
      "/env/:name": "one env var",
      "/echo": "any method; echoes method, headers, query, body",
      "/load/cpu?seconds=20": `burn CPU (max ${MAX_SECONDS}s) to trigger autoscaling`,
      "/load/memory?mib=128&seconds=30": `hold memory (max ${MAX_MEMORY_MIB} MiB)`,
      "/cors-tester": "browser page to exercise CORS against another origin",
      "/check/:datastore?type=postgres": "datastore connectivity check",
      health: HEALTH_PATHS,
    },
  });
});

// --- Source + Deployment Configuration steps ---------------------------------
app.get("/info", (req, res) => {
  res.json(buildInfo(req));
});

// --- Environment Variables step ----------------------------------------------
app.get("/env", (req, res) => {
  const reveal = req.query.reveal === "1";
  const all = listEnv(process.env, { reveal });
  res.json({
    count: all.length,
    userDefined: all.filter((e) => e.source !== "choreon"),
    choreonInjected: all.filter((e) => e.source === "choreon"),
  });
});

app.get("/env/:name", (req, res) => {
  const { name } = req.params;
  if (!(name in process.env)) {
    return res.status(404).json({ name, present: false });
  }
  res.json({
    name,
    present: true,
    ...describeValue(name, process.env[name], { reveal: req.query.reveal === "1" }),
  });
});

// --- Networking step (CORS) ---------------------------------------------------
app.all("/echo", (req, res) => {
  res.json({
    method: req.method,
    path: req.originalUrl,
    query: req.query,
    headers: req.headers,
    body: req.body ?? null,
    receivedAt: new Date().toISOString(),
  });
});

app.get("/cors-tester", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "cors-tester.html"));
});

// --- Deployment Configuration step: instances and limits ----------------------
app.get("/load/cpu", (req, res) => {
  const seconds = clampSeconds(req.query.seconds, 10);
  const started = Date.now();
  burnCpu(seconds);
  res.json({
    hostname: require("os").hostname(),
    burnedSeconds: (Date.now() - started) / 1000,
    requestedSeconds: seconds,
  });
});

app.get("/load/memory", (req, res) => {
  const seconds = clampSeconds(req.query.seconds, 30);
  const mib = Number.parseInt(req.query.mib, 10) || 128;
  const bytes = holdMemory(mib, seconds);
  res.json({
    hostname: require("os").hostname(),
    heldMiB: bytes / (1024 * 1024),
    forSeconds: seconds,
    rssMiB: Math.round(process.memoryUsage().rss / (1024 * 1024)),
  });
});

// --- Datastores ---------------------------------------------------------------
app.use("/check", checkRouter);

app.use((req, res) => {
  res.status(404).json({ error: "not found", path: req.originalUrl, hint: "GET / lists endpoints" });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(
      `choreon-test-repo listening on ${PORT}; health at ${HEALTH_PATHS.join(", ")}; ` +
        `argv=${JSON.stringify(process.argv.slice(2))}`
    );
  });
}

module.exports = app;
