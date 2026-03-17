# Datastore Connectivity Checker Service

## Purpose

A simple Node.js HTTP service that verifies connectivity to any Choreon-managed datastore. Deployed as a Choreon service with secret groups attached, it dynamically reads injected environment variables to connect and report datastore status.

## API

### `GET /check/:datastoreName?type=<datastoreType>`

Checks connectivity to a datastore by reading env vars based on the datastore name.

**Parameters:**
- `:datastoreName` — name of the datastore (used to resolve env vars). Hyphens and other non-alphanumeric characters are converted to underscores before env var lookup (e.g., `my-db` → `MY_DB_DS_HOST`).
- `?type` (required) — one of: `postgres`, `mysql`, `mariadb`, `mongodb`, `redis`, `opensearch`

**Env var resolution:** Uppercases `datastoreName`, replaces non-alphanumeric chars with `_`, then reads:
- `{NAME}_DS_HOST` — hostname (required for all types)
- `{NAME}_DS_PORT` — port (required for all types)
- `{NAME}_DS_NAME` — database name (required for postgres, mysql, mariadb, mongodb; ignored for redis, opensearch)
- `{NAME}_DS_USERNAME` — username (required for postgres, mysql, mariadb, mongodb; optional for redis, opensearch)
- `{NAME}_DS_PASSWORD` — password (required for postgres, mysql, mariadb, mongodb; optional for redis, opensearch)

**Success response (200):**
```json
{
  "status": "connected",
  "datastore": "mydb",
  "type": "postgres",
  "details": { "version": "16.1" }
}
```

**Missing/invalid type (400):**
```json
{
  "status": "error",
  "datastore": "mydb",
  "type": "unknown",
  "error": "Invalid type. Must be one of: postgres, mysql, mariadb, mongodb, redis, opensearch"
}
```

**Missing env vars (400):**
```json
{
  "status": "error",
  "datastore": "mydb",
  "type": "postgres",
  "error": "Missing environment variables: MYDB_DS_HOST, MYDB_DS_PORT"
}
```

**Connection failure (500):**
```json
{
  "status": "error",
  "datastore": "mydb",
  "type": "postgres",
  "error": "connection refused"
}
```

### `GET /health`

Returns `{ "status": "ok" }` for liveness probes.

## Architecture

Single Express.js app with modular driver files.

```
choreon-test-repo/
├── Dockerfile
├── package.json
├── src/
│   ├── index.js          # Express app, route setup, /health
│   ├── check.js          # Route handler: resolve env vars, dispatch to driver
│   └── drivers/
│       ├── postgres.js   # pg
│       ├── mysql.js      # mysql2
│       ├── mariadb.js    # mariadb
│       ├── mongodb.js    # mongodb
│       ├── redis.js      # ioredis
│       └── opensearch.js # @opensearch-project/opensearch
```

### Driver Interface

Each driver module exports a single function:

```js
async function check({ host, port, username, password, database }) → { version: string }
```

The `database` parameter is optional — Redis and OpenSearch drivers ignore it. The function connects, queries the version, disconnects, and returns. No persistent connection pools. 5-second connection timeout for all drivers.

### Connection Details by Type

| Type | Connection Method | Version Query | Library |
|------|-------------------|---------------|---------|
| postgres | `new Client({ host, port, user, password, database })` | `SELECT version()` | `pg` |
| mysql | `createConnection({ host, port, user, password, database })` | `SELECT version()` | `mysql2` |
| mariadb | `createConnection({ host, port, user, password, database })` | `SELECT version()` | `mariadb` |
| mongodb | `mongodb://user:pass@host:port/db?authSource=admin&directConnection=true` | `db.admin().serverInfo()` | `mongodb` |
| redis | `new Redis({ host, port, password })` — no username/database needed | `INFO server` → parse `redis_version` | `ioredis` |
| opensearch | `https://host:port` with basic auth, TLS `rejectUnauthorized: false` | `GET /` → `version.number` | `@opensearch-project/opensearch` |

**OpenSearch TLS note:** OpenSearch typically runs with self-signed certs in Choreon clusters. The driver uses HTTPS with `rejectUnauthorized: false` to handle this.

**MongoDB connection string:** Assembled from individual env vars as `mongodb://username:password@host:port/database?authSource=admin&directConnection=true`. `directConnection=true` ensures it works with both standalone and replica set deployments.

### Route Handler Flow

1. Extract `datastoreName` from URL params, `type` from query string
2. Validate `type` is one of the supported types; return 400 if missing or invalid
3. Uppercase `datastoreName`, replace non-alphanumeric chars with `_`, read env vars
4. Check required env vars for the given type; return 400 with list of missing vars
5. Call the appropriate driver's `check()` function
6. Return success or error response

## Dockerfile

Multi-stage Node.js 20 Alpine build:

- **Build stage:** `node:20-alpine`, copy `package.json` + `package-lock.json`, run `npm ci --omit=dev`
- **Run stage:** `node:20-alpine`, copy `node_modules` and `src` from build, expose port 3000, run `node src/index.js`

## Dependencies

- `express` — HTTP server
- `pg` — PostgreSQL
- `mysql2` — MySQL
- `mariadb` — MariaDB
- `mongodb` — MongoDB
- `ioredis` — Redis/Dragonfly
- `@opensearch-project/opensearch` — OpenSearch
