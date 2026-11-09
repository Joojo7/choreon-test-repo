const fs = require("fs");
const os = require("os");
const path = require("path");

const START_TIME = Date.now();

function readFirstLine(file) {
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    return null;
  }
}

/*
 * Resource limits as the container sees them, so the "Max CPU Credit" and
 * "Max Memory Credit" fields can be verified against what Kubernetes applied.
 * Supports cgroup v2 (cpu.max / memory.max) and cgroup v1.
 */
function readResourceLimits() {
  const cpuMax = readFirstLine("/sys/fs/cgroup/cpu.max");
  const memMax = readFirstLine("/sys/fs/cgroup/memory.max");

  let cpuMillicores = null;
  let memoryMiB = null;

  if (cpuMax) {
    const [quota, period] = cpuMax.split(/\s+/);
    if (quota !== "max") {
      cpuMillicores = Math.round((Number(quota) / Number(period)) * 1000);
    }
  } else {
    const quota = readFirstLine("/sys/fs/cgroup/cpu/cpu.cfs_quota_us");
    const period = readFirstLine("/sys/fs/cgroup/cpu/cpu.cfs_period_us");
    if (quota && period && Number(quota) > 0) {
      cpuMillicores = Math.round((Number(quota) / Number(period)) * 1000);
    }
  }

  const memV1 = readFirstLine("/sys/fs/cgroup/memory/memory.limit_in_bytes");
  const memRaw = memMax && memMax !== "max" ? memMax : memV1;
  if (memRaw && Number(memRaw) < Number.MAX_SAFE_INTEGER) {
    memoryMiB = Math.round(Number(memRaw) / (1024 * 1024));
  }

  return {
    cpuMillicores,
    memoryMiB,
    cgroupVersion: cpuMax ? "v2" : "v1-or-none",
    visibleCpus: os.cpus().length,
  };
}

/*
 * How the image was produced, so the "Source" step (Buildpacks vs Dockerfile,
 * Dockerfile location) can be verified. The Dockerfiles in this repo set
 * BUILD_METHOD / BUILD_VARIANT; a Buildpacks image has /cnb and /layers.
 */
function detectBuild() {
  const fromEnv = process.env.BUILD_METHOD;
  if (fromEnv) {
    return {
      method: fromEnv,
      variant: process.env.BUILD_VARIANT || null,
      dockerfile: process.env.DOCKERFILE_PATH || null,
    };
  }
  const isBuildpacks = fs.existsSync("/cnb") || fs.existsSync("/layers");
  return {
    method: isBuildpacks ? "buildpacks" : "unknown",
    variant: isBuildpacks ? "paketo-or-cnb" : null,
    dockerfile: null,
    cnbEnv: Object.keys(process.env).filter((k) => k.startsWith("CNB_")),
  };
}

function readVariant() {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(__dirname, "variant.json"), "utf8")
    );
  } catch {
    return null;
  }
}

/*
 * Which process started the app, so the "RUN Command" field can be verified.
 * --label=<value> is accepted on the command line for exactly this purpose.
 */
function describeStartup(argv) {
  const labelArg = argv.find((a) => a.startsWith("--label="));
  return {
    argv,
    label: labelArg ? labelArg.slice("--label=".length) : null,
    npmScript: process.env.npm_lifecycle_event || null,
    execPath: process.execPath,
  };
}

function buildInfo(req) {
  return {
    service: {
      hostname: os.hostname(),
      pid: process.pid,
      node: process.version,
      uptimeSeconds: Math.round((Date.now() - START_TIME) / 1000),
      listeningPort: req.socket.localPort,
      healthPaths: req.app.locals.healthPaths,
    },
    variant: readVariant(),
    build: detectBuild(),
    startup: describeStartup(process.argv.slice(1)),
    limits: readResourceLimits(),
    request: {
      method: req.method,
      path: req.originalUrl,
      host: req.headers.host,
      protocol: req.headers["x-forwarded-proto"] || req.protocol,
      clientIp: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
      hasAuthorizationHeader: Boolean(req.headers.authorization),
      forwardedHeaders: Object.fromEntries(
        Object.entries(req.headers).filter(([k]) => k.startsWith("x-"))
      ),
    },
  };
}

module.exports = { buildInfo, readResourceLimits, detectBuild, describeStartup };
