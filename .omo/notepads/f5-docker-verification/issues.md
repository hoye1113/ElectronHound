# F5 Docker Verification — Issues

## Minor (Non-blocking)

### 1. .dockerignore excludes all *.md files
- `*.md` is excluded from build context (line 36)
- This means DEPLOYMENT.md and README.md are not available inside the image
- Not a real problem: documentation is meant for human use outside containers
- Severity: **informational**

### 2. Dockerfile USER instruction commented out
- Line 94: `# USER appuser` — container runs as root by default
- The non-root user (appuser:1001) is created but not activated
- Rationale documented in comment (volume mount permission issues)
- Severity: **low** — acceptable trade-off, can be enabled later

### 3. Runtime image includes devDependencies
- Line 76: `COPY --from=builder /app/node_modules ./node_modules` copies ALL node_modules
- Dockerfile comment acknowledges this as optimization opportunity
- A dedicated `--prod` stage could reduce image size
- Severity: **low** — acknowledged future improvement, not blocking
