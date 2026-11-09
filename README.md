# choreon-test-repo

A small Node/Express service built to exercise **every field of the Choreon
"Create Service" wizard** end to end, plus the original datastore connectivity
checker. Each wizard field has an endpoint that shows whether the value you
entered actually reached the running service.

No framework beyond Express and no build step. Works with Buildpacks and with
either of the two Dockerfiles.

## Status page

Open the service's host in a browser. The page at `/` reads `/info`, `/env`
and the health paths and shows one card per wizard step: build method and
Dockerfile, startup command, limits, hostname, request headers, env vars
(masked unless revealed), live health badges and buttons that send CPU or
memory load so you can watch the hostname change as instances scale. Turn on
auto-refresh while testing Max Instance Count.

## Endpoints

| Endpoint | What it shows |
|---|---|
| `GET /` | **Status page** in a browser (cards for every wizard step, live health probes, env table, load buttons). JSON index for curl/scripts |
| `GET /health` (also `/healthz`, `/ready`, `/live`, or whatever `HEALTH_PATHS` says) | Health check target |
| `GET /info` | Build method and Dockerfile used, startup command, pod hostname, Node version, CPU/memory limits the container sees, request headers forwarded by the gateway |
| `GET /env` | Every env var. Names containing PASSWORD/SECRET/TOKEN/KEY are masked but reported with length and a SHA-256 prefix. `?reveal=1` unmasks. Choreon-injected (`DS_*`, `CHOREON_*`) are listed separately |
| `GET /env/:name` | One variable |
| `ANY /echo` | Echoes method, headers, query and body. Target for CORS tests |
| `GET /cors-tester` | Browser page that fires cross-origin requests at another URL |
| `GET /load/cpu?seconds=20` | Burns CPU (max 60 s) to trigger autoscaling |
| `GET /load/memory?mib=128&seconds=30` | Holds memory (max 512 MiB) |
| `GET /check/:datastore?type=postgres\|mysql\|mariadb\|mongodb\|redis\|opensearch` | Datastore connectivity check using Choreon's `DS_<TYPE>_<SLUG>_*` variables |

The app sends **no CORS headers of its own**. CORS is applied by the Choreon
gateway from the Networking step, and adding headers here would hide that.

## Wizard test matrix

### 1. Information

| Field | Enter | Verify |
|---|---|---|
| Name | anything | Service appears with the kebab-cased name |
| Health Endpoint | `/health`, `/healthz`, `/ready` or `/live` work out of the box. For a custom path, e.g. `/custom/ping`, also add env var `HEALTH_PATHS=/custom/ping` | Pod becomes Ready; `GET <path>` returns `{"status":"ok"}`. A path not in `HEALTH_PATHS` must make the rollout fail readiness |
| Port | `3000` works with no extra config. For another port, e.g. `8080`, also add env var `PORT=8080` (Choreon does not inject `PORT`) | `/info` → `service.listeningPort` |
| Source kind: From Repository | this repo | `/info` → `build.method` |
| Source kind: From Container Registry | build and push an image from this repo (`docker build -t <registry>/<img>:<tag> .`) and enter host/image/tag | `/info` → `build.variant` = `root-dockerfile` |
| Repository / Branch | pick a branch whose `src/variant.json` differs (see below) | `/info` → `variant.label` |
| Code Push Strategy | Direct or Pull Request | Pipeline files land on the branch, or a PR is opened |

**Branch testing**: `src/variant.json` on `master` has `"label": "baseline"`.
Create a branch, change the label (e.g. `"branch-b"`), push, and select that
branch in the wizard. `/info` shows which one was deployed.

### 2. Source (build parameters)

