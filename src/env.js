const crypto = require("crypto");

const SENSITIVE = /(PASSWORD|PASS|SECRET|TOKEN|KEY|CREDENTIAL|PRIVATE)/i;

/*
 * Values whose names look secret (datastore passwords, tokens, anything the
 * tester marks with SECRET/TOKEN/KEY) are never echoed. They are described by
 * length and a short SHA-256 prefix instead, which is enough to confirm the
 * exact value arrived without printing it.
 */
function describeValue(name, value, { reveal = false } = {}) {
  if (!SENSITIVE.test(name) || reveal) {
    return { value };
  }
  return {
    masked: true,
    length: value.length,
    sha256Prefix: crypto.createHash("sha256").update(value).digest("hex").slice(0, 12),
  };
}

function isChoreonInjected(name) {
  return /^(DS_|CHOREON_)/.test(name);
}

function listEnv(env, options) {
  return Object.keys(env)
    .sort()
    .map((name) => ({
      name,
      source: isChoreonInjected(name) ? "choreon" : "user-or-runtime",
      ...describeValue(name, env[name], options),
    }));
}

function sha256(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

module.exports = { describeValue, listEnv, isChoreonInjected, sha256, SENSITIVE };
