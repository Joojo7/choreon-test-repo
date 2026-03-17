const Redis = require("ioredis");

module.exports = async function check({ host, port, username, password }) {
  const client = new Redis({
    host,
    port,
    username: username || undefined,
    password: password || undefined,
    connectTimeout: 5000,
    lazyConnect: true,
  });

  client.on("error", () => {});

  try {
    await client.connect();
    const info = await client.info("server");
    const versionMatch = info.match(/redis_version:(.+)/);
    const version = versionMatch ? versionMatch[1].trim() : "unknown";
    return { version };
  } finally {
    client.disconnect();
  }
};
