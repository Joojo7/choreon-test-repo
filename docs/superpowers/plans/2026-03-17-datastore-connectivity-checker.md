# Datastore Connectivity Checker Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Node.js HTTP service that verifies connectivity to Choreon-managed datastores (PostgreSQL, MySQL, MariaDB, MongoDB, Redis, OpenSearch) by dynamically reading injected environment variables.

**Architecture:** Single Express.js app with a `/check/:datastoreName?type=<type>` endpoint. Each datastore type has its own driver module exporting an async `check()` function. The route handler resolves env vars from the datastore name, dispatches to the correct driver, and returns a JSON status response.

**Tech Stack:** Node.js 20, Express.js, pg, mysql2, mariadb, mongodb, ioredis, @opensearch-project/opensearch, Docker

**Spec:** `docs/superpowers/specs/2026-03-17-datastore-connectivity-checker-design.md`

---

## File Structure

| File | Responsibility |
|------|---------------|
| `package.json` | Dependencies and start script |
| `Dockerfile` | Multi-stage production image |
| `.dockerignore` | Exclude node_modules, docs, git from image |
| `src/index.js` | Express app setup, `/health` route, mount check router |
| `src/check.js` | `/check/:datastoreName` route handler: env var resolution, type validation, driver dispatch |
| `src/drivers/postgres.js` | PostgreSQL connectivity check using `pg` |
| `src/drivers/mysql.js` | MySQL connectivity check using `mysql2` |
| `src/drivers/mariadb.js` | MariaDB connectivity check using `mariadb` |
| `src/drivers/mongodb.js` | MongoDB connectivity check using `mongodb` |
| `src/drivers/redis.js` | Redis/Dragonfly connectivity check using `ioredis` |
| `src/drivers/opensearch.js` | OpenSearch connectivity check using `@opensearch-project/opensearch` |

---

## Chunk 1: Project Setup and Core Route Handler

### Task 1: Initialize project

**Files:**
- Create: `package.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "choreon-datastore-checker",
  "version": "1.0.0",
  "description": "Verifies connectivity to Choreon-managed datastores",
  "main": "src/index.js",
  "scripts": {
    "start": "node src/index.js"
  },
  "dependencies": {
    "express": "^4.21.0",
    "pg": "^8.13.0",
    "mysql2": "^3.11.0",
    "mariadb": "^3.4.0",
    "mongodb": "^6.10.0",
    "ioredis": "^5.4.0",
    "@opensearch-project/opensearch": "^2.12.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `cd /Users/joojodontoh/Documents/work/Choreon/test-repos/choreon-test-repo && npm install`
Expected: `node_modules/` created, `package-lock.json` generated

- [ ] **Step 3: Create .gitignore**

Create `.gitignore`:
```
node_modules/
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "feat: initialize project with dependencies"
```

---

### Task 2: Express app with /health endpoint

**Files:**
- Create: `src/index.js`

- [ ] **Step 1: Write src/index.js**

```js
const express = require("express");
const checkRouter = require("./check");

const app = express();
const PORT = process.env.PORT || 3000;

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});

app.use("/check", checkRouter);

app.listen(PORT, () => {
  console.log(`Datastore checker listening on port ${PORT}`);
});
```

- [ ] **Step 2: Verify it starts**

Run: `cd /Users/joojodontoh/Documents/work/Choreon/test-repos/choreon-test-repo && timeout 3 node -e "const express = require('express'); const app = express(); app.get('/health', (req, res) => res.json({status:'ok'})); const s = app.listen(3000, () => { console.log('OK'); s.close(); process.exit(0); });" || true`
Expected: Prints "OK" confirming Express works with installed deps

---

### Task 3: Check route handler

**Files:**
- Create: `src/check.js`

- [ ] **Step 1: Write src/check.js**

Uses dynamic `require()` so the app works even before all driver files exist — each driver is loaded on-demand when a request comes in.

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add src/index.js src/check.js
git commit -m "feat: add Express app with /health and /check route handler"
```

---

## Chunk 2: Database Drivers (SQL)

### Task 4: PostgreSQL driver

**Files:**
- Create: `src/drivers/postgres.js`

- [ ] **Step 1: Write src/drivers/postgres.js**

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add src/drivers/postgres.js
git commit -m "feat: add PostgreSQL driver"
```

---

### Task 5: MySQL driver

**Files:**
- Create: `src/drivers/mysql.js`

- [ ] **Step 1: Write src/drivers/mysql.js**

```js
const mysql = require("mysql2/promise");

