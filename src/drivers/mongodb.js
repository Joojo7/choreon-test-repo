const { MongoClient } = require("mongodb");

module.exports = async function check({ host, port, username, password, database }) {
  const encodedUser = encodeURIComponent(username);
  const encodedPass = encodeURIComponent(password);
  const uri = `mongodb://${encodedUser}:${encodedPass}@${host}:${port}/${database}?authSource=admin&directConnection=true`;

  const client = new MongoClient(uri, {
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 5000,
  });

  try {
    await client.connect();
    const info = await client.db("admin").command({ buildInfo: 1 });
    return { version: info.version };
  } finally {
    await client.close().catch(() => {});
  }
};
