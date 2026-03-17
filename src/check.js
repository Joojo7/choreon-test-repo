const express = require("express");
const router = express.Router();

const VALID_TYPES = ["postgres", "mysql", "mariadb", "mongodb", "redis", "opensearch"];

const REQUIRED_ENV_VARS = {
  postgres: ["DS_HOST", "DS_PORT", "DS_NAME", "DS_USERNAME", "DS_PASSWORD"],
  mysql: ["DS_HOST", "DS_PORT", "DS_NAME", "DS_USERNAME", "DS_PASSWORD"],
  mariadb: ["DS_HOST", "DS_PORT", "DS_NAME", "DS_USERNAME", "DS_PASSWORD"],
  mongodb: ["DS_HOST", "DS_PORT", "DS_NAME", "DS_USERNAME", "DS_PASSWORD"],
  redis: ["DS_HOST", "DS_PORT"],
  opensearch: ["DS_HOST", "DS_PORT"],
};

function resolveEnvPrefix(datastoreName) {
  return datastoreName.replace(/[^a-zA-Z0-9]/g, "_").toUpperCase();
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

  const prefix = resolveEnvPrefix(datastoreName);
  const required = REQUIRED_ENV_VARS[type];
  const missing = required.filter((suffix) => !process.env[`${prefix}_${suffix}`]);

  if (missing.length > 0) {
    return res.status(400).json({
      status: "error",
      datastore: datastoreName,
      type,
      error: `Missing environment variables: ${missing.map((s) => `${prefix}_${s}`).join(", ")}`,
    });
  }

  const config = {
    host: process.env[`${prefix}_DS_HOST`],
    port: parseInt(process.env[`${prefix}_DS_PORT`], 10),
    database: process.env[`${prefix}_DS_NAME`],
    username: process.env[`${prefix}_DS_USERNAME`],
    password: process.env[`${prefix}_DS_PASSWORD`],
  };

  try {
    const driver = require(`./drivers/${type}`);
    const result = await driver(config);
    res.json({
      status: "connected",
      datastore: datastoreName,
      type,
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
