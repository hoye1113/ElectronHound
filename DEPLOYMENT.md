# EATA Deployment Guide

## Table of Contents

- [Prerequisites](#prerequisites)
- [Building the Docker Image](#building-the-docker-image)
- [Development Deployment](#development-deployment)
- [Production Deployment](#production-deployment)
- [Environment Variables](#environment-variables)
- [Health Check Endpoints](#health-check-endpoints)
- [Limitations (T28)](#limitations-t28)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

- **Docker** >= 20.10 (with BuildKit)
- **Docker Compose** >= 2.0 (v2 plugin or standalone)
- **10 GB** free disk space (image build uses ~4 GB intermediate layers)

Verify your setup:

```bash
docker --version
docker compose version
```

## Building the Docker Image

Build the image locally from source:

```bash
# Standard build
docker build -t eata .

# Build without cache (forces full dependency reinstall)
docker build --no-cache -t eata .

# Build with specific build arguments
docker build -t eata:0.1.0 --label "version=0.1.0" .
```

The build uses a **multi-stage Dockerfile**:

1. **Builder stage** (`node:18-alpine`): Installs build toolchain, all dependencies, and compiles TypeScript.
2. **Runtime stage** (`node:18-alpine`): Minimal image containing only the compiled artifacts and Node.js runtime.

**Estimated build time**: 3–8 minutes (faster on subsequent builds due to layer caching).

**Layer caching strategy**: Dependency manifests (`package.json`, `pnpm-lock.yaml`) are copied before source code. Changing application code does not invalidate the dependency installation layer.

## Development Deployment

Use the default `docker-compose.yml` for local development:

```bash
# Start both server and dashboard
docker compose up -d

# View logs
docker compose logs -f

# Rebuild after Dockerfile changes
docker compose up -d --build

# Stop all services
docker compose down
```

The development setup runs:

| Service | Port | Command |
|---------|------|---------|
| Server API | `3000` | `pnpm run dev --filter @eata/server` (tsx watch) |
| Dashboard | `5173` | `pnpm run dev --filter @eata/dashboard` (vite HMR) |

## Production Deployment

### Using docker-compose.prod.yml

The production compose file uses the pre-built image and configures:

- Resource limits (memory, CPU)
- Persistent volume for SQLite database
- Health check-based service ordering
- `restart: unless-stopped` for reliability

```bash
# Create environment file
cp .env.example .env.production
# Edit .env.production with your values (see Environment Variables section)

# Pull or build the image
docker build -t eata:latest .

# Start production services
docker compose --env-file .env.production -f docker-compose.prod.yml up -d

# Check status
docker compose -f docker-compose.prod.yml ps

# View logs
docker compose -f docker-compose.prod.yml logs -f server

# Graceful shutdown
docker compose -f docker-compose.prod.yml down
```

### Using Published Images

If images are published to a container registry:

```bash
# Pull the latest image
docker pull your-registry.com/eata:latest

# Tag for local use
docker tag your-registry.com/eata:latest eata:latest

# Start normally
docker compose -f docker-compose.prod.yml up -d
```

### Volume Management

SQLite database and provider configuration persist across restarts via the `eata-data` Docker volume:

```bash
# List volumes
docker volume ls | grep eata

# Inspect volume
docker volume inspect eata-prod_eata-data

# Backup volume
docker run --rm -v eata_prod_eata-data:/data -v $(pwd):/backup \
  alpine tar czf /backup/eata-backup-$(date +%Y%m%d).tar.gz -C /data .

# Remove volume (destroys data!)
docker volume rm eata_prod_eata-data
```

## Environment Variables

### Required

| Variable | Description | Example |
|----------|-------------|---------|
| `OPENAI_API_KEY` | LLM API key for the default provider | `sk-...` |

### Optional

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Set to `production` for production mode |
| `PORT` | `3000` | Server API listen port |
| `LOG_LEVEL` | `info` | Pino log level (`debug`, `info`, `warn`, `error`) |
| `OPENAI_BASE_URL` | — | Override LLM endpoint (for non-OpenAI providers) |
| `LLM_MODEL` | `gpt-4o` | Default model name |
| `PROVIDER_ID` | — | Use a specific configured provider by ID |
| `VITE_API_URL` | `http://localhost:3000` | API URL the dashboard connects to |
| `SERVER_PORT` | `3000` | Host port mapping for the server |
| `DASHBOARD_PORT` | `5173` | Host port mapping for the dashboard |

### Example `.env.production`

```env
NODE_ENV=production
OPENAI_API_KEY=sk-your-key-here
LLM_MODEL=gpt-4o
LOG_LEVEL=info
VITE_API_URL=http://localhost:3000
```

## Health Check Endpoints

### Server Health Check

```
GET /health
```

Response:

```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00.000Z"
}
```

The Dockerfile includes a `HEALTHCHECK` instruction that polls this endpoint every 30 seconds. Docker Compose also uses it to determine service readiness for dependency ordering.

### Manual Verification

```bash
# From host (after port mapping)
curl -s http://localhost:3000/health | jq

# From inside the container
docker exec eata-server-prod wget -qO- http://localhost:3000/health

# Check container health status
docker inspect --format='{{.State.Health.Status}}' eata-server-prod
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/api/tasks` | List tasks |
| `POST` | `/api/tasks` | Create task |
| `GET` | `/api/reports` | List reports |
| `GET` | `/api/reports/:id` | Get report details |
| `GET` | `/api/providers` | List LLM providers |
| `POST` | `/api/providers/:id/test` | Test provider connection |

## Limitations (T28)

The Docker image has the following intentional limitations:

### No Playwright Browsers

The image does **not** include Playwright browser binaries (~2 GB). Running `npx playwright install` inside the container is not recommended as it drastically increases image size.

**Workaround**: Playwright-based tests must run on the host machine or in a dedicated CI image with browsers pre-installed.

### No Electron App Execution

Alpine Linux uses **musl libc**, while Electron ships **glibc** binaries. These are incompatible — Electron applications cannot run inside the container.

**Implication**: EATA cannot test Electron apps when running in Docker. The Electron test target must run on the host, and the containerized EATA server must connect to it remotely (if supported by your network configuration).

### better-sqlite3 Native Module

The `better-sqlite3` native Node.js addon is compiled during the **builder stage** using the Alpine toolchain. The compiled `.node` binary is copied to the runtime stage. This means:

- The runtime image does not need build tools
- The native module is tied to the specific Node.js version and Alpine architecture
- Cross-platform image builds are not supported (e.g., building an `arm64` image from an `amd64` host requires `--platform`)

### Dashboard Dev Server

The dashboard uses Vite's dev server in the default `CMD`. For production:

- The built static assets are available at `apps/dashboard/dist/` after build
- Consider serving them via nginx or the Eata server itself
- Use `vite preview` (as configured in `docker-compose.prod.yml`) for a lightweight production server

## Troubleshooting

### Image Build Fails — "no space left on device"

```bash
docker system prune -a   # Remove unused images and build cache
docker volume prune       # Remove unused volumes
```

### Container Crashes — "better-sqlite3: cannot open shared object file"

This indicates the native module was compiled for a different architecture. Rebuild:

```bash
docker build --no-cache -t eata .
```

### Health Check Failing

```bash
# Check logs for startup errors
docker compose -f docker-compose.prod.yml logs server

# Test health endpoint manually
docker exec -it eata-server-prod wget -qO- http://localhost:3000/health

# Check if port 3000 is actually listening
docker exec -it eata-server-prod netstat -tlnp
```

### Volume Permission Denied (Linux)

```bash
# Ensure the volume directory is owned by the app user
docker run --rm -v eata_prod_eata-data:/data alpine chown -R 1001:1001 /data
```

### Outdated Image After Pull

```bash
# Force rebuild
docker compose -f docker-compose.prod.yml up -d --build

# Or pull fresh and recreate
docker pull eata:latest
docker compose -f docker-compose.prod.yml up -d --force-recreate
```
