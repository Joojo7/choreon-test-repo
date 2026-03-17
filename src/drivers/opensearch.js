const { Client } = require("@opensearch-project/opensearch");

module.exports = async function check({ host, port, username, password }) {
  const clientOptions = {
    node: `https://${host}:${port}`,
    ssl: { rejectUnauthorized: false },
    requestTimeout: 5000,
  };

  if (username && password) {
    clientOptions.auth = { username, password };
  }

  const client = new Client(clientOptions);
  const { body } = await client.info();
  return { version: body.version.number };
};