| Field | Enter | Verify at `/info` |
|---|---|---|
| Build type: Buildpacks | default | `build.method` = `buildpacks`, `build.variant` = `paketo-or-cnb` |
| Build type: Dockerfile, location empty | | `build.variant` = `root-dockerfile`, `service.node` = v20 |
| Dockerfile Location | `docker/Dockerfile` | `build.variant` = `docker-dir-dockerfile`, `service.node` = v22 |
| RUN Command | `node src/index.js --label=from-run-command` or `npm run start:alt` | `startup.label` shows the label; `startup.npmScript` = `start:alt` for the npm form. With no RUN command the Dockerfile CMD label is `root-dockerfile-cmd` / `docker-dir-dockerfile-cmd` |
| Test Command + Enable Tests on | `npm test` | Build proceeds (10 passing tests) |
| Test Command + Enable Tests on | `npm run test:fail` | Build must stop with one intentional failure |
| Test Command + Enable Tests **off** | `npm run test:fail` | Build must proceed (tests skipped) |

### 3. Deployment Configuration

| Field | Verify |
|---|---|
| Max CPU Credit | `/info` → `limits.cpuMillicores` matches the credits you chose (read from the container's cgroup) |
| Max Memory Credit | `/info` → `limits.memoryMiB` |
| Max Instance Count | Call `/load/cpu?seconds=30` several times in parallel, then poll `/info` → `service.hostname`. With count > 1 you should see more than one hostname; with count 1 never more than one. Sustained `/load/memory` works the same way |
| Enable Staging | Staging host serves the service; `/info` → `request.host` shows which host you hit |
| Expose Publicly off | The generated host must not resolve / must be refused from outside |
| Expose Publicly on | `/info` reachable on the generated host; `request.protocol` = https |
| Enable Basic Protection | Unauthenticated request is rejected by the gateway; with the token, `/info` → `request.hasAuthorizationHeader` = true |

### 4. Environment Variables

| Action | Verify |
|---|---|
| Set a pair by hand, e.g. `APP_MODE=blue` | `/env/APP_MODE` → `{"value":"blue"}` |
| Set a secret-looking pair, e.g. `MY_SECRET_TOKEN=abc` | `/env/MY_SECRET_TOKEN` is masked with `length` 3 and a hash prefix; `?reveal=1` shows `abc` |
| Edit / delete a pair | `/env` reflects the change after redeploy |
| Upload `.env` file | Upload `fixtures/upload-test.env`. It covers quotes, `=` in values, empty values, inline comments, multi-line values, `export` prefix and a masked token. Compare `/env` with the file |
| Attached datastores | `/env` → `choreonInjected` lists the `DS_*` variables; `/check/<slug>?type=<type>` connects with them |

### 5. Networking (CORS)

Open `https://<this-service>/cors-tester` in a browser. Its origin is this
service's host, so point it at a **different** origin: a second deployment of
this repo, or this service's staging host. Then, in the wizard of the *target*
service:

| Field | Test |
|---|---|
| CORS Origins | Add the tester page's origin → request succeeds. Remove it → browser reports `Failed to fetch` while the Network tab shows the gateway response without `Access-Control-Allow-Origin` |
| CORS Headers | Add `X-Test-Header` → the default custom header passes the preflight. Change the header name in the page to one not listed → blocked |
| CORS Methods | Add `PUT`/`DELETE` → those methods succeed against `/echo`. Methods not listed → blocked at preflight |

`/echo` returns what actually arrived, so you can also confirm headers and
bodies are forwarded unchanged.

## Local run

```bash
npm ci
npm start                                   # http://localhost:3000
PORT=8080 HEALTH_PATHS=/custom/ping npm start
npm test                                    # 10 passing
npm run test:fail                           # 1 intentional failure, exit 1
docker build -t ctr .                       # root Dockerfile, Node 20
docker build -f docker/Dockerfile -t ctr .  # alternate Dockerfile, Node 22
docker run --rm --cpus=0.5 --memory=256m -p 3000:3000 ctr   # /info shows 500m / 256 MiB
```

## Layout

```
src/index.js          routes
src/info.js           build / startup / cgroup limit detection
src/env.js            env listing with masking
src/health.js         HEALTH_PATHS parsing
src/load.js           bounded CPU / memory load
src/variant.json      per-branch marker
src/check.js          datastore checker (unchanged behaviour)
src/public/           index.html (status page), cors-tester.html
test/*.test.js        npm test
test/fail/            npm run test:fail
fixtures/upload-test.env
docker/Dockerfile     alternate Dockerfile location
```