module.exports = async function check({ host, port, username, password, database }) {
  const connection = await mysql.createConnection({
    host,
    port,
    user: username,
    password,
    database,
    connectTimeout: 5000,
  });

  try {
    const [rows] = await connection.query("SELECT version() AS version");
    return { version: rows[0].version };
  } finally {
    await connection.end().catch(() => {});
  }
};
```

- [ ] **Step 2: Commit**

```bash
git add src/drivers/mysql.js
git commit -m "feat: add MySQL driver"
```

---

### Task 6: MariaDB driver

**Files:**
- Create: `src/drivers/mariadb.js`

- [ ] **Step 1: Write src/drivers/mariadb.js**

```js
const mariadb = require("mariadb");

module.exports = async function check({ host, port, username, password, database }) {
  const connection = await mariadb.createConnection({
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
```

- [ ] **Step 2: Commit**

```bash
git add src/drivers/mariadb.js
git commit -m "feat: add MariaDB driver"
```

---

## Chunk 3: NoSQL and Search Drivers

### Task 7: MongoDB driver

**Files:**
- Create: `src/drivers/mongodb.js`

- [ ] **Step 1: Write src/drivers/mongodb.js**

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add src/drivers/mongodb.js
git commit -m "feat: add MongoDB driver"
```

---

### Task 8: Redis driver

**Files:**
- Create: `src/drivers/redis.js`

- [ ] **Step 1: Write src/drivers/redis.js**

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add src/drivers/redis.js
git commit -m "feat: add Redis driver"
```

---

### Task 9: OpenSearch driver

**Files:**
- Create: `src/drivers/opensearch.js`

- [ ] **Step 1: Write src/drivers/opensearch.js**

```js
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
```

- [ ] **Step 2: Commit**

```bash
git add src/drivers/opensearch.js
git commit -m "feat: add OpenSearch driver"
```

---

## Chunk 4: Dockerfile and Final Verification

### Task 10: Dockerfile

**Files:**
- Create: `Dockerfile`
- Create: `.dockerignore`

- [ ] **Step 1: Write .dockerignore**

```
node_modules
docs
.git
.gitignore
```

- [ ] **Step 2: Write Dockerfile**

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY src ./src
COPY package.json ./
EXPOSE 3000
CMD ["node", "src/index.js"]
```

- [ ] **Step 3: Build Docker image to verify**

Run: `cd /Users/joojodontoh/Documents/work/Choreon/test-repos/choreon-test-repo && docker build -t choreon-datastore-checker .`
Expected: Image builds successfully

- [ ] **Step 4: Run and test health endpoint**

Run: `docker run -d --name ds-checker -p 3000:3000 choreon-datastore-checker && sleep 2 && curl http://localhost:3000/health && docker stop ds-checker && docker rm ds-checker`
Expected: `{"status":"ok"}`

- [ ] **Step 5: Test error responses**

Run: `curl http://localhost:3000/check/mydb` (before starting container, just verify locally with `node src/index.js &`)
Expected 400 for missing type. Then `curl "http://localhost:3000/check/mydb?type=postgres"` should return 400 with missing env vars.

- [ ] **Step 6: Commit**

```bash
git add Dockerfile .dockerignore
git commit -m "feat: add Dockerfile and dockerignore"
```

---

### Task 11: Final smoke test

- [ ] **Step 1: Start service locally and verify all error paths**

```bash
cd /Users/joojodontoh/Documents/work/Choreon/test-repos/choreon-test-repo
node src/index.js &
SERVER_PID=$!

# Health check
curl -s http://localhost:3000/health
# Expected: {"status":"ok"}

# Missing type
curl -s http://localhost:3000/check/mydb
# Expected: 400, invalid type error

# Invalid type
curl -s "http://localhost:3000/check/mydb?type=oracle"
# Expected: 400, invalid type error

# Missing env vars
curl -s "http://localhost:3000/check/mydb?type=postgres"
# Expected: 400, missing MYDB_DS_HOST, MYDB_DS_PORT, etc.

# Hyphenated name
curl -s "http://localhost:3000/check/my-db?type=redis"
# Expected: 400, missing MY_DB_DS_HOST, MY_DB_DS_PORT

kill $SERVER_PID
```

- [ ] **Step 2: Final commit if any fixes needed**
