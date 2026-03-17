# Datastore Connectivity Checker Service

## Purpose

A simple Node.js HTTP service that verifies connectivity to any Choreon-managed datastore. Deployed as a Choreon service with secret groups attached, it dynamically reads injected environment variables to connect and report datastore status.

## API

### `GET /check/:datastoreName?type=<datastoreType>`

Checks connectivity to a datastore by reading env vars based on the datastore name.

**Parameters:**
- `:datastoreName` — name of the datastore (used to resolve env vars)
- `?type` — one of: `postgres`, `mysql`, `mariadb`, `mongodb`, `redis`, `opensearch`

**Env var resolution:** Uppercases `datastoreName` and reads:
- `{NAME}_DS_HOST` — hostname
- `{NAME}_DS_PORT` — port
- `{NAME}_DS_NAME` — database name
- `{NAME}_DS_USERNAME` — username
- `{NAME}_DS_PASSWORD` — password

**Success response (200):**
```json
{
  "status": "connected",
  "datastore": "mydb",
  "type": "postgres",
  "details": { "version": "16.1" }
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

The function connects, queries the version, disconnects, and returns. No persistent connection pools. 5-second connection timeout for all drivers.

### Version Queries by Type

| Type | Query | Library |
|------|-------|---------|
| postgres | `SELECT version()` | `pg` |
| mysql | `SELECT version()` | `mysql2` |
| mariadb | `SELECT version()` | `mariadb` |
| mongodb | `db.admin().serverInfo()` | `mongodb` |
| redis | `INFO server` → parse `redis_version` | `ioredis` |
| opensearch | `GET /` → `version.number` | `@opensearch-project/opensearch` |

### Route Handler Flow

1. Extract `datastoreName` from URL params, `type` from query string
2. Validate `type` is one of the supported types
3. Uppercase `datastoreName`, read env vars
4. If any required env var is missing, return 400 with list of missing vars
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
