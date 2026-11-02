const express = require("express");
const router = express.Router();

const drivers = {
  postgres: require("./drivers/postgres"),
  mysql: require("./drivers/mysql"),
  mariadb: require("./drivers/mariadb"),
  mongodb: require("./drivers/mongodb"),
  redis: require("./drivers/redis"),
  opensearch: require("./drivers/opensearch"),
};

const VALID_TYPES = Object.keys(drivers);

const REQUIRED_ENV_VARS = {
  postgres: ["HOST", "PORT", "NAME", "USERNAME", "PASSWORD"],
  mysql: ["HOST", "PORT", "NAME", "USERNAME", "PASSWORD"],
  mariadb: ["HOST", "PORT", "NAME", "USERNAME", "PASSWORD"],
  mongodb: ["HOST", "PORT", "NAME", "USERNAME", "PASSWORD"],
  redis: ["HOST", "PORT"],
  opensearch: ["HOST", "PORT"],
};

// Choreon injects datastore secrets as DS_<TYPE>_<DATASTORE_SLUG>_<KEY>,
// e.g. DS_REDIS_S8MKJZ_HOST. TYPE codes match the API's DATASTORE_ENV_TYPE_MAP.
const CHOREON_TYPE_CODES = {
  postgres: "PG",
  mysql: "MYSQL",
  mariadb: "MARIADB",
  mongodb: "MONGO",
  redis: "REDIS",
  opensearch: "OS",
};

function toEnvSegment(value) {
  return value.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
}

/*
 * Resolves which env vars hold the datastore's connection details:
 * 1. `/check/<slug>`: DS_<TYPE>_<SLUG>_<KEY> (current Choreon convention)
 * 2. `/check/<name>`: legacy <NAME>_DS_<KEY>
 * 3. otherwise, if exactly one DS_<TYPE>_*_HOST is present, use that datastore
 * Returns a function mapping a key (HOST, PORT, ...) to its env var name.
 */
function resolveEnvKeys(datastoreName, type) {
  const typeCode = CHOREON_TYPE_CODES[type];
  const segment = toEnvSegment(datastoreName);

  const slugPrefix = `DS_${typeCode}_${segment}`;
  if (process.env[`${slugPrefix}_HOST`]) {
    return { keyFor: (key) => `${slugPrefix}_${key}`, source: slugPrefix };
  }

  if (process.env[`${segment}_DS_HOST`]) {
    return { keyFor: (key) => `${segment}_DS_${key}`, source: `${segment}_DS` };
  }

  const hostPattern = new RegExp(`^DS_${typeCode}_([A-Z0-9_]+)_HOST$`);
  const prefixes = Object.keys(process.env)
    .map((name) => name.match(hostPattern))
    .filter(Boolean)
    .map((match) => `DS_${typeCode}_${match[1]}`);

  if (prefixes.length === 1) {
    return { keyFor: (key) => `${prefixes[0]}_${key}`, source: prefixes[0] };
  }

  return {
    keyFor: (key) => `${slugPrefix}_${key}`,
    source: slugPrefix,
    available: prefixes,
  };
}

router.get("/:datastoreName", async (req, res) => {
  const { datastoreName } = req.params;
  const { type } = req.query;

  if (!type || !VALID_TYPES.includes(type)) {
    return res.status(400).json({
      status: "error",
      datastore: datastoreName,
      type: type || "missing",
      error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}`,
    });
  }

  const { keyFor, source, available } = resolveEnvKeys(datastoreName, type);
  const required = REQUIRED_ENV_VARS[type];
  const missing = required.filter((key) => !process.env[keyFor(key)]);

  if (missing.length > 0) {
    const hint =
      available && available.length > 1
        ? ` Multiple ${type} datastores attached; use the slug, one of: ${available
            .map((prefix) => prefix.split("_").slice(2).join("_").toLowerCase())
            .join(", ")}`
        : "";
    return res.status(400).json({
      status: "error",
      datastore: datastoreName,
      type,
      error: `Missing environment variables: ${missing.map(keyFor).join(", ")}.${hint}`,
    });
  }

  const config = {
    host: process.env[keyFor("HOST")],
    port: parseInt(process.env[keyFor("PORT")], 10),
    database: process.env[keyFor("NAME")],
    username: process.env[keyFor("USERNAME")],
    password: process.env[keyFor("PASSWORD")],
  };

  try {
    const result = await drivers[type](config);
    res.json({
      status: "connected",
      datastore: datastoreName,
      type,
      envPrefix: source,
      details: result,
    });
  } catch (err) {
    res.status(500).json({
      status: "error",
      datastore: datastoreName,
      type,
      error: err.message,
    });
  }
});

module.exports = router;
