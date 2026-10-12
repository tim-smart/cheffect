# Cheffect - a local-first recipe manager

- Manage your recipes locally on your devices
- Make meal plans for the week
- Create menus for quickly scheduling multiple meals
- Build grocery lists from your recipes & meal plans
- Extract recipes from URLs using AI
- Convert ingredient quantities for different countries using AI
- Smart grocery list organization and merging with AI
- AI chat assistant for cooking help
- Optionally sync your data across devices (powered by
  [LiveStore](https://livestore.dev) & [Cloudflare
  Workers](https://workers.cloudflare.com/))

<img src="/public/screenshots/android.jpg" alt="Cheffect Screenshot" width="300" />

## Docker Deployment

You can self-host Cheffect using Docker. The Docker image serves the static web application using nginx.

### Building the Docker Image

Build the image with the default sync server (`wss://cheffect-sync.timsmart.workers.dev`):

```bash
docker build -t cheffect .
```

Or build with a custom sync server URL:

```bash
docker build --build-arg VITE_SYNC_SERVER_URL=wss://your-sync-server.example.com -t cheffect .
```

### Running the Container

Run with the default sync server:

```bash
docker run -d -p 8080:80 --name cheffect cheffect
```

The application will be available at http://localhost:8080

### Docker Compose Example

```yaml
version: "3.8"

services:
  cheffect:
    build:
      context: .
      args:
        VITE_SYNC_SERVER_URL: wss://your-sync-server.example.com
    ports:
      - "8080:80"
    restart: unless-stopped
```

## Tests

```bash
pnpm test
```

Runs the unit tests: the LiveStore event wire-format fixtures and the regression
tests for the patched Effect AI packages. CI runs them on every pull request.

### Browser regression checks

`pnpm test:e2e` starts the dev server and drives a browser over the DevTools
protocol to check that edits and deletes made on a directly opened page are
persisted. These are not run in CI. Run them by hand against a release build of
Google Chrome before accepting changes to LiveStore, the store atoms or the edit
and delete flows.

For acceptance runs, set `E2E_REQUIRE_BROWSER=1` so a missing browser fails
instead of skipping the tests. An explicitly set `CHROMIUM_PATH` also fails if
the executable is unavailable or its `--version` check fails. Without either
setting, a missing default `chromium` still skips the tests for local development;
that is not an acceptance check.

```bash
(
  set -euo pipefail
  CHROMIUM_PATH=$(command -v google-chrome-stable) || {
    echo "google-chrome-stable not found, not running the browser checks" >&2
    exit 1
  }
  export CHROMIUM_PATH E2E_REQUIRE_BROWSER=1
  "$CHROMIUM_PATH" --version
  pnpm test:e2e
)
```

With Nix, run it inside
`NIXPKGS_ALLOW_UNFREE=1 nix shell --impure nixpkgs#google-chrome`.

A `BrowserCrashError` is a browser failure, not a passing run. Its minidump is
copied to `test-results/e2e-crashes/`. Rerun, and report the crash separately
from assertion failures.

## License

MIT License
