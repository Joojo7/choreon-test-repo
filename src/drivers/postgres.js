const { Client } = require("pg");

module.exports = async function check({ host, port, username, password, database }) {
  const client = new Client({
    host,
    port,
    user: username,
    password,
    database,
    connectionTimeoutMillis: 5000,
  });

  try {
    await client.connect();
    const res = await client.query("SELECT version()");
    return { version: res.rows[0].version };
  } finally {
    await client.end().catch(() => {});
  }
};
