module.exports = async function check({ host, port, username, password, database }) {
  const mariadb = await import("mariadb");
  const connection = await mariadb.default.createConnection({
    host,
    port,
    user: username,
    password,
    database,
    connectTimeout: 5000,
  });

  try {
    const rows = await connection.query("SELECT version() AS version");
    return { version: rows[0].version };
  } finally {
    await connection.end().catch(() => {});
  }
};
